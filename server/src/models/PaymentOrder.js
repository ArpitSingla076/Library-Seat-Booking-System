const mongoose = require('mongoose');

// One checkout attempt: which fines are being paid and what the gateway said.
const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    bookings: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Booking' }],
    amount: { type: Number, required: true }, // rupees
    provider: { type: String, enum: ['razorpay', 'simulated'], required: true },
    providerOrderId: { type: String },
    providerPaymentId: { type: String },
    status: { type: String, enum: ['created', 'paid', 'failed'], default: 'created' },
  },
  { timestamps: true }
);
// forget abandoned checkouts after 7 days
orderSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 3600 });

module.exports = mongoose.model('PaymentOrder', orderSchema);
