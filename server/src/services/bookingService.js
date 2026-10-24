const Booking = require('../models/Booking');
const Seat = require('../models/Seat');
const User = require('../models/User');
const { AppError } = require('../middleware/errorHandler');
const crypto = require('crypto');
const { emitSeatUpdate } = require('../config/socket');
const { notify } = require('./notificationService');
const { notifyWaitlist } = require('./waitlistService');
const { parts, dayStart, fmtMinutes } = require('../utils/timeUtil');
const { getSettings } = require('./settingsService');
const email = require('./emailService');
const { toSlots, isSlotAligned, SLOT_MS } = require('../utils/slots');
const logger = require('../utils/logger');

const timeLabel = (date, tz) => date.toLocaleTimeString('en-IN', { timeZone: tz || 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' });

const unpaidFineFilter = (userId) => ({
  user: userId,
  fineAmount: { $gt: 0 },
  finePaid: false,
  fineWaived: { $ne: true },
});

// MongoDB unique-index violation on (seat,slots) or (user,slots) => overlapping booking
const translateDuplicate = (err) => {
  if (err && err.code === 11000) {
    const pattern = err.keyPattern || {};
    const msg = String(err.message || '');
    if (pattern.seat || msg.includes('uniq_active_seat_slot')) {
      return new AppError('This seat is already booked for part of the selected time. Pick another seat or time.', 409);
    }
    return new AppError('You already have a booking that overlaps this time.', 409);
  }
  return err;
};

/**
 * Create a booking for a seat and time window.
 * Overlap protection is enforced atomically by MongoDB unique partial indexes on slot numbers
 * (see models/Booking.js), so it is safe under concurrent requests with or without transactions.
 */
const createBooking = async ({ userId, seatId, startTime, endTime, groupSize = 1, recurrenceId = null, sendEmail = true }) => {
  const settings = await getSettings();
  const start = new Date(startTime);
  const end = new Date(endTime);
  const now = new Date();

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new AppError('Invalid start or end time.', 400);
  if (!isSlotAligned(start) || !isSlotAligned(end)) {
    throw new AppError('Bookings must start and end on the hour or half hour (e.g. 10:00 or 10:30).', 400);
  }
  if (end <= start) throw new AppError('End time must be after start time.', 400);
  if (end <= now) throw new AppError('This time slot has already ended.', 400);
  if (start.getTime() < now.getTime() - SLOT_MS) throw new AppError('Start time cannot be in the past.', 400);

  const minutes = (end - start) / 60000;
  if (minutes < 30) throw new AppError('Minimum booking duration is 30 minutes.', 400);
  if (minutes > settings.maxDurationHours * 60) {
    throw new AppError(`Maximum booking duration is ${settings.maxDurationHours} hours.`, 400);
  }
  if (start.getTime() > now.getTime() + settings.advanceBookingDays * 24 * 3600 * 1000) {
    throw new AppError(`You can only book up to ${settings.advanceBookingDays} days in advance.`, 400);
  }

  // Library calendar: closed weekdays, holidays and opening hours (library time zone)
  const tz = settings.timezone || 'Asia/Kolkata';
  const startLocal = parts(start, tz);
  if ((settings.closedWeekdays || []).includes(startLocal.weekday)) {
    throw new AppError('The library is closed on that day of the week.', 400);
  }
  if ((settings.holidays || []).includes(startLocal.dayKey)) {
    throw new AppError('The library is closed on that date (holiday).', 400);
  }
  if (settings.hoursEnabled) {
    const endMinutes = (end.getTime() - dayStart(start, tz).getTime()) / 60000;
    if (startLocal.minutes < settings.openMinutes || endMinutes > settings.closeMinutes) {
      throw new AppError(`The library is open ${fmtMinutes(settings.openMinutes)} - ${fmtMinutes(settings.closeMinutes)}. Choose a time within opening hours.`, 400);
    }
  }

  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found.', 404);
  if (settings.requireVerifiedEmail && !user.emailVerified) {
    throw new AppError('Please verify your email address (Profile page) before booking.', 403);
  }
  if (user.isBlocked) throw new AppError('Your account is blocked.', 403);

  if ((await Booking.countDocuments(unpaidFineFilter(userId))) > 0) {
    throw new AppError('You have outstanding unpaid fines. Please pay them before booking another seat.', 403);
  }

  const activeCount = await Booking.countDocuments({ user: userId, status: 'active', endTime: { $gt: now } });
  if (activeCount >= settings.maxActiveBookings) {
    throw new AppError(`You can have at most ${settings.maxActiveBookings} active bookings at a time.`, 409);
  }

  const dStart = dayStart(start, tz);
  const dEnd = new Date(dStart.getTime() + 24 * 3600 * 1000);
  const dayCount = await Booking.countDocuments({
    user: userId,
    startTime: { $gte: dStart, $lt: dEnd },
    status: { $ne: 'cancelled' },
  });
  if (dayCount >= settings.maxBookingsPerDay) {
    throw new AppError(`Daily limit reached: at most ${settings.maxBookingsPerDay} bookings per day.`, 409);
  }

  const seat = await Seat.findById(seatId).populate('section');
  if (!seat) throw new AppError('Seat not found.', 404);
  if (seat.isMaintenance) throw new AppError('This seat is under maintenance.', 409);
  if (seat.section && seat.section.isActive === false) throw new AppError('This section is currently closed.', 409);
  const people = Math.max(1, parseInt(groupSize, 10) || 1);
  if (people > seat.capacity) throw new AppError(`This ${seat.kind === 'room' ? 'room' : 'seat'} holds at most ${seat.capacity} ${seat.capacity === 1 ? 'person' : 'people'}.`, 400);

  const deadline = new Date(Math.max(start.getTime(), now.getTime()) + settings.gracePeriodMinutes * 60000);

  let booking;
  try {
    booking = await Booking.create({
      user: userId,
      seat: seat._id,
      section: seat.section._id,
      startTime: start,
      endTime: end,
      slots: toSlots(start, end),
      status: 'active',
      checkInRequired: true,
      checkInDeadline: deadline,
      groupSize: people,
      recurrenceId,
    });
  } catch (err) {
    throw translateDuplicate(err);
  }

  emitSeatUpdate({ type: 'BOOKED', seatId: seat._id.toString(), startTime: start, endTime: end });
  if (sendEmail) email.sendBookingConfirmation(user, booking, seat, seat.section);
  logger.info(`Booking created: ${booking._id} user=${userId} seat=${seat._id}`);

  return Booking.findById(booking._id)
    .populate('seat', 'seatNumber amenities row col kind capacity')
    .populate('section', 'name floor')
    .populate('user', 'name email');
};

/**
 * Weekly recurring booking: books the same seat/time for `weeks` consecutive weeks.
 * Every occurrence goes through the normal rules; ones that fail are reported, not fatal.
 */
const createRecurringBookings = async ({ userId, seatId, startTime, endTime, weeks, groupSize }) => {
  const count = Math.min(Math.max(parseInt(weeks, 10) || 1, 1), 8);
  const recurrenceId = crypto.randomBytes(6).toString('hex');
  const created = [];
  const skipped = [];
  for (let i = 0; i < count; i += 1) {
    const shift = i * 7 * 24 * 3600 * 1000;
    const start = new Date(new Date(startTime).getTime() + shift);
    const end = new Date(new Date(endTime).getTime() + shift);
    try {
      created.push(await createBooking({ userId, seatId, startTime: start, endTime: end, groupSize, recurrenceId, sendEmail: false }));
    } catch (err) {
      skipped.push({ startTime: start, reason: err.message });
    }
  }
  if (created.length === 0) throw new AppError(skipped[0]?.reason || 'Could not create any booking.', 409);
  // one summary email for the whole series instead of one per week
  email.sendRecurringConfirmation(created[0].user, created);
  return { created, skipped, recurrenceId };
};

/** Cancel: a student can cancel own booking before check-in; an admin can cancel any. */
const cancelBooking = async ({ bookingId, requestingUser, reason = null }) => {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new AppError('Booking not found.', 404);
  if (booking.status !== 'active') throw new AppError(`Cannot cancel a booking with status: ${booking.status}.`, 400);

  const isOwner = booking.user.toString() === requestingUser._id.toString();
  const isAdmin = requestingUser.role === 'admin';
  if (!isOwner && !isAdmin) throw new AppError('You are not authorized to cancel this booking.', 403);
  if (isOwner && !isAdmin && booking.checkInTime) {
    throw new AppError('You are already checked in. Use Check Out to leave early.', 400);
  }

  booking.status = 'cancelled';
  booking.cancelledBy = requestingUser._id;
  booking.cancellationReason = reason;
  await booking.save();

  emitSeatUpdate({ type: 'AVAILABLE', seatId: booking.seat.toString() });
  notifyWaitlist(booking.seat);

  if (!isOwner) {
    const [owner, seat] = await Promise.all([User.findById(booking.user), Seat.findById(booking.seat)]);
    if (owner) email.sendBookingCancelledByAdmin(owner, booking, seat, reason);
    notify(booking.user, {
      type: 'warning',
      message: `Your booking for seat ${seat?.seatNumber || ''} was cancelled by the library. ${reason || ''}`.trim(),
    });
  }
  logger.info(`Booking ${bookingId} cancelled by user: ${requestingUser._id}`);
  return booking;
};

/** Cancel every upcoming booking of a seat (used when a seat goes into maintenance). */
const cancelBookingsForSeat = async ({ seatId, requestingUser, reason }) => {
  const bookings = await Booking.find({ seat: seatId, status: 'active', endTime: { $gt: new Date() } }).select('_id');
  let cancelled = 0;
  for (const b of bookings) {
    try {
      await cancelBooking({ bookingId: b._id, requestingUser, reason });
      cancelled += 1;
    } catch (err) {
      logger.warn(`Could not cancel booking ${b._id}: ${err.message}`);
    }
  }
  return cancelled;
};

/** Check in (button, or QR token). */
const checkIn = async ({ bookingId, userId, qrToken }) => {
  const settings = await getSettings();
  const booking = await Booking.findOne({ _id: bookingId, user: userId, status: 'active' }).populate('seat', 'qrToken seatNumber');
  if (!booking) throw new AppError('Active booking not found.', 404);
  if (booking.checkInTime) throw new AppError('Already checked in.', 400);

  const now = new Date();
  const opensAt = booking.startTime.getTime() - settings.earlyCheckInMinutes * 60000;
  if (now.getTime() < opensAt) {
    throw new AppError(`Too early. Check-in opens at ${timeLabel(new Date(opensAt), settings.timezone)} (${settings.earlyCheckInMinutes} min before your ${timeLabel(booking.startTime, settings.timezone)} start).`, 400);
  }
  if (now >= booking.endTime) throw new AppError('This booking has already ended.', 400);

  if (qrToken && qrToken !== booking.seat.qrToken) throw new AppError('This QR code belongs to a different seat.', 400);
  if (settings.requireQrCheckIn && !qrToken) {
    throw new AppError('Scan the QR code on your seat to check in.', 400);
  }

  booking.checkInTime = now;
  await booking.save();
  logger.info(`Check-in: booking ${bookingId} by user ${userId}`);
  return booking;
};

/** Admin override: check a student in manually (e.g. their phone died). */
const adminCheckIn = async ({ bookingId }) => {
  const booking = await Booking.findOne({ _id: bookingId, status: 'active' });
  if (!booking) throw new AppError('Active booking not found.', 404);
  if (booking.checkInTime) throw new AppError('Already checked in.', 400);
  booking.checkInTime = new Date();
  await booking.save();
  return booking;
};

/** Check in by scanning the QR code printed on the seat. */
const checkInByQr = async ({ userId, qrToken }) => {
  if (!qrToken) throw new AppError('QR code is missing.', 400);
  const seat = await Seat.findOne({ qrToken });
  if (!seat) throw new AppError('Invalid QR code.', 404);

  const settings = await getSettings();
  const now = new Date();
  const booking = await Booking.findOne({
    user: userId,
    seat: seat._id,
    status: 'active',
    checkInTime: null,
    startTime: { $lte: new Date(now.getTime() + settings.earlyCheckInMinutes * 60000) },
    endTime: { $gt: now },
  });
  if (!booking) {
    const next = await Booking.findOne({ user: userId, seat: seat._id, status: 'active', checkInTime: null, endTime: { $gt: now } }).sort({ startTime: 1 });
    if (next) {
      const opensAt = new Date(next.startTime.getTime() - settings.earlyCheckInMinutes * 60000);
      throw new AppError(`Too early for seat ${seat.seatNumber}. Check-in opens at ${timeLabel(opensAt, settings.timezone)}.`, 400);
    }
    throw new AppError(`You have no booking for seat ${seat.seatNumber} right now. Book it first, then scan.`, 404);
  }
  return checkIn({ bookingId: booking._id, userId, qrToken });
};

/** Check out early; the seat becomes bookable again for the rest of the time. */
const checkOut = async ({ bookingId, userId }) => {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new AppError('Booking not found.', 404);
  if (booking.user.toString() !== userId.toString()) throw new AppError('You are not authorized to check out of this booking.', 403);
  if (booking.status !== 'active') throw new AppError(`Cannot check out. Booking status is: ${booking.status}.`, 400);
  if (!booking.checkInTime) throw new AppError('Cannot check out. You must check in first.', 400);

  booking.status = 'completed';
  booking.checkOutTime = new Date();
  await booking.save();

  emitSeatUpdate({ type: 'AVAILABLE', seatId: booking.seat.toString() });
  notifyWaitlist(booking.seat);
  logger.info(`Check-out: booking ${bookingId} by user ${userId}`);
  return booking;
};

/** Extend a running booking by 30-minute steps, if the following slots are free. */
const extendBooking = async ({ bookingId, userId, minutes }) => {
  const settings = await getSettings();
  const add = Number(minutes);
  if (!add || add % 30 !== 0 || add < 30 || add > 180) throw new AppError('Extension must be a multiple of 30 minutes.', 400);

  const booking = await Booking.findOne({ _id: bookingId, user: userId, status: 'active' });
  if (!booking) throw new AppError('Active booking not found.', 404);
  const now = new Date();
  if (!booking.checkInTime) throw new AppError('Check in before extending your booking.', 400);
  if (booking.endTime <= now) throw new AppError('This booking has already ended.', 400);

  const newEnd = new Date(booking.endTime.getTime() + add * 60000);
  const totalMinutes = (newEnd - booking.startTime) / 60000;
  if (totalMinutes > settings.maxDurationHours * 60) {
    throw new AppError(`A booking cannot exceed ${settings.maxDurationHours} hours in total.`, 400);
  }

  booking.endTime = newEnd; // pre-save recomputes slots; unique index rejects clashes
  booking.extendedCount += 1;
  booking.checkoutReminderSent = false; // remind again before the new end time
  try {
    await booking.save();
  } catch (err) {
    if (err && err.code === 11000) throw new AppError('Someone has booked this seat right after your slot, so it cannot be extended.', 409);
    throw err;
  }
  emitSeatUpdate({ type: 'BOOKED', seatId: booking.seat.toString(), startTime: booking.startTime, endTime: booking.endTime });
  return booking;
};

module.exports = {
  createBooking, createRecurringBookings, cancelBooking, cancelBookingsForSeat, checkIn, adminCheckIn, checkInByQr, checkOut, extendBooking, unpaidFineFilter,
};
