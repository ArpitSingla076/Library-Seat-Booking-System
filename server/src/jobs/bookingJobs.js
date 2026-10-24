const cron = require('node-cron');
const Booking = require('../models/Booking');
const User = require('../models/User');
const { emitSeatUpdate } = require('../config/socket');
const { notify } = require('../services/notificationService');
const { notifyWaitlist } = require('../services/waitlistService');
const { getSettings } = require('../services/settingsService');
const email = require('../services/emailService');
const logger = require('../utils/logger');

const notifyFine = async (booking) => {
  if (!booking || !(booking.fineAmount > 0)) return;
  notify(booking.user, { type: 'error', message: `A fine of ₹${booking.fineAmount} was added: ${booking.fineReason}` });
  const populated = await Booking.findById(booking._id).populate('user', 'name email').populate('seat', 'seatNumber');
  if (populated?.user) email.sendFineAlert(populated.user, populated, populated.seat);
};

/** Block repeat offenders automatically (if enabled in Settings). */
const maybeAutoBlock = async (userId) => {
  const settings = await getSettings();
  if (!settings.autoBlockNoShows) return;
  const since = new Date(Date.now() - settings.autoBlockDays * 24 * 3600 * 1000);
  const count = await Booking.countDocuments({ user: userId, status: 'no_show', startTime: { $gte: since } });
  if (count < settings.autoBlockNoShows) return;
  const user = await User.findById(userId);
  if (!user || user.isBlocked || user.role === 'admin') return;
  user.isBlocked = true;
  user.blockedReason = `Auto-blocked: ${count} no-shows in ${settings.autoBlockDays} days`;
  user.blockedAt = new Date();
  await user.save({ validateBeforeSave: false });
  logger.warn(`Auto-blocked user ${userId} (${count} no-shows)`);
};

/** Active bookings that were never checked in before the deadline => no_show + fine. */
const cancelNoShows = async () => {
  const settings = await getSettings();
  const candidates = await Booking.find({
    status: 'active',
    checkInRequired: true,
    checkInTime: null,
    checkInDeadline: { $lte: new Date() },
  }).select('_id');

  let count = 0;
  for (const c of candidates) {
    const updated = await Booking.findOneAndUpdate(
      { _id: c._id, status: 'active', checkInTime: null },
      {
        $set: {
          status: 'no_show',
          cancellationReason: 'Auto-cancelled: no check-in within grace period',
          fineAmount: settings.noShowFine,
          fineReason: 'No-show violation: did not check in within grace period',
        },
      },
      { new: true }
    );
    if (updated) {
      count += 1;
      emitSeatUpdate({ type: 'AVAILABLE', seatId: updated.seat.toString() });
      notifyWaitlist(updated.seat);
      await notifyFine(updated);
      await maybeAutoBlock(updated.user);
    }
  }
  if (count) logger.info(`Auto-cancelled ${count} no-show booking(s).`);
};

/** Bookings whose end time passed: checked-in but never checked out => overstay fine. */
const expireEndedBookings = async () => {
  const settings = await getSettings();
  const ended = await Booking.find({ status: 'active', endTime: { $lte: new Date() } }).select('_id checkInTime');

  let count = 0;
  for (const e of ended) {
    const set = e.checkInTime
      ? { status: 'expired', fineAmount: settings.overstayFine, fineReason: 'Overstay violation: did not check out before booking end time' }
      : { status: 'no_show', fineAmount: settings.noShowFine, fineReason: 'No-show violation: did not check in within grace period' };
    const updated = await Booking.findOneAndUpdate({ _id: e._id, status: 'active' }, { $set: set }, { new: true });
    if (updated) {
      count += 1;
      emitSeatUpdate({ type: 'AVAILABLE', seatId: updated.seat.toString() });
      notifyWaitlist(updated.seat);
      await notifyFine(updated);
      if (updated.status === 'no_show') await maybeAutoBlock(updated.user);
    }
  }
  if (count) logger.info(`Expired ${count} booking(s).`);
};

/** Reminder shortly before a booking starts (email + live notification). */
const sendReminders = async () => {
  const settings = await getSettings();
  if (!settings.reminderMinutes) return;
  const now = new Date();
  const soon = new Date(now.getTime() + settings.reminderMinutes * 60000);
  const due = await Booking.find({
    status: 'active',
    reminderSent: false,
    checkInTime: null,
    startTime: { $gt: now, $lte: soon },
    // no reminder for a booking made a moment ago (the confirmation email just went out)
    createdAt: { $lte: new Date(now.getTime() - 5 * 60000) },
  }).populate('seat', 'seatNumber');

  for (const b of due) {
    const claimed = await Booking.updateOne({ _id: b._id, reminderSent: false }, { $set: { reminderSent: true } });
    if (!claimed.modifiedCount) continue;
    const user = await User.findById(b.user);
    notify(b.user, { type: 'info', message: `Your booking for seat ${b.seat?.seatNumber || ''} starts soon. Remember to check in!` });
    if (user) email.sendBookingReminder(user, b, b.seat);
  }
};

/** Reminder shortly before a checked-in booking ends: check out (or extend). */
const sendCheckoutReminders = async () => {
  const settings = await getSettings();
  if (!settings.checkoutReminderMinutes) return;
  const now = new Date();
  const soon = new Date(now.getTime() + settings.checkoutReminderMinutes * 60000);
  const due = await Booking.find({
    status: 'active',
    checkoutReminderSent: false,
    checkInTime: { $ne: null },
    endTime: { $gt: now, $lte: soon },
  }).populate('seat', 'seatNumber kind');

  for (const b of due) {
    const claimed = await Booking.updateOne({ _id: b._id, checkoutReminderSent: false }, { $set: { checkoutReminderSent: true } });
    if (!claimed.modifiedCount) continue;
    const user = await User.findById(b.user);
    notify(b.user, { type: 'info', message: `Your booking for seat ${b.seat?.seatNumber || ''} ends soon. Check out when you leave, or extend if you need more time.` });
    if (user) email.sendCheckoutReminder(user, b, b.seat);
  }
};

let running = false;

const runAll = async () => {
  if (running) return;
  running = true;
  try {
    await sendReminders();
    await sendCheckoutReminders();
    await cancelNoShows();
    await expireEndedBookings();
  } catch (err) {
    logger.error(`Cron job error: ${err.message}`);
  } finally {
    running = false;
  }
};

const startCronJobs = () => {
  cron.schedule('* * * * *', runAll);
  logger.info('Cron jobs started: check-in/check-out reminders + no-show cancellation + expiry (every 1 minute)');
};

module.exports = { startCronJobs, cancelNoShows, expireEndedBookings, sendReminders, sendCheckoutReminders, runAll };
