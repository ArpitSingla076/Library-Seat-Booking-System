const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['info', 'success', 'warning', 'error'], default: 'info' },
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);
notificationSchema.index({ user: 1, createdAt: -1 });
// auto-delete after 60 days
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 24 * 3600 });

module.exports = mongoose.model('Notification', notificationSchema);
