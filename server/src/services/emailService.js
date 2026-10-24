const logger = require('../utils/logger');
const { getSettings } = require('./settingsService');
const T = require('./emailTemplates');

/**
 * Sends the emails (booking confirmation, reminders, fines, receipts, password links).
 * Real emails need SMTP_* settings in .env. Without them, every email is only written to the
 * server log so the app still works while you develop.
 */
let transporter = null;
try {
  if (process.env.SMTP_HOST) {
    // eslint-disable-next-line global-require
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });
  }
} catch (err) {
  logger.warn(`Email disabled (nodemailer unavailable): ${err.message}`);
}

const emailEnabled = () => Boolean(transporter);
const fromAddress = () => process.env.MAIL_FROM || process.env.SMTP_USER || 'BookMySeat <no-reply@library.local>';

const emailStatus = () => ({
  configured: emailEnabled(),
  host: process.env.SMTP_HOST || null,
  port: process.env.SMTP_HOST ? Number(process.env.SMTP_PORT) || 587 : null,
  from: fromAddress(),
});

const sendMail = async ({ to, subject, text, html }) => {
  if (!to) return { sent: false, error: 'No recipient address' };
  if (!transporter) {
    logger.info(`[email NOT sent - SMTP not configured] to=${to} subject="${subject}"\n${text}`);
    return { sent: false, error: 'SMTP is not configured' };
  }
  try {
    await transporter.sendMail({ from: fromAddress(), to, subject, text, html });
    logger.info(`Email sent to ${to}: ${subject}`);
    return { sent: true };
  } catch (err) {
    logger.error(`Email failed to ${to} ("${subject}"): ${err.message}`);
    return { sent: false, error: err.message };
  }
};

const getCtx = async () => {
  const settings = await getSettings();
  return {
    settings,
    tz: settings.timezone || 'Asia/Kolkata',
    site: (settings.publicUrl || process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/+$/, ''),
  };
};

// Fire-and-forget wrapper: an email problem must never break a booking or a cron job
const deliver = (userEmail, build) =>
  (async () => {
    const ctx = await getCtx();
    return sendMail({ to: userEmail, ...build(ctx) });
  })().catch((err) => {
    logger.error(`Email error: ${err.message}`);
    return { sent: false, error: err.message };
  });

const sendVerificationEmail = (user, token) => deliver(user.email, (ctx) => T.verification({ user, token, ctx }));
const sendPasswordResetEmail = (user, token) => deliver(user.email, (ctx) => T.passwordReset({ user, token, ctx }));
const sendBookingConfirmation = (user, booking, seat, section) => deliver(user.email, (ctx) => T.bookingConfirmation({ user, booking, seat, section, ctx }));
const sendRecurringConfirmation = (user, bookings) => deliver(user.email, (ctx) => T.recurringConfirmation({ user, bookings, ctx }));
const sendBookingReminder = (user, booking, seat) => deliver(user.email, (ctx) => T.checkInReminder({ user, booking, seat, ctx }));
const sendCheckoutReminder = (user, booking, seat) => deliver(user.email, (ctx) => T.checkOutReminder({ user, booking, seat, ctx }));
const sendFineAlert = (user, booking, seat) => deliver(user.email, (ctx) => T.fineAlert({ user, booking, seat, ctx }));
const sendPaymentReceipt = (user, payment) => deliver(user.email, (ctx) => T.paymentReceipt({ user, payment, ctx }));
const sendBookingCancelledByAdmin = (user, booking, seat, reason) => deliver(user.email, (ctx) => T.cancelledByAdmin({ user, booking, seat, reason, ctx }));

// Admin "send test email": waits for the result and reports the real error
const sendTestEmail = async (user) => {
  if (!transporter) return { sent: false, error: 'SMTP is not configured. Add the SMTP_* lines to server/.env and restart the server.' };
  try {
    await transporter.verify();
  } catch (err) {
    return { sent: false, error: `Could not log in to the mail server: ${err.message}` };
  }
  const ctx = await getCtx();
  return sendMail({ to: user.email, ...T.testEmail({ user, ctx }) });
};

module.exports = {
  emailEnabled, emailStatus, sendMail, sendTestEmail,
  sendVerificationEmail, sendPasswordResetEmail, sendBookingConfirmation, sendRecurringConfirmation,
  sendBookingReminder, sendCheckoutReminder, sendFineAlert, sendPaymentReceipt, sendBookingCancelledByAdmin,
};
