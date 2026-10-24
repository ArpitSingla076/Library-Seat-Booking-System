const crypto = require('crypto');
const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const PaymentOrder = require('../models/PaymentOrder');
const User = require('../models/User');
const { AppError } = require('../middleware/errorHandler');
const { unpaidFineFilter } = require('./bookingService');
const email = require('./emailService');
const { notify } = require('./notificationService');
const logger = require('../utils/logger');

/**
 * Fine payments.
 *  - If RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are set: real checkout through Razorpay
 *    (test keys work too). The payment is only accepted after the gateway signature is verified.
 *  - Otherwise: a demo checkout ("simulated") that records the payment without moving money.
 * The amount is always calculated on the server from the unpaid fines, never taken from the browser.
 */
const razorpayEnabled = () => Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
const providerName = () => (razorpayEnabled() ? 'razorpay' : 'simulated');
const METHODS = ['upi', 'card', 'netbanking', 'wallet', 'cash', 'online'];

const makeReceiptNo = () => `RCPT-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

const razorpayCreateOrder = async (amountRupees, receipt, notes) => {
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
  let res;
  try {
    res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: Math.round(amountRupees * 100), currency: 'INR', receipt, notes }),
    });
  } catch (err) {
    logger.error(`Razorpay unreachable: ${err.message}`);
    throw new AppError('Could not reach the payment gateway. Please try again.', 502);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    logger.error(`Razorpay order failed: ${JSON.stringify(data)}`);
    throw new AppError(data?.error?.description || 'Payment gateway rejected the request.', 502);
  }
  return data; // { id, amount, currency, ... }
};

/** Step 1: create a checkout for one fine (bookingId) or all unpaid fines. */
const createOrder = async ({ userId, bookingId }) => {
  const filter = unpaidFineFilter(userId);
  if (bookingId) filter._id = bookingId;
  const bookings = await Booking.find(filter).select('_id fineAmount');
  if (bookings.length === 0) throw new AppError('No unpaid fine found.', 404);
  const amount = bookings.reduce((s, b) => s + b.fineAmount, 0);

  const provider = providerName();
  let providerOrderId;
  if (provider === 'razorpay') {
    const rz = await razorpayCreateOrder(amount, `fine_${Date.now()}`, { userId: String(userId) });
    providerOrderId = rz.id;
  }
  const order = await PaymentOrder.create({
    user: userId, bookings: bookings.map((b) => b._id), amount, provider, providerOrderId,
  });
  return {
    orderRef: order._id,
    provider,
    amount,
    currency: 'INR',
    providerOrderId,
    keyId: provider === 'razorpay' ? process.env.RAZORPAY_KEY_ID : undefined,
    count: bookings.length,
  };
};

const signatureMatches = (orderId, paymentId, signature) => {
  const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

/** Step 2: confirm the payment, then mark the fines paid and issue receipts. */
const verifyOrder = async ({ userId, orderRef, paymentId, signature, method }) => {
  const order = await PaymentOrder.findOne({ _id: orderRef, user: userId });
  if (!order) throw new AppError('Payment order not found.', 404);
  if (order.status === 'paid') throw new AppError('This payment was already completed.', 400);

  if (order.provider === 'razorpay') {
    if (!razorpayEnabled() || !paymentId || !signatureMatches(order.providerOrderId, paymentId, signature)) {
      await PaymentOrder.updateOne({ _id: order._id }, { $set: { status: 'failed' } });
      throw new AppError('Payment verification failed. If money was deducted it will be refunded by your bank.', 400);
    }
  } else if (razorpayEnabled()) {
    throw new AppError('Demo payments are disabled while a real gateway is configured.', 400);
  }

  // claim the order so a double click / replay cannot pay twice
  const claimed = await PaymentOrder.findOneAndUpdate(
    { _id: order._id, status: 'created' },
    { $set: { status: 'paid', providerPaymentId: paymentId || `SIM-${crypto.randomBytes(5).toString('hex')}` } },
    { new: true }
  );
  if (!claimed) throw new AppError('This payment is already being processed.', 409);

  const chosen = order.provider === 'razorpay' ? 'online' : (METHODS.includes(method) ? method : 'upi');
  const payments = await markFinesPaid({
    userId, bookingIds: order.bookings, method: chosen, provider: order.provider, reference: claimed.providerPaymentId,
  });
  if (payments.length === 0) throw new AppError('These fines were already settled.', 409);

  const total = payments.reduce((s, p) => s + p.amount, 0);
  notify(userId, { type: 'success', message: `Payment of ₹${total} received. Thank you!` });
  return payments;
};

const markFinesPaid = async ({ userId, bookingIds, method, provider, reference }) => {
  const payments = [];
  for (const id of bookingIds) {
    const booking = await Booking.findOneAndUpdate(
      { _id: id, ...unpaidFineFilter(userId) },
      { $set: { finePaid: true, finePaidAt: new Date() } },
      { new: true }
    );
    if (!booking) continue; // waived or paid in the meantime
    try {
      payments.push(await Payment.create({
        user: userId, booking: booking._id, amount: booking.fineAmount, method, provider,
        receiptNo: makeReceiptNo(), reference,
      }));
    } catch (err) {
      await Booking.updateOne({ _id: booking._id }, { $set: { finePaid: false, finePaidAt: null } });
      throw err;
    }
  }
  const user = await User.findById(userId);
  if (user) payments.forEach((p) => email.sendPaymentReceipt(user, p));
  return payments;
};

/** Admin: student paid at the desk (cash / card machine). */
const adminMarkPaid = async ({ bookingId, method = 'cash' }) => {
  const booking = await Booking.findOne({ _id: bookingId, fineAmount: { $gt: 0 }, finePaid: false, fineWaived: { $ne: true } });
  if (!booking) throw new AppError('No unpaid fine on this booking.', 404);
  const chosen = METHODS.includes(method) ? method : 'cash';
  const payments = await markFinesPaid({
    userId: booking.user, bookingIds: [booking._id], method: chosen, provider: 'desk', reference: 'COUNTER',
  });
  if (!payments.length) throw new AppError('This fine was already settled.', 409);
  notify(booking.user, { type: 'success', message: `Your fine of ₹${booking.fineAmount} was recorded as paid at the library desk.` });
  return payments[0];
};

module.exports = { createOrder, verifyOrder, adminMarkPaid, razorpayEnabled, METHODS };
