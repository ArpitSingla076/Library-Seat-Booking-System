import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Printer, Copy, ExternalLink, AlertTriangle } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { seatsAPI, adminAPI, errorMessage } from '../../services/api';
import { PageHeader, Chip, Spinner, Field } from '../../components/ui';

const isLocal = (u) => /^https?:\/\/(localhost|127\.0\.0\.1)/i.test(u);

// Printable sheet of per-seat QR codes. Students scan one to check in.
export default function AdminQrCodes() {
  const [seats, setSeats] = useState([]);
  const [sections, setSections] = useState([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [base, setBase] = useState('');
  const [saved, setSaved] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([seatsAPI.getSections({ all: true }), seatsAPI.getAll({}), adminAPI.getSettings()])
      .then(([s, st, cfg]) => {
        setSections(s.data.sections);
        setSeats(st.data.seats);
        const url = cfg.data.settings.publicUrl || '';
        setBase(url);
        setSaved(url);
      })
      .catch((err) => toast.error(errorMessage(err, 'Failed to load seats')))
      .finally(() => setLoading(false));
  }, []);

  const origin = (base || window.location.origin).replace(/\/+$/, '');
  const linkFor = (seat) => `${origin}/checkin?t=${seat.qrToken}`;
  const shown = seats.filter((s) => s.qrToken && (!filter || s.section?._id === filter));

  const saveBase = async () => {
    setSaving(true);
    try {
      const res = await adminAPI.updateSettings({ publicUrl: base });
      setSaved(res.data.settings.publicUrl || '');
      toast.success('Saved. Print the QR codes again if you changed the address.');
    } catch (err) { toast.error(errorMessage(err)); }
    finally { setSaving(false); }
  };

  const copy = async (seat) => {
    try { await navigator.clipboard.writeText(linkFor(seat)); toast.success('Check-in link copied'); }
    catch { toast.error('Could not copy. Right-click the Open link and copy it instead.'); }
  };

  return (
    <div className="page">
      <PageHeader title="Seat QR Codes" subtitle="Print and stick one on each seat. Students scan it to check in.">
        <button className="btn-primary no-print" onClick={() => window.print()}><Printer size={15} /> Print</button>
      </PageHeader>

      <div className="glass-card no-print" style={{ padding: '1.1rem 1.25rem', marginBottom: '1.25rem' }}>
        <Field label="Site address inside the QR codes" hint="This is what a phone opens when it scans a code.">
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input className="input" style={{ flex: '1 1 260px' }} placeholder={window.location.origin} value={base} onChange={(e) => setBase(e.target.value)} />
            <button className="btn-primary" disabled={saving || base === saved} onClick={saveBase}>{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </Field>
        {isLocal(origin) && (
          <div style={{ display: 'flex', gap: 8, marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--warn-tx)', background: 'var(--warn-bg)', border: '1px solid var(--warn-bd)', borderRadius: 8, padding: '0.6rem 0.8rem' }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>These codes point to <b>{origin}</b>, which a phone cannot open (on a phone, "localhost" means the phone itself). Enter this computer's Wi-Fi address (for example <code>http://192.168.1.5:5173</code>, shown as "Network" in the terminal after <code>npm run dev</code>) or your deployed website. The in-app camera scanner and the "paste link" box work either way.</span>
          </div>
        )}
      </div>

      <div className="no-print" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <Chip active={!filter} onClick={() => setFilter('')}>All</Chip>
        {sections.map((s) => <Chip key={s._id} active={filter === s._id} onClick={() => setFilter(s._id)}>{s.name}</Chip>)}
      </div>

      {loading ? <Spinner /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem' }}>
          {shown.map((s) => (
            <div key={s._id} className="glass-card" style={{ padding: '1rem', textAlign: 'center', breakInside: 'avoid' }}>
              <div className="qr-box"><QRCodeSVG value={linkFor(s)} size={128} level="M" marginSize={1} /></div>
              <div style={{ fontWeight: 700, marginTop: '0.5rem' }}>{s.kind === 'room' ? 'Room' : 'Seat'} {s.seatNumber}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{s.section?.name}</div>
              <div className="no-print" style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: '0.6rem' }}>
                <button className="btn-ghost" style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem' }} onClick={() => copy(s)}><Copy size={12} /> Copy link</button>
                <a className="btn-ghost" style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem', textDecoration: 'none' }} href={linkFor(s)} target="_blank" rel="noreferrer"><ExternalLink size={12} /> Open</a>
              </div>
            </div>
          ))}
          {shown.length === 0 && <p style={{ color: 'var(--text-secondary)' }}>No seats with QR codes yet. Run <code>npm run seed</code>, or restart the server once to generate codes for existing seats.</p>}
        </div>
      )}
    </div>
  );
}
