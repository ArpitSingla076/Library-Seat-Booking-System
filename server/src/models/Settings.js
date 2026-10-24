const mongoose = require('mongoose');

// Single-document collection holding admin-configurable rules.
const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'global', unique: true },
    gracePeriodMinutes: { type: Number, default: 15, min: 1, max: 120 },
    earlyCheckInMinutes: { type: Number, default: 10, min: 0, max: 60 },
    noShowFine: { type: Number, default: 50, min: 0 },
    overstayFine: { type: Number, default: 100, min: 0 },
    maxDurationHours: { type: Number, default: 3, min: 1, max: 12 },
    maxActiveBookings: { type: Number, default: 3, min: 1, max: 20 },
    maxBookingsPerDay: { type: Number, default: 3, min: 1, max: 20 },
    advanceBookingDays: { type: Number, default: 7, min: 0, max: 60 },
    reminderMinutes: { type: Number, default: 15, min: 0, max: 120 },
    checkoutReminderMinutes: { type: Number, default: 10, min: 0, max: 120 },
    requireQrCheckIn: { type: Boolean, default: false },
    requireVerifiedEmail: { type: Boolean, default: false },
    // Address students' phones can open (used inside seat QR codes), e.g. https://library.example.com
    publicUrl: { type: String, default: '' },
    // Opening hours (minutes after midnight, in the library time zone)
    timezone: { type: String, default: 'Asia/Kolkata' },
    hoursEnabled: { type: Boolean, default: false },
    openMinutes: { type: Number, default: 480, min: 0, max: 1440 },
    closeMinutes: { type: Number, default: 1320, min: 0, max: 1440 },
    closedWeekdays: { type: [Number], default: [] }, // 0 = Sunday ... 6 = Saturday
    holidays: { type: [String], default: [] }, // 'YYYY-MM-DD'
    // Auto-block repeat offenders (0 = off)
    autoBlockNoShows: { type: Number, default: 0, min: 0, max: 50 },
    autoBlockDays: { type: Number, default: 30, min: 1, max: 365 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Settings', settingsSchema);
