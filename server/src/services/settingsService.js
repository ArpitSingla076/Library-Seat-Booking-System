const Settings = require('../models/Settings');
const { AppError } = require('../middleware/errorHandler');
const { isValidTimeZone } = require('../utils/timeUtil');

let cache = null;
let cachedAt = 0;
const TTL = 15 * 1000;

const getSettings = async () => {
  if (cache && Date.now() - cachedAt < TTL) return cache;
  let doc = await Settings.findOne({ key: 'global' }).lean();
  if (!doc) {
    try {
      doc = (await Settings.create({ key: 'global' })).toObject();
    } catch {
      doc = await Settings.findOne({ key: 'global' }).lean(); // created concurrently
    }
  }
  cache = doc;
  cachedAt = Date.now();
  return doc;
};

const NUMBER_FIELDS = [
  'gracePeriodMinutes', 'earlyCheckInMinutes', 'noShowFine', 'overstayFine', 'maxDurationHours',
  'maxActiveBookings', 'maxBookingsPerDay', 'advanceBookingDays', 'reminderMinutes', 'checkoutReminderMinutes',
  'openMinutes', 'closeMinutes', 'autoBlockNoShows', 'autoBlockDays',
];
const BOOLEAN_FIELDS = ['requireQrCheckIn', 'requireVerifiedEmail', 'hoursEnabled'];

const updateSettings = async (input) => {
  const updates = {};
  NUMBER_FIELDS.forEach((f) => {
    if (input[f] === undefined || input[f] === '') return;
    const n = Number(input[f]);
    if (!Number.isNaN(n)) updates[f] = n;
  });
  BOOLEAN_FIELDS.forEach((f) => { if (input[f] !== undefined) updates[f] = Boolean(input[f]); });

  if (input.timezone !== undefined) {
    if (!isValidTimeZone(input.timezone)) throw new AppError('Unknown time zone. Use a name like Asia/Kolkata.', 400);
    updates.timezone = input.timezone;
  }
  if (input.publicUrl !== undefined) {
    const url = String(input.publicUrl).trim().replace(/\/+$/, '');
    if (url && !/^https?:\/\/[^\s/]+/i.test(url)) throw new AppError('Site address must start with http:// or https://', 400);
    updates.publicUrl = url;
  }
  if (Array.isArray(input.closedWeekdays)) {
    updates.closedWeekdays = [...new Set(input.closedWeekdays.map(Number).filter((d) => d >= 0 && d <= 6))];
  }
  if (Array.isArray(input.holidays)) {
    updates.holidays = [...new Set(input.holidays.map((h) => String(h).trim()).filter((h) => /^\d{4}-\d{2}-\d{2}$/.test(h)))].sort();
  }
  const open = updates.openMinutes ?? (await getSettings()).openMinutes;
  const close = updates.closeMinutes ?? (await getSettings()).closeMinutes;
  if (close <= open) throw new AppError('Closing time must be after opening time.', 400);

  await getSettings(); // make sure the doc exists
  const doc = await Settings.findOneAndUpdate({ key: 'global' }, { $set: updates }, { new: true, runValidators: true }).lean();
  cache = doc;
  cachedAt = Date.now();
  return doc;
};

const publicSettings = (s) => ({
  gracePeriodMinutes: s.gracePeriodMinutes,
  earlyCheckInMinutes: s.earlyCheckInMinutes,
  noShowFine: s.noShowFine,
  overstayFine: s.overstayFine,
  maxDurationHours: s.maxDurationHours,
  maxActiveBookings: s.maxActiveBookings,
  maxBookingsPerDay: s.maxBookingsPerDay,
  advanceBookingDays: s.advanceBookingDays,
  requireQrCheckIn: s.requireQrCheckIn,
  requireVerifiedEmail: s.requireVerifiedEmail,
  publicUrl: s.publicUrl || '',
  timezone: s.timezone,
  hoursEnabled: s.hoursEnabled,
  openMinutes: s.openMinutes,
  closeMinutes: s.closeMinutes,
  closedWeekdays: s.closedWeekdays || [],
  holidays: s.holidays || [],
});

module.exports = { getSettings, updateSettings, publicSettings };
