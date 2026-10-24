const express = require('express');
const { body, validationResult } = require('express-validator');
const Seat = require('../models/Seat');
const Section = require('../models/Section');
const Booking = require('../models/Booking');
const { protect, restrictTo } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { emitSeatUpdate } = require('../config/socket');
const { cancelBookingsForSeat } = require('../services/bookingService');
const { audit } = require('../services/auditService');
const { SLOT_MS, floorToSlot } = require('../utils/slots');

const router = express.Router();

const handleValidation = (req, _res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return next(new AppError(errors.array()[0].msg, 400));
  next();
};

// GET /api/seats?sectionId=&startTime=&endTime=
// Availability is computed per time window: isBookedForSlot / bookedByMe describe that window.
router.get('/', protect, async (req, res, next) => {
  try {
    const { sectionId } = req.query;
    const filter = {};
    if (sectionId) filter.section = sectionId;

    let start = req.query.startTime ? new Date(req.query.startTime) : null;
    let end = req.query.endTime ? new Date(req.query.endTime) : null;
    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      start = floorToSlot(new Date());
      end = new Date(start.getTime() + SLOT_MS);
    }

    const isAdmin = req.user.role === 'admin';
    const [seats, overlapping] = await Promise.all([
      Seat.find(filter)
        .select(isAdmin ? '' : '-qrToken')
        .populate('section', 'name floor description amenities isActive')
        .sort({ section: 1, row: 1, col: 1, seatNumber: 1 })
        .lean(),
      Booking.find({ status: 'active', startTime: { $lt: end }, endTime: { $gt: start } }).select('seat user').lean(),
    ]);

    const booked = new Set();
    const mine = new Set();
    overlapping.forEach((b) => {
      booked.add(b.seat.toString());
      if (b.user.toString() === req.user._id.toString()) mine.add(b.seat.toString());
    });

    const result = seats.map((s) => ({
      ...s,
      isBookedForSlot: booked.has(s._id.toString()),
      bookedByMe: mine.has(s._id.toString()),
    }));

    res.json({ success: true, count: result.length, window: { startTime: start, endTime: end }, seats: result });
  } catch (err) {
    next(err);
  }
});

// GET /api/seats/sections
router.get('/sections', protect, async (req, res, next) => {
  try {
    const filter = req.user.role === 'admin' && req.query.all === 'true' ? {} : { isActive: true };
    const sections = await Section.find(filter).sort({ floor: 1, name: 1 });
    res.json({ success: true, sections });
  } catch (err) {
    next(err);
  }
});

// ---- Admin: sections ----
const sectionRules = [
  body('name').trim().notEmpty().withMessage('Section name is required'),
  body('floor').optional().isInt({ min: 0 }).withMessage('Floor must be a number'),
  body('amenities').optional().isArray(),
];

router.post('/sections', protect, restrictTo('admin'), sectionRules, handleValidation, async (req, res, next) => {
  try {
    const { name, description, floor, amenities, isActive } = req.body;
    const section = await Section.create({ name, description, floor, amenities, isActive });
    audit(req, 'section.create', 'Section', section._id, section.name);
    res.status(201).json({ success: true, section });
  } catch (err) {
    next(err);
  }
});

router.put('/sections/:id', protect, restrictTo('admin'), sectionRules, handleValidation, async (req, res, next) => {
  try {
    const { name, description, floor, amenities, isActive } = req.body;
    const section = await Section.findByIdAndUpdate(
      req.params.id,
      { name, description, floor, amenities, isActive },
      { new: true, runValidators: true }
    );
    if (!section) return next(new AppError('Section not found.', 404));
    emitSeatUpdate({ type: 'UPDATED' });
    audit(req, 'section.update', 'Section', section._id, section.name);
    res.json({ success: true, section });
  } catch (err) {
    next(err);
  }
});

router.delete('/sections/:id', protect, restrictTo('admin'), async (req, res, next) => {
  try {
    if (await Seat.countDocuments({ section: req.params.id })) {
      return next(new AppError('Remove or move all seats in this section before deleting it.', 400));
    }
    const section = await Section.findByIdAndDelete(req.params.id);
    if (!section) return next(new AppError('Section not found.', 404));
    audit(req, 'section.delete', 'Section', section._id, section.name);
    res.json({ success: true, message: 'Section deleted.' });
  } catch (err) {
    next(err);
  }
});

// GET /api/seats/:id
router.get('/:id', protect, async (req, res, next) => {
  try {
    const seat = await Seat.findById(req.params.id)
      .select(req.user.role === 'admin' ? '' : '-qrToken')
      .populate('section', 'name floor');
    if (!seat) return next(new AppError('Seat not found.', 404));
    res.json({ success: true, seat });
  } catch (err) {
    next(err);
  }
});

// ---- Admin: seats ----
router.post(
  '/',
  protect,
  restrictTo('admin'),
  [
    body('seatNumber').trim().notEmpty().withMessage('Seat number is required'),
    body('section').isMongoId().withMessage('Valid section ID required'),
    body('row').optional().isInt({ min: 1 }),
    body('col').optional().isInt({ min: 1 }),
    body('amenities').optional().isArray(),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      if (!(await Section.findById(req.body.section))) return next(new AppError('Section not found.', 404));
      const { seatNumber, section, row, col, amenities, kind, capacity } = req.body;
      const isRoom = kind === 'room';
      const seat = await Seat.create({ seatNumber, section, row, col, amenities, kind: isRoom ? 'room' : 'seat', capacity: isRoom ? Math.max(2, Number(capacity) || 6) : 1 });
      audit(req, 'seat.create', 'Seat', seat._id, `${seat.seatNumber}${isRoom ? ' (room)' : ''}`);
      await seat.populate('section', 'name floor');
      emitSeatUpdate({ type: 'UPDATED', seatId: seat._id.toString() });
      res.status(201).json({ success: true, seat });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/seats/bulk  { section, prefix, count, columns, startNumber }
router.post('/bulk', protect, restrictTo('admin'), async (req, res, next) => {
  try {
    const { section, prefix = '', count, columns = 5, startNumber = 1 } = req.body;
    const n = parseInt(count, 10);
    if (!(n >= 1 && n <= 200)) return next(new AppError('Count must be between 1 and 200.', 400));
    if (!(await Section.findById(section))) return next(new AppError('Section not found.', 404));
    const cols = Math.min(Math.max(parseInt(columns, 10) || 5, 1), 30);
    const existing = await Seat.find({ section }).select('row').lean();
    const rowOffset = existing.reduce((m, s) => Math.max(m, s.row || 0), 0);
    const start = parseInt(startNumber, 10) || 1;

    const docs = Array.from({ length: n }, (_, i) => ({
      seatNumber: `${String(prefix).trim().toUpperCase()}${String(start + i).padStart(2, '0')}`,
      section,
      row: rowOffset + Math.floor(i / cols) + 1,
      col: (i % cols) + 1,
    }));
    const result = await Seat.insertMany(docs, { ordered: false }).catch((err) => {
      if (err.writeErrors || err.insertedDocs) return err.insertedDocs || [];
      throw err;
    });
    const made = Array.isArray(result) ? result.length : 0;
    audit(req, 'seat.bulk_create', 'Section', section, `${made} of ${n} seats, prefix "${prefix}"`);
    emitSeatUpdate({ type: 'UPDATED' });
    res.status(201).json({ success: true, created: made, skipped: n - made });
  } catch (err) { next(err); }
});

router.put('/:id', protect, restrictTo('admin'), async (req, res, next) => {
  try {
    const allowed = ['isMaintenance', 'maintenanceNote', 'amenities', 'seatNumber', 'row', 'col', 'capacity'];
    const updates = {};
    allowed.forEach((f) => {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    });
    if (updates.isMaintenance === false) updates.maintenanceNote = null;

    const seat = await Seat.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true }).populate('section', 'name floor');
    if (!seat) return next(new AppError('Seat not found.', 404));

    let cancelled = 0;
    if (updates.isMaintenance === true) {
      cancelled = await cancelBookingsForSeat({ seatId: seat._id, requestingUser: req.user, reason: 'Seat moved to maintenance' });
    }
    emitSeatUpdate({ type: 'UPDATED', seatId: seat._id.toString() });
    if (updates.isMaintenance !== undefined) audit(req, updates.isMaintenance ? 'seat.maintenance_on' : 'seat.maintenance_off', 'Seat', seat._id, `${seat.seatNumber}${cancelled ? `, ${cancelled} booking(s) cancelled` : ''}`);
    res.json({ success: true, seat, cancelledBookings: cancelled });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', protect, restrictTo('admin'), async (req, res, next) => {
  try {
    const seat = await Seat.findById(req.params.id);
    if (!seat) return next(new AppError('Seat not found.', 404));
    if (await Booking.countDocuments({ seat: seat._id, status: 'active', endTime: { $gt: new Date() } })) {
      return next(new AppError('Cannot delete a seat that has active or upcoming bookings.', 400));
    }
    await seat.deleteOne();
    audit(req, 'seat.delete', 'Seat', seat._id, seat.seatNumber);
    emitSeatUpdate({ type: 'UPDATED' });
    res.json({ success: true, message: 'Seat deleted.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
