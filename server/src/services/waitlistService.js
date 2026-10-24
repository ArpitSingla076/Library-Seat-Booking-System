const Waitlist = require('../models/Waitlist');
const Booking = require('../models/Booking');
const Seat = require('../models/Seat');
const { notify } = require('./notificationService');
const logger = require('../utils/logger');

/**
 * Called whenever a seat is released. Tells waiting students whose requested window is now free.
 */
const notifyWaitlist = async (seatId) => {
  try {
    const seat = await Seat.findById(seatId).select('seatNumber isMaintenance');
    if (!seat || seat.isMaintenance) return;
    const entries = await Waitlist.find({ seat: seatId, notified: false, endTime: { $gt: new Date() } });
    for (const e of entries) {
      const clash = await Booking.exists({ seat: seatId, status: 'active', startTime: { $lt: e.endTime }, endTime: { $gt: e.startTime } });
      if (clash) continue;
      const claimed = await Waitlist.updateOne({ _id: e._id, notified: false }, { $set: { notified: true } });
      if (!claimed.modifiedCount) continue;
      await notify(e.user, {
        type: 'success',
        message: `Seat ${seat.seatNumber} is now free for ${e.startTime.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}. Book it before someone else does!`,
      });
    }
  } catch (err) {
    logger.error(`notifyWaitlist failed: ${err.message}`);
  }
};

module.exports = { notifyWaitlist };
