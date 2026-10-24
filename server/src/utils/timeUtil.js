/** Time helpers that work in the library time zone (Settings.timezone) using only Intl. */
const parts = (date, timeZone) => {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  const o = {};
  fmt.formatToParts(date).forEach((p) => { o[p.type] = p.value; });
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(o.weekday);
  return { dayKey: `${o.year}-${o.month}-${o.day}`, weekday, minutes: Number(o.hour) * 60 + Number(o.minute) };
};

const isValidTimeZone = (tz) => {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
};

// Start (UTC instant) of the library-local day that contains `date`
const dayStart = (date, timeZone) => new Date(date.getTime() - parts(date, timeZone).minutes * 60000 - date.getUTCSeconds() * 1000 - date.getUTCMilliseconds());

const fmtMinutes = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

module.exports = { parts, isValidTimeZone, dayStart, fmtMinutes };
