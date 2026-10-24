const test = require('node:test');
const assert = require('node:assert');
const { toSlots, isSlotAligned, floorToSlot, SLOT_MS } = require('../utils/slots');

test('toSlots returns one index per 30 minutes', () => {
  const start = new Date('2030-01-01T10:00:00Z');
  const end = new Date('2030-01-01T12:00:00Z');
  const slots = toSlots(start, end);
  assert.strictEqual(slots.length, 4);
  assert.strictEqual(slots[1] - slots[0], 1);
});

test('adjacent bookings do not share slots, overlapping ones do', () => {
  const a = toSlots(new Date('2030-01-01T10:00:00Z'), new Date('2030-01-01T11:00:00Z'));
  const b = toSlots(new Date('2030-01-01T11:00:00Z'), new Date('2030-01-01T12:00:00Z'));
  const c = toSlots(new Date('2030-01-01T10:30:00Z'), new Date('2030-01-01T11:30:00Z'));
  assert.strictEqual(a.some((s) => b.includes(s)), false);
  assert.strictEqual(a.some((s) => c.includes(s)), true);
});

test('alignment helpers', () => {
  assert.strictEqual(isSlotAligned(new Date('2030-01-01T10:30:00Z')), true);
  assert.strictEqual(isSlotAligned(new Date('2030-01-01T10:20:00Z')), false);
  assert.strictEqual(floorToSlot(new Date('2030-01-01T10:44:10Z')).getTime() % SLOT_MS, 0);
});
