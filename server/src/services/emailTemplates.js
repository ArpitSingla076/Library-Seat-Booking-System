/**
 * Pure functions that build the email text + HTML. No database or network access here,
 * so they can be unit-tested. All times are shown in the library time zone (Settings.timezone),
 * NOT the server's time zone (hosting servers usually run in UTC).
 */
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fmtDate = (d, tz) => new Date(d).toLocaleDateString('en-IN', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtShortDate = (d, tz) => new Date(d).toLocaleDateString('en-IN', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' });
const fmtTime = (d, tz) => new Date(d).toLocaleTimeString('en-IN', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true });
const fmtDuration = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h} hr ${m} min`;
  if (h) return `${h} ${h === 1 ? 'hour' : 'hours'}`;
  return `${m} minutes`;
};

const layout = ({ title, intro, rows = [], note, button }) => {
  const rowsHtml = rows
    .map(([k, v]) => `<tr><td style="padding:8px 0;color:#64748b;width:42%;vertical-align:top">${esc(k)}</td><td style="padding:8px 0;font-weight:600;color:#0f172a">${esc(v)}</td></tr>`)
    .join('');
  const html = `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
  <div style="background:#2563eb;color:#fff;padding:16px 22px;font-weight:700;font-size:16px">BookMySeat</div>
  <div style="padding:22px;color:#0f172a;font-size:14px;line-height:1.55">
    <h2 style="margin:0 0 10px;font-size:19px">${esc(title)}</h2>
    ${intro ? `<p style="margin:0 0 14px">${esc(intro)}</p>` : ''}
    ${rows.length ? `<table style="width:100%;border-collapse:collapse;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0">${rowsHtml}</table>` : ''}
    ${note ? `<p style="margin:14px 0 0;color:#334155">${esc(note)}</p>` : ''}
    ${button ? `<p style="margin:20px 0 0"><a href="${esc(button.url)}" style="background:#2563eb;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:700;display:inline-block">${esc(button.label)}</a></p>` : ''}
  </div>
  <div style="padding:12px 22px;background:#f8fafc;color:#94a3b8;font-size:12px">This is an automatic message from the library seat booking system.</div>
</div>`;
  const text = [title, '', intro, rows.length ? '' : null, ...rows.map(([k, v]) => `${k}: ${v}`), note ? '' : null, note, button ? '' : null, button ? `${button.label}: ${button.url}` : null]
    .filter((x) => x !== null && x !== undefined)
    .join('\n');
  return { html, text };
};

const done = (subject, parts) => ({ subject, ...layout(parts) });
const where = (seat) => (seat?.kind === 'room' ? 'Room' : 'Seat');

/* ---------- booking confirmation ---------- */
const bookingConfirmation = ({ user, booking, seat, section, ctx }) => {
  const { settings, tz, site } = ctx;
  const now = ctx.now || new Date();
  const start = new Date(booking.startTime);
  const end = new Date(booking.endTime);
  const opensAt = new Date(start.getTime() - settings.earlyCheckInMinutes * 60000);
  const rows = [
    [where(seat), `${seat.seatNumber}${booking.groupSize > 1 ? ` (group of ${booking.groupSize})` : ''}`],
    ['Section', section ? `${section.name}${section.floor != null ? ` · Floor ${section.floor}` : ''}` : '-'],
    ['Date', fmtDate(start, tz)],
    ['Time', `${fmtTime(start, tz)} to ${fmtTime(end, tz)}`],
    ['Duration', fmtDuration(Math.round((end - start) / 60000))],
    ['Check-in opens', opensAt <= now ? 'Open now' : fmtTime(opensAt, tz)],
  ];
  if (booking.checkInDeadline) rows.push(['Check in by', fmtTime(booking.checkInDeadline, tz)]);
  if (settings.noShowFine > 0) rows.push(['Fine if you miss it', `₹${settings.noShowFine}`]);
  return done(`Booking confirmed: ${where(seat)} ${seat.seatNumber}, ${fmtShortDate(start, tz)} ${fmtTime(start, tz)}`, {
    title: 'Your booking is confirmed',
    intro: `Hi ${user.name}, your ${where(seat).toLowerCase()} is booked. Here are the details:`,
    rows,
    note: `${settings.requireQrCheckIn ? 'To check in, scan the QR code on your seat (My Bookings, then Scan seat QR).' : 'To check in, open My Bookings and press Check in.'} Please check out when you leave so others can use the seat.`,
    button: { label: 'View my bookings', url: `${site}/bookings` },
  });
};

const recurringConfirmation = ({ user, bookings, ctx }) => {
  const { tz, site } = ctx;
  const first = bookings[0];
  const start = new Date(first.startTime);
  const end = new Date(first.endTime);
  const rows = [
    [where(first.seat), first.seat.seatNumber],
    ['Section', first.section ? first.section.name : '-'],
    ['Each visit', `${fmtTime(start, tz)} to ${fmtTime(end, tz)} (${fmtDuration(Math.round((end - start) / 60000))})`],
    ...bookings.map((b, i) => [`Week ${i + 1}`, fmtDate(b.startTime, tz)]),
  ];
  return done(`${bookings.length} weekly bookings confirmed: ${where(first.seat)} ${first.seat.seatNumber}`, {
    title: 'Your weekly bookings are confirmed',
    intro: `Hi ${user.name}, you booked the same time for ${bookings.length} weeks.`,
    rows,
    note: 'Remember to check in on each day. A missed check-in cancels that day and adds a fine.',
    button: { label: 'View my bookings', url: `${site}/bookings` },
  });
};

/* ---------- reminder before the booking starts (check-in reminder) ---------- */
const checkInReminder = ({ user, booking, seat, ctx }) => {
  const { settings, tz, site } = ctx;
  const start = new Date(booking.startTime);
  const opensAt = new Date(start.getTime() - settings.earlyCheckInMinutes * 60000);
  const deadline = booking.checkInDeadline || new Date(start.getTime() + settings.gracePeriodMinutes * 60000);
  const rows = [
    [where(seat), seat.seatNumber],
    ['Starts at', `${fmtTime(start, tz)} (${fmtShortDate(start, tz)})`],
    ['Check-in opens', fmtTime(opensAt, tz)],
    ['Check in by', fmtTime(deadline, tz)],
  ];
  if (settings.noShowFine > 0) rows.push(['Fine if you miss it', `₹${settings.noShowFine}`]);
  return done(`Reminder: check in for ${where(seat).toLowerCase()} ${seat.seatNumber} at ${fmtTime(start, tz)}`, {
    title: 'Your booking starts soon',
    intro: `Hi ${user.name}, don't forget to check in. If you don't check in on time, the booking is cancelled.`,
    rows,
    note: settings.requireQrCheckIn ? 'Scan the QR code on your seat to check in.' : 'Open My Bookings and press Check in when you arrive.',
    button: { label: 'Open my bookings', url: `${site}/bookings` },
  });
};

/* ---------- reminder before the booking ends (check-out reminder) ---------- */
const checkOutReminder = ({ user, booking, seat, ctx }) => {
  const { settings, tz, site } = ctx;
  const end = new Date(booking.endTime);
  const rows = [
    [where(seat), seat.seatNumber],
    ['Ends at', fmtTime(end, tz)],
  ];
  if (booking.checkInTime) rows.push(['You checked in at', fmtTime(booking.checkInTime, tz)]);
  if (settings.overstayFine > 0) rows.push(['Fine if you forget to check out', `₹${settings.overstayFine}`]);
  return done(`Your ${where(seat).toLowerCase()} ${seat.seatNumber} booking ends at ${fmtTime(end, tz)}`, {
    title: 'Time to check out soon',
    intro: `Hi ${user.name}, your booking is about to end.`,
    rows,
    note: 'Press Check out in My Bookings when you leave. Need more time? You can extend your booking there if nobody has booked the seat after you.',
    button: { label: 'Check out or extend', url: `${site}/bookings` },
  });
};

/* ---------- fine imposed ---------- */
const fineAlert = ({ user, booking, seat, ctx }) => {
  const { tz, site } = ctx;
  const kind = booking.status === 'expired' ? 'Overstay' : booking.status === 'no_show' ? 'No-show' : 'Violation';
  const rows = [
    ['Type', kind],
    ['Reason', booking.fineReason || '-'],
    ['Fine amount', `₹${booking.fineAmount}`],
    [where(seat), seat?.seatNumber || '-'],
    ['Booking date', fmtDate(booking.startTime, tz)],
    ['Booking time', `${fmtTime(booking.startTime, tz)} to ${fmtTime(booking.endTime, tz)}`],
  ];
  return done(`Fine of ₹${booking.fineAmount} added: ${kind.toLowerCase()} on ${fmtShortDate(booking.startTime, tz)}`, {
    title: 'A fine was added to your account',
    intro: `Hi ${user.name}, a fine was added because of the booking below.`,
    rows,
    note: 'You cannot book new seats until the fine is paid. Pay online on the Fines page, or at the library desk.',
    button: { label: 'Pay fine', url: `${site}/fines` },
  });
};

/* ---------- other emails ---------- */
const paymentReceipt = ({ user, payment, ctx }) => {
  const { tz, site } = ctx;
  return done(`Payment receipt ${payment.receiptNo}`, {
    title: 'Payment received',
    intro: `Hi ${user.name}, thank you. We received your payment.`,
    rows: [
      ['Receipt no', payment.receiptNo],
      ['Amount', `₹${payment.amount}`],
      ['Method', String(payment.method).toUpperCase()],
      ['Paid on', `${fmtDate(payment.createdAt || new Date(), tz)}, ${fmtTime(payment.createdAt || new Date(), tz)}`],
      ...(payment.reference ? [['Reference', payment.reference]] : []),
    ],
    button: { label: 'View payments', url: `${site}/fines` },
  });
};

const cancelledByAdmin = ({ user, booking, seat, reason, ctx }) => {
  const { tz, site } = ctx;
  return done(`Booking cancelled: ${where(seat).toLowerCase()} ${seat?.seatNumber || ''}`.trim(), {
    title: 'Your booking was cancelled by the library',
    intro: `Hi ${user.name}, we are sorry, the booking below was cancelled.`,
    rows: [
      [where(seat), seat?.seatNumber || '-'],
      ['Date', fmtDate(booking.startTime, tz)],
      ['Time', `${fmtTime(booking.startTime, tz)} to ${fmtTime(booking.endTime, tz)}`],
      ['Reason', reason || 'Not given'],
    ],
    button: { label: 'Book another seat', url: `${site}/seats` },
  });
};

const verification = ({ user, token, ctx }) =>
  done('Verify your BookMySeat email', {
    title: 'Verify your email',
    intro: `Hi ${user.name}, please confirm your email address. The link works for 24 hours.`,
    button: { label: 'Verify email', url: `${ctx.site}/verify-email/${token}` },
  });

const passwordReset = ({ user, token, ctx }) =>
  done('Reset your BookMySeat password', {
    title: 'Reset your password',
    intro: 'Click the button to choose a new password. The link works for 1 hour. If you did not ask for this, ignore this email.',
    button: { label: 'Reset password', url: `${ctx.site}/reset-password/${token}` },
  });

const testEmail = ({ user, ctx }) =>
  done('BookMySeat test email', {
    title: 'Email is working',
    intro: `Hi ${user.name}, this is a test message. If you can read it, the library can send emails to students.`,
    rows: [['Sent at', `${fmtDate(new Date(), ctx.tz)}, ${fmtTime(new Date(), ctx.tz)}`]],
  });

module.exports = {
  fmtDate, fmtTime, fmtDuration,
  bookingConfirmation, recurringConfirmation, checkInReminder, checkOutReminder, fineAlert,
  paymentReceipt, cancelledByAdmin, verification, passwordReset, testEmail,
};
