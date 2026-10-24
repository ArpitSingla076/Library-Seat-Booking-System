/**
 * Integration test: needs a running MongoDB. Run with:
 *   TEST_MONGO_URI=mongodb://localhost:27017/library_test npm test
 * Skipped automatically when TEST_MONGO_URI is not set.
 */
const test = require('node:test');
const assert = require('node:assert');

const URI = process.env.TEST_MONGO_URI;

test('concurrent requests cannot double-book a seat', { skip: !URI }, async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
  const mongoose = require('mongoose');
  await mongoose.connect(URI);
  const User = require('../models/User');
  const Section = require('../models/Section');
  const Seat = require('../models/Seat');
  const Booking = require('../models/Booking');
  const { createBooking } = require('../services/bookingService');
  const { SLOT_MS } = require('../utils/slots');

  await Promise.all([User.deleteMany(), Section.deleteMany(), Seat.deleteMany(), Booking.deleteMany()]);
  await Booking.init();

  const section = await Section.create({ name: 'Test' });
  const seat = await Seat.create({ seatNumber: 'T01', section: section._id });
  const users = await Promise.all(
    Array.from({ length: 8 }, (_, i) => User.create({ name: `U${i}`, email: `u${i}@t.edu`, password: 'Password1' }))
  );

  const start = new Date(Math.ceil((Date.now() + SLOT_MS) / SLOT_MS) * SLOT_MS);
  const end = new Date(start.getTime() + 2 * SLOT_MS);

  const results = await Promise.allSettled(
    users.map((u) => createBooking({ userId: u._id, seatId: seat._id, startTime: start, endTime: end }))
  );
  const ok = results.filter((r) => r.status === 'fulfilled').length;
  assert.strictEqual(ok, 1, 'exactly one booking must succeed');
  assert.strictEqual(await Booking.countDocuments({ seat: seat._id, status: 'active' }), 1);

  await mongoose.disconnect();
});
