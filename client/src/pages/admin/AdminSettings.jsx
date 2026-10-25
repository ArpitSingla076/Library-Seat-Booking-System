import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { adminAPI, errorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { PageHeader, Spinner, Field } from '../../components/ui';
import { Mail, CheckCircle2, AlertTriangle } from 'lucide-react';

const NUMBER_FIELDS = [
  ['gracePeriodMinutes', 'Check-in grace period (minutes)', 'Time after the start to check in before the booking is cancelled'],
  ['earlyCheckInMinutes', 'Early check-in window (minutes)', 'How long before the start check-in opens'],
  ['noShowFine', 'No-show fine (₹)', 'Charged when a student never checks in. Use 0 for no fine'],
  ['overstayFine', 'Overstay fine (₹)', 'Charged when a student checks in but never checks out'],
  ['maxDurationHours', 'Max booking length (hours)', 'Includes extensions'],
  ['maxActiveBookings', 'Max active bookings per student', ''],
  ['maxBookingsPerDay', 'Max bookings per student per day', ''],
  ['advanceBookingDays', 'Book up to N days ahead', ''],
  ['reminderMinutes', 'Check-in reminder before start (minutes)', 'Email + pop-up. 0 turns it off'],
  ['checkoutReminderMinutes', 'Check-out reminder before end (minutes)', 'Email + pop-up for checked-in students. 0 turns it off'],
  ['autoBlockNoShows', 'Auto-block after N no-shows', '0 = never block automatically'],
  ['autoBlockDays', '…within this many days', 'Window used for the rule above'],
];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const toTime = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const fromTime = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

const Check = ({ checked, onChange, title, children }) => (
  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: '0.9rem' }}>
    <input type="checkbox" style={{ marginTop: 4 }} checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span><b>{title}</b><span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{children}</span></span>
  </label>
);

export default function AdminSettings() {
  const [s, setS] = useState(null);
  const [saving, setSaving] = useState(false);
  const [holiday, setHoliday] = useState('');
  const [mail, setMail] = useState(null); // { configured, host, from }
  const { user } = useAuth();
  const [testTo, setTestTo] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    adminAPI.getSettings().then((r) => setS(r.data.settings)).catch((err) => toast.error(errorMessage(err)));
    adminAPI.emailStatus().then((r) => setMail(r.data)).catch(() => {});
  }, []);

  const set = (k) => (v) => setS((p) => ({ ...p, [k]: v }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await adminAPI.updateSettings(s);
      setS(res.data.settings);
      toast.success('Settings saved. They apply to new bookings immediately.');
    } catch (err) { toast.error(errorMessage(err)); }
    finally { setSaving(false); }
  };

  const sendTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await adminAPI.emailTest(testTo.trim());
      setTestResult(res.data);
      if (res.data.sent) toast.success(`Test email sent to ${res.data.to}`);
      else toast.error('Test email failed');
    } catch (err) { toast.error(errorMessage(err)); }
    finally { setTesting(false); }
  };

  if (!s) return <Spinner />;
  const closed = s.closedWeekdays || [];
  const holidays = s.holidays || [];

  return (
    <div className="page" style={{ maxWidth: 820, margin: '0 auto' }}>
      <PageHeader title="Settings" subtitle="Booking rules, fines, opening hours and check-in" />
      <div className="glass-card" style={{ padding: '1.25rem 1.5rem', marginBottom: '1.25rem' }}>
        <h3 style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}><Mail size={18} /> Email notifications</h3>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0.4rem 0 0.8rem' }}>
          Students get an email when they book a seat, before check-in and check-out time, and when a fine is added.
        </p>
        {user?.email?.endsWith('@library.edu') && (
          <p style={{ fontSize: '0.78rem', color: 'var(--warn-tx)', marginBottom: '0.6rem' }}>
            The demo admin address ({user.email}) does not really exist, so a test sent to it bounces. Type your own real email below.
          </p>
        )}
        {mail && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', fontWeight: 600, color: mail.configured ? 'var(--accent-green)' : 'var(--warn-tx)' }}>
            {mail.configured ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            {mail.configured ? `Ready: sending through ${({ brevo: 'Brevo', resend: 'Resend', webhook: 'your Gmail (Apps Script relay)', smtp: `SMTP (${mail.host})` })[mail.provider] || mail.provider}. From: ${mail.from}` : 'Not set up: emails are only written to the server log. Add BREVO_API_KEY (or MAIL_WEBHOOK_URL) to the server settings and restart. See the README.'}
          </div>
        )}
        <div style={{ marginTop: '0.9rem', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input className="input" type="email" style={{ maxWidth: 300 }} placeholder={`Send to (empty = ${user?.email || 'admin email'})`} value={testTo} onChange={(e) => setTestTo(e.target.value)} />
          <button type="button" className="btn-primary" disabled={testing} onClick={sendTest}>{testing ? 'Sending...' : 'Send test email'}</button>
          {testResult && (
            <span style={{ fontSize: '0.82rem', color: testResult.sent ? 'var(--accent-green)' : 'var(--danger-text)' }}>
              {testResult.sent ? `Sent to ${testResult.to}. Check your inbox (and spam).` : testResult.error}
            </span>
          )}
        </div>
      </div>

      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontWeight: 600, marginBottom: '1rem' }}>Rules and fines</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.1rem' }}>
            {NUMBER_FIELDS.map(([key, label, hint]) => (
              <Field key={key} label={label} hint={hint}>
                <input className="input" type="number" min="0" value={s[key]} onChange={(e) => set(key)(e.target.value)} required />
              </Field>
            ))}
          </div>
        </div>

        <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h3 style={{ fontWeight: 600 }}>Opening hours and holidays</h3>
          <Check checked={s.hoursEnabled} onChange={set('hoursEnabled')} title="Only allow bookings during opening hours">
            When off, students can book at any time of day.
          </Check>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
            <Field label="Opens"><input className="input" type="time" step="1800" value={toTime(s.openMinutes)} onChange={(e) => set('openMinutes')(fromTime(e.target.value))} /></Field>
            <Field label="Closes"><input className="input" type="time" step="1800" value={toTime(s.closeMinutes === 1440 ? 1439 : s.closeMinutes)} onChange={(e) => set('closeMinutes')(fromTime(e.target.value))} /></Field>
            <Field label="Time zone" hint="e.g. Asia/Kolkata"><input className="input" value={s.timezone} onChange={(e) => set('timezone')(e.target.value)} /></Field>
          </div>
          <Field label="Closed on these weekdays">
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {DAYS.map((d, i) => (
                <button type="button" key={d} className={`chip${closed.includes(i) ? ' chip-active' : ''}`} onClick={() => set('closedWeekdays')(closed.includes(i) ? closed.filter((x) => x !== i) : [...closed, i])}>{d}</button>
              ))}
            </div>
          </Field>
          <Field label="Holidays (library closed)">
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
              <input className="input" style={{ maxWidth: 180 }} type="date" value={holiday} onChange={(e) => setHoliday(e.target.value)} />
              <button type="button" className="btn-ghost" onClick={() => { if (holiday && !holidays.includes(holiday)) set('holidays')([...holidays, holiday].sort()); setHoliday(''); }}>Add date</button>
            </div>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {holidays.length === 0 && <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>No holidays added</span>}
              {holidays.map((h) => (
                <button type="button" key={h} className="chip chip-active" title="Click to remove" onClick={() => set('holidays')(holidays.filter((x) => x !== h))}>{h} ✕</button>
              ))}
            </div>
          </Field>
        </div>

        <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h3 style={{ fontWeight: 600 }}>Check-in and accounts</h3>
          <Field label="Site address used in seat QR codes" hint="Phones cannot open 'localhost'. Use your deployed site, or this computer's Wi-Fi address (shown as 'Network' when you run npm run dev), e.g. http://192.168.1.5:5173. Leave empty to use the address in your browser.">
            <input className="input" placeholder="https://library.example.com" value={s.publicUrl || ''} onChange={(e) => set('publicUrl')(e.target.value)} />
          </Field>
          <Check checked={s.requireQrCheckIn} onChange={set('requireQrCheckIn')} title="Require QR check-in">
            Students must scan the QR code on their seat (the plain Check-in button is hidden). Print codes from the QR Codes page first.
          </Check>
          <Check checked={s.requireVerifiedEmail} onChange={set('requireVerifiedEmail')} title="Require a verified email to book">
            Students must confirm their email address (Profile page) before they can book.
          </Check>
        </div>

        <div><button className="btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save settings'}</button></div>
      </form>
    </div>
  );
}