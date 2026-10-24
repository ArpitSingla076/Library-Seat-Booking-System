const express = require('express');
const { protect, restrictTo } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const Waitlist = require('../models/Waitlist');
const Booking = require('../models/Booking');
const Seat = require('../models/Seat');

const router = express.Router();
router.use(protect, restrictTo('student'));

// POST /api/waitlist { seatId, startTime, endTime }
router.post('/', async (req, res, next) => {
  try {
    const start = new Date(req.body.startTime);
    const end = new Date(req.body.endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return next(new AppError('Invalid time window.', 400));
    if (end <= new Date()) return next(new AppError('That time has already passed.', 400));
    const seat = await Seat.findById(req.body.seatId);
    if (!seat) return next(new AppError('Seat not found.', 404));

    const taken = await Booking.exists({ seat: seat._id, status: 'active', startTime: { $lt: end }, endTime: { $gt: start } });
    if (!taken) return next(new AppError('That seat is free right now - you can book it directly.', 400));

    if ((await Waitlist.countDocuments({ user: req.user._id, notified: false, endTime: { $gt: new Date() } })) >= 10) {
      return next(new AppError('You can wait for at most 10 seats at a time.', 400));
    }
    try {
      await Waitlist.create({ user: req.user._id, seat: seat._id, startTime: start, endTime: end });
    } catch (err) {
      if (err.code === 11000) return next(new AppError('You are already on the waiting list for this seat and time.', 409));
      throw err;
    }
    res.status(201).json({ success: true, message: `We'll notify you if seat ${seat.seatNumber} becomes free.` });
  } catch (err) { next(err); }
});

// GET /api/waitlist
router.get('/', async (req, res, next) => {
  try {
    const entries = await Waitlist.find({ user: req.user._id, endTime: { $gt: new Date() } })
      .populate('seat', 'seatNumber').sort({ startTime: 1 });
    res.json({ success: true, entries });
  } catch (err) { next(err); }
});

// DELETE /api/waitlist/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const r = await Waitlist.deleteOne({ _id: req.params.id, user: req.user._id });
    if (!r.deletedCount) return next(new AppError('Entry not found.', 404));
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
