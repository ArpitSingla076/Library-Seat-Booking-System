const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
    amount: { type: Number, required: true },
    method: { type: String, enum: ['upi', 'card', 'netbanking', 'wallet', 'cash', 'online'], default: 'upi' },
    provider: { type: String, default: 'simulated' },
    status: { type: String, enum: ['paid', 'refunded'], default: 'paid' },
    receiptNo: { type: String, required: true, unique: true },
    reference: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Payment', paymentSchema);
