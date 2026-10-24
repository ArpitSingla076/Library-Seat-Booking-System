const mongoose = require('mongoose');

// "Tell me if this seat becomes free for this time"
const waitlistSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    seat: { type: mongoose.Schema.Types.ObjectId, ref: 'Seat', required: true, index: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    notified: { type: Boolean, default: false },
  },
  { timestamps: true }
);
waitlistSchema.index({ user: 1, seat: 1, startTime: 1, endTime: 1 }, { unique: true });
waitlistSchema.index({ endTime: 1 }, { expireAfterSeconds: 7 * 24 * 3600 }); // clean up old entries

module.exports = mongoose.model('Waitlist', waitlistSchema);
