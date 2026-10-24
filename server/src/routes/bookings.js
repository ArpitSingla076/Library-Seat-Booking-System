const express = require('express');
const { body, validationResult } = require('express-validator');
const { protect, restrictTo } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { createBooking, createRecurringBookings, cancelBooking, checkIn, checkInByQr, checkOut, extendBooking, unpaidFineFilter } = require('../services/bookingService');
const { createOrder, verifyOrder } = require('../services/paymentService');
const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const { Types } = require('mongoose');

const router = express.Router();

const handleValidation = (req, _res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return next(new AppError(errors.array()[0].msg, 400));
  next();
};

const populateBooking = (q) =>
  q.populate('seat', 'seatNumber amenities row col kind capacity').populate('section', 'name floor description');

// POST /api/bookings
router.post(
  '/',
  protect,
  restrictTo('student'),
  [
    body('seatId').isMongoId().withMessage('Valid seat ID required'),
    body('startTime').isISO8601().withMessage('Valid startTime (ISO8601) required'),
    body('endTime').isISO8601().withMessage('Valid endTime (ISO8601) required'),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const common = {
        userId: req.user._id,
        seatId: req.body.seatId,
        startTime: req.body.startTime,
        endTime: req.body.endTime,
        groupSize: req.body.groupSize,
      };
      const weeks = parseInt(req.body.repeatWeeks, 10);
      if (weeks > 1) {
        const result = await createRecurringBookings({ ...common, weeks });
        return res.status(201).json({ success: true, booking: result.created[0], created: result.created.length, skipped: result.skipped });
      }
      const booking = await createBooking(common);
      res.status(201).json({ success: true, booking });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/bookings/my
router.get('/my', protect, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 100);
    const filter = { user: req.user._id };
    if (req.query.status) filter.status = req.query.status;

    const [bookings, total] = await Promise.all([
      populateBooking(Booking.find(filter)).sort({ startTime: -1 }).skip((page - 1) * limit).limit(limit),
      Booking.countDocuments(filter),
    ]);
    res.json({ success: true, total, page, pages: Math.ceil(total / limit), bookings });
  } catch (err) {
    next(err);
  }
});

// GET /api/bookings/active - upcoming + in-progress bookings (soonest first)
router.get('/active', protect, async (req, res, next) => {
  try {
    const bookings = await populateBooking(
      Booking.find({ user: req.user._id, status: 'active', endTime: { $gt: new Date() } })
    ).sort({ startTime: 1 });
    res.json({ success: true, bookings, booking: bookings[0] || null });
  } catch (err) {
    next(err);
  }
});

// GET /api/bookings/fines/my?fineStatus=unpaid|paid|waived&page=  (+ totals for the whole account)
router.get('/fines/my', protect, async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 100);
    const filter = { user: req.user._id, fineAmount: { $gt: 0 } };
    if (req.query.fineStatus === 'unpaid') Object.assign(filter, unpaidFineFilter(req.user._id));
    if (req.query.fineStatus === 'paid') filter.finePaid = true;
    if (req.query.fineStatus === 'waived') filter.fineWaived = true;

    const [bookings, total, sums] = await Promise.all([
      populateBooking(Booking.find(filter)).sort({ startTime: -1 }).skip((page - 1) * limit).limit(limit),
      Booking.countDocuments(filter),
      Booking.aggregate([
        { $match: unpaidFineFilter(new Types.ObjectId(String(req.user._id))) },
        { $group: { _id: null, amount: { $sum: '$fineAmount' }, count: { $sum: 1 } } },
      ]),
    ]);
    res.json({ success: true, total, page, pages: Math.ceil(total / limit), bookings, summary: { unpaidAmount: sums[0]?.amount || 0, unpaidCount: sums[0]?.count || 0 } });
  } catch (err) { next(err); }
});

// GET /api/bookings/payments/my - receipts
router.get('/payments/my', protect, async (req, res, next) => {
  try {
    const payments = await Payment.find({ user: req.user._id })
      .populate({ path: 'booking', select: 'startTime fineReason seat', populate: { path: 'seat', select: 'seatNumber' } })
      .sort({ createdAt: -1 })
      .limit(100);
    res.json({ success: true, payments });
  } catch (err) {
    next(err);
  }
});

// POST /api/bookings/payments/create-order  { bookingId? }  (no bookingId = pay all unpaid fines)
router.post('/payments/create-order', protect, async (req, res, next) => {
  try {
    res.json({ success: true, ...(await createOrder({ userId: req.user._id, bookingId: req.body.bookingId })) });
  } catch (err) { next(err); }
});

// POST /api/bookings/payments/verify  { orderRef, paymentId?, signature?, method? }
router.post('/payments/verify', protect, async (req, res, next) => {
  try {
    const payments = await verifyOrder({
      userId: req.user._id, orderRef: req.body.orderRef, paymentId: req.body.paymentId,
      signature: req.body.signature, method: req.body.method,
    });
    res.json({ success: true, message: 'Payment successful.', payments });
  } catch (err) { next(err); }
});

// POST /api/bookings/checkin-by-qr  { qrToken }
router.post('/checkin-by-qr', protect, async (req, res, next) => {
  try {
    const booking = await checkInByQr({ userId: req.user._id, qrToken: req.body.qrToken });
    res.json({ success: true, message: 'Checked in successfully.', booking });
  } catch (err) {
    next(err);
  }
});

// POST /api/bookings/:id/checkin  { qrToken? }
router.post('/:id/checkin', protect, async (req, res, next) => {
  try {
    const booking = await checkIn({ bookingId: req.params.id, userId: req.user._id, qrToken: req.body.qrToken });
    res.json({ success: true, message: 'Checked in successfully.', booking });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/checkout', protect, async (req, res, next) => {
  try {
    const booking = await checkOut({ bookingId: req.params.id, userId: req.user._id });
    res.json({ success: true, message: 'Checked out successfully.', booking });
  } catch (err) {
    next(err);
  }
});

// POST /api/bookings/:id/extend  { minutes }
router.post('/:id/extend', protect, async (req, res, next) => {
  try {
    const booking = await extendBooking({ bookingId: req.params.id, userId: req.user._id, minutes: req.body.minutes });
    res.json({ success: true, message: 'Booking extended.', booking });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/bookings/:id
router.delete('/:id', protect, async (req, res, next) => {
  try {
    const booking = await cancelBooking({ bookingId: req.params.id, requestingUser: req.user, reason: req.body.reason || null });
    res.json({ success: true, message: 'Booking cancelled.', booking });
  } catch (err) {
    next(err);
  }
});

// GET /api/bookings/:id
router.get('/:id', protect, async (req, res, next) => {
  try {
    const booking = await populateBooking(Booking.findById(req.params.id)).populate('user', 'name email studentId');
    if (!booking) return next(new AppError('Booking not found.', 404));
    if (req.user.role !== 'admin' && booking.user._id.toString() !== req.user._id.toString()) {
      return next(new AppError('Not authorized.', 403));
    }
    res.json({ success: true, booking });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
