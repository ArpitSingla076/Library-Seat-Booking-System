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

/**
 * Providers (the first one that is configured wins):
 *   BREVO_API_KEY        Brevo web API   (HTTPS)  free 300/day
 *   RESEND_API_KEY       Resend web API  (HTTPS)  needs your own verified domain to email students
 *   MAIL_WEBHOOK_URL     Gmail relay through a Google Apps Script web app (HTTPS), free, no domain needed
 *   SMTP_HOST            classic SMTP. NOTE: hosts like Render's free plan block SMTP ports (25/465/587)
 * HTTPS providers work on every host. SMTP is fine on your own computer.
 */
const providerName = () => {
  if (process.env.BREVO_API_KEY) return 'brevo';
  if (process.env.RESEND_API_KEY) return 'resend';
  if (process.env.MAIL_WEBHOOK_URL) return 'webhook';
  if (transporter) return 'smtp';
  return null;
};
const emailEnabled = () => Boolean(providerName());
const fromAddress = () => process.env.MAIL_FROM || process.env.SMTP_USER || 'BookMySeat <no-reply@library.local>';

// "BookMySeat <a@b.com>"  ->  { name: 'BookMySeat', email: 'a@b.com' }
const parseFrom = (from) => {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from);
  return m ? { name: m[1].trim() || 'BookMySeat', email: m[2].trim() } : { name: 'BookMySeat', email: String(from).trim() };
};

const emailStatus = () => ({
  configured: emailEnabled(),
  provider: providerName(),
  host: providerName() === 'smtp' ? process.env.SMTP_HOST : null,
  from: fromAddress(),
});

// POST JSON with a timeout; returns { ok, status, text }
const postJson = async (url, { headers = {}, body }) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
      redirect: 'follow',
    });
    return { ok: res.ok, status: res.status, text: await res.text() };
  } catch (err) {
    throw new Error(err.name === 'AbortError' ? 'The email service did not answer within 20 seconds' : err.message);
  } finally {
    clearTimeout(timer);
  }
};

const senders = {
  brevo: async ({ to, subject, text, html }) => {
    const r = await postJson('https://api.brevo.com/v3/smtp/email', {
      headers: { 'api-key': process.env.BREVO_API_KEY, accept: 'application/json' },
      body: { sender: parseFrom(fromAddress()), to: [{ email: to }], subject, htmlContent: html, textContent: text },
    });
    if (!r.ok) throw new Error(`Brevo rejected the email (${r.status}): ${r.text.slice(0, 250)}`);
  },
  resend: async ({ to, subject, text, html }) => {
    const r = await postJson('https://api.resend.com/emails', {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      body: { from: fromAddress(), to: [to], subject, html, text },
    });
    if (!r.ok) throw new Error(`Resend rejected the email (${r.status}): ${r.text.slice(0, 250)}`);
  },
  // Google Apps Script web app that calls MailApp.sendEmail (see README: "Free email with your Gmail")
  webhook: async ({ to, subject, text, html }) => {
    const r = await postJson(process.env.MAIL_WEBHOOK_URL, {
      body: { secret: process.env.MAIL_WEBHOOK_SECRET || '', to, subject, text, html, name: parseFrom(fromAddress()).name },
    });
    let data = null;
    try { data = JSON.parse(r.text); } catch { /* not JSON */ }
    if (!data) throw new Error('The Gmail relay did not answer correctly. In Apps Script, deploy it as a Web app with "Who has access: Anyone".');
    if (!r.ok || !data.ok) throw new Error(`Gmail relay error: ${data.error || r.status}`);
  },
  smtp: async ({ to, subject, text, html }) => {
    await transporter.sendMail({ from: fromAddress(), to, subject, text, html });
  },
};

const sendMail = async ({ to, subject, text, html }) => {
  if (!to) return { sent: false, error: 'No recipient address' };
  const provider = providerName();
  if (!provider) {
    logger.info(`[email NOT sent - no email provider configured] to=${to} subject="${subject}"\n${text}`);
    return { sent: false, error: 'No email provider is configured' };
  }
  try {
    await senders[provider]({ to, subject, text, html });
    logger.info(`Email sent via ${provider} to ${to}: ${subject}`);
    return { sent: true, provider };
  } catch (err) {
    const hint = provider === 'smtp' && /timeout|ETIMEDOUT|ECONNREFUSED/i.test(err.message)
      ? ' (Hosts like Render free block SMTP ports. Use BREVO_API_KEY or the Gmail relay instead.)'
      : '';
    logger.error(`Email failed via ${provider} to ${to} ("${subject}"): ${err.message}${hint}`);
    return { sent: false, error: err.message + hint };
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
  const provider = providerName();
  if (!provider) return { sent: false, error: 'No email provider is set up yet. Add BREVO_API_KEY (or MAIL_WEBHOOK_URL, or the SMTP_* lines) to the server settings and restart. See the README.' };
  if (provider === 'smtp') {
    try {
      await transporter.verify();
    } catch (err) {
      const hint = /timeout|ETIMEDOUT|ECONNREFUSED/i.test(err.message) ? ' Hosts like Render free block SMTP ports; use BREVO_API_KEY or the Gmail relay instead.' : '';
      return { sent: false, error: `Could not connect to the mail server: ${err.message}.${hint}` };
    }
  }
  const ctx = await getCtx();
  return sendMail({ to: user.email, ...T.testEmail({ user, ctx }) });
};

module.exports = {
  emailEnabled, emailStatus, sendMail, sendTestEmail,
  sendVerificationEmail, sendPasswordResetEmail, sendBookingConfirmation, sendRecurringConfirmation,
  sendBookingReminder, sendCheckoutReminder, sendFineAlert, sendPaymentReceipt, sendBookingCancelledByAdmin,
};