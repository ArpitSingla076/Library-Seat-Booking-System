const mongoose = require('mongoose');
const { toSlots } = require('../utils/slots');

const bookingSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    seat: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Seat',
      required: true,
      index: true,
    },
    section: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Section',
      required: true,
    },
    startTime: {
      type: Date,
      required: [true, 'Start time is required'],
    },
    endTime: {
      type: Date,
      required: [true, 'End time is required'],
    },
    status: {
      type: String,
      enum: ['active', 'completed', 'cancelled', 'expired', 'no_show'],
      default: 'active',
      index: true,
    },
    checkInTime: {
      type: Date,
      default: null,
    },
    checkInRequired: {
      type: Boolean,
      default: true,
    },
    checkInDeadline: {
      type: Date,
      default: null,
    },
    checkOutTime: {
      type: Date,
      default: null,
    },
    // 30-minute slot indexes covered by this booking (see utils/slots.js)
    slots: { type: [Number], default: [] },
    groupSize: { type: Number, default: 1, min: 1 },
    recurrenceId: { type: String, default: null },
    checkoutReminderSent: { type: Boolean, default: false },
    reminderSent: { type: Boolean, default: false },
    extendedCount: { type: Number, default: 0 },
    fineWaived: { type: Boolean, default: false },
    fineWaivedReason: { type: String, default: null },
    finePaidAt: { type: Date, default: null },
    fineAmount: {
      type: Number,
      default: 0,
    },
    fineReason: {
      type: String,
      default: null,
    },
    finePaid: {
      type: Boolean,
      default: false,
    },
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    cancellationReason: {
      type: String,
      default: null,
    },
    notes: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// DOUBLE-BOOKING GUARD: unique multikey indexes over slot numbers, only for active bookings.
// Two active bookings can never cover the same slot for the same seat (or the same user).
bookingSchema.index(
  { seat: 1, slots: 1 },
  { unique: true, partialFilterExpression: { status: 'active' }, name: 'uniq_active_seat_slot' }
);
bookingSchema.index(
  { user: 1, slots: 1 },
  { unique: true, partialFilterExpression: { status: 'active' }, name: 'uniq_active_user_slot' }
);
bookingSchema.index({ seat: 1, status: 1, startTime: 1, endTime: 1 }, { name: 'seat_booking_overlap_check' });
bookingSchema.index({ user: 1, status: 1 });
bookingSchema.index({ startTime: 1, endTime: 1 });
bookingSchema.index({ status: 1, endTime: 1 }); // For cron job expiry queries

// Virtual: duration in minutes
bookingSchema.virtual('durationMinutes').get(function () {
  return Math.round((this.endTime - this.startTime) / 1000 / 60);
});

// Validate endTime > startTime
bookingSchema.pre('save', function (next) {
  if (this.endTime <= this.startTime) {
    return next(new Error('End time must be after start time'));
  }
  // (Re)compute slots whenever the time range changes
  if (this.isNew || this.isModified('startTime') || this.isModified('endTime')) {
    this.slots = toSlots(this.startTime, this.endTime);
  }
  // Set checkInDeadline to startTime + grace period (default 15 min)
  if (!this.checkInDeadline && this.checkInRequired) {
    const gracePeriod = parseInt(process.env.CHECKIN_GRACE_PERIOD_MINUTES || '15', 10);
    this.checkInDeadline = new Date(this.startTime.getTime() + gracePeriod * 60 * 1000);
  }
  next();
});

module.exports = mongoose.model('Booking', bookingSchema);
