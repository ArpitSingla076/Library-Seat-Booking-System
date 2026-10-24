/**
 * Time is divided into 30-minute slots (slot index = floor(epochMs / 30min)).
 * Every booking stores the list of slot indexes it covers. A unique partial index
 * on (seat, slots) and (user, slots) for ACTIVE bookings lets MongoDB itself
 * reject overlapping bookings atomically - no transactions or locks needed.
 */
const SLOT_MINUTES = 30;
const SLOT_MS = SLOT_MINUTES * 60 * 1000;

const isSlotAligned = (date) => date.getTime() % SLOT_MS === 0;

const toSlots = (start, end) => {
  const slots = [];
  for (let t = start.getTime(); t < end.getTime(); t += SLOT_MS) slots.push(t / SLOT_MS);
  return slots;
};

const floorToSlot = (date) => new Date(Math.floor(date.getTime() / SLOT_MS) * SLOT_MS);

module.exports = { SLOT_MINUTES, SLOT_MS, isSlotAligned, toSlots, floorToSlot };
