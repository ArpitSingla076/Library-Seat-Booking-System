const test = require('node:test');
const assert = require('node:assert');
const T = require('../services/emailTemplates');

const ctx = {
  tz: 'Asia/Kolkata',
  site: 'https://library.example.com',
  now: new Date('2030-01-01T07:00:00Z'),
  settings: { earlyCheckInMinutes: 10, gracePeriodMinutes: 15, noShowFine: 50, overstayFine: 100, requireQrCheckIn: false },
};
const user = { name: 'Asha', email: 'asha@x.edu' };
const seat = { seatNumber: 'A06', kind: 'seat' };
const section = { name: 'General Reading', floor: 1 };
// 08:00 UTC = 1:30 pm in India
const booking = { startTime: new Date('2030-01-01T08:00:00Z'), endTime: new Date('2030-01-01T09:30:00Z'), checkInDeadline: new Date('2030-01-01T08:15:00Z'), groupSize: 1 };

test('booking confirmation shows seat, date, time in library time zone, and duration', () => {
  const m = T.bookingConfirmation({ user, booking, seat, section, ctx });
  assert.match(m.subject, /Seat A06/);
  assert.match(m.text, /Seat: A06/);
  assert.match(m.text, /Date: Tuesday, 1 January 2030/);
  assert.match(m.text, /Time: 1:30 pm to 3:00 pm/); // India time, not UTC
  assert.match(m.text, /Duration: 1 hr 30 min/);
  assert.match(m.text, /Check in by: 1:45 pm/);
  assert.match(m.text, /Fine if you miss it: ₹50/);
  assert.match(m.html, /View my bookings/);
});

test('fine email contains the amount, reason, booking time and a pay link', () => {
  const b = { ...booking, status: 'no_show', fineAmount: 50, fineReason: 'No-show violation: did not check in within grace period' };
  const m = T.fineAlert({ user, booking: b, seat, ctx });
  assert.match(m.subject, /₹50/);
  assert.match(m.text, /Type: No-show/);
  assert.match(m.text, /Reason: No-show violation/);
  assert.match(m.text, /Booking time: 1:30 pm to 3:00 pm/);
  assert.match(m.text, /https:\/\/library\.example\.com\/fines/);
});

test('check-in and check-out reminders', () => {
  const a = T.checkInReminder({ user, booking, seat, ctx });
  assert.match(a.text, /Check-in opens: 1:20 pm/);
  assert.match(a.text, /Check in by: 1:45 pm/);
  const b = T.checkOutReminder({ user, booking: { ...booking, checkInTime: new Date('2030-01-01T08:02:00Z') }, seat, ctx });
  assert.match(b.text, /Ends at: 3:00 pm/);
  assert.match(b.text, /Fine if you forget to check out: ₹100/);
});

test('user-supplied text is HTML-escaped', () => {
  const m = T.cancelledByAdmin({ user, booking, seat, reason: '<script>alert(1)</script>', ctx });
  assert.ok(!m.html.includes('<script>alert(1)</script>'));
  assert.ok(m.html.includes('&lt;script&gt;'));
});

test('duration formatting', () => {
  assert.strictEqual(T.fmtDuration(30), '30 minutes');
  assert.strictEqual(T.fmtDuration(60), '1 hour');
  assert.strictEqual(T.fmtDuration(120), '2 hours');
  assert.strictEqual(T.fmtDuration(90), '1 hr 30 min');
});
