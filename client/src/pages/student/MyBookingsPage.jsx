import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { CalendarDays, Zap, X, Clock, LogOut, IndianRupee, PlusCircle, ScanLine } from 'lucide-react';
import { bookingsAPI, errorMessage } from '../../services/api';
import QrScanner, { extractQrToken } from '../../components/QrScanner';
import { useSettings } from '../../context/SettingsContext';
import { useSocket } from '../../context/SocketContext';
import { useT } from '../../i18n';
import { useDialog, StatusBadge, PageHeader, Chip, Spinner, Empty, Pagination, Modal } from '../../components/ui';

const FILTERS = ['', 'active', 'completed', 'cancelled', 'expired', 'no_show'];

export default function MyBookingsPage() {
  const { settings } = useSettings();
  const { t } = useT();
  const { on } = useSocket();
  const { confirm } = useDialog();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('');
  const [extending, setExtending] = useState(null);
  const [scanFor, setScanFor] = useState(null); // booking being checked in by QR
  const [pasteCode, setPasteCode] = useState('');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 20000); return () => clearInterval(t); }, []);

  const load = useCallback(async (p = page, s = status) => {
    try {
      const params = { page: p, limit: 10 };
      if (s) params.status = s;
      const res = await bookingsAPI.getMy(params);
      setBookings(res.data.bookings);
      setTotal(res.data.total);
      setPages(res.data.pages);
      setPage(p);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to load bookings'));
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => { setLoading(true); load(1, status); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => on('notification', () => load(page, status)), [on, load, page, status]);

  const act = async (fn, okMsg) => {
    try {
      await fn();
      toast.success(okMsg);
      load(page, status);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const cancel = async (b) => {
    const ok = await confirm({ title: 'Cancel booking?', message: `Seat ${b.seat?.seatNumber} on ${format(new Date(b.startTime), 'd MMM, h:mm a')} will be released.`, confirmLabel: 'Cancel booking', danger: true });
    if (ok) act(() => bookingsAPI.cancel(b._id, 'User cancelled'), 'Booking cancelled');
  };

  const stateOf = (b) => {
    if (b.status !== 'active') return null;
    return new Date(b.startTime) > new Date() ? 'upcoming' : 'inprogress';
  };

  const maxExtra = (b) => Math.max(0, settings.maxDurationHours * 60 - (new Date(b.endTime) - new Date(b.startTime)) / 60000);

  return (
    <div className="page" style={{ maxWidth: 900, margin: '0 auto' }}>
      <PageHeader title={t('myBookingsTitle')} subtitle={`${total} booking${total !== 1 ? 's' : ''} total`}>
        <Link to="/seats" className="btn-primary" style={{ textDecoration: 'none' }}>{t('bookSeat')}</Link>
      </PageHeader>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        {FILTERS.map((s) => <Chip key={s} active={status === s} onClick={() => setStatus(s)}>{s ? s.replace('_', ' ') : 'All'}</Chip>)}
      </div>

      {loading ? <Spinner /> : bookings.length === 0 ? <Empty icon={CalendarDays} text="No bookings found" /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {bookings.map((b) => {
            const st = stateOf(b);
            const unpaid = b.fineAmount > 0 && !b.finePaid && !b.fineWaived;
            return (
              <div key={b._id} className="glass-card fade-in" style={{ padding: '1.1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: b.status === 'active' ? 'rgba(37,99,235,0.08)' : 'var(--bg-primary)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.75rem', flexShrink: 0, color: b.status === 'active' ? 'var(--accent)' : 'var(--text-secondary)' }}>
                  {b.seat?.seatNumber}
                </div>

                <div style={{ flex: 1, minWidth: 190 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{b.section?.name}</span>
                    {st ? <span className={`badge badge-${st}`}>{st === 'upcoming' ? 'upcoming' : 'in progress'}</span> : <StatusBadge status={b.status} />}
                    {b.checkInTime && b.status === 'active' && <span className="badge badge-inprogress">✓ checked in</span>}
                    {b.fineAmount > 0 && (
                      <span className="badge" style={{ background: b.finePaid || b.fineWaived ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: b.finePaid || b.fineWaived ? '#16a34a' : '#ef4444' }}>
                        {b.fineWaived ? 'Fine waived' : b.finePaid ? '✓ Fine paid' : `Unpaid fine ₹${b.fineAmount}`}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' }}>
                    <Clock size={12} />
                    {format(new Date(b.startTime), 'EEE d MMM, h:mm a')} → {format(new Date(b.endTime), 'h:mm a')} ({b.durationMinutes} min){b.groupSize > 1 && <> · {b.groupSize} people</>}{b.recurrenceId && <> · weekly</>}
                  </div>
                  {b.fineAmount > 0 && b.fineReason && <div style={{ fontSize: '0.74rem', color: '#ef4444', marginTop: 2 }}>{b.fineReason}</div>}
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {b.status === 'active' && !b.checkInTime && now < new Date(b.startTime).getTime() - settings.earlyCheckInMinutes * 60000 && (
                    <span className="badge badge-upcoming" title="Check-in is not open yet">
                      Check-in opens {format(new Date(new Date(b.startTime).getTime() - settings.earlyCheckInMinutes * 60000), 'h:mm a')}
                    </span>
                  )}
                  {b.status === 'active' && !b.checkInTime && now >= new Date(b.startTime).getTime() - settings.earlyCheckInMinutes * 60000 && (
                    settings.requireQrCheckIn ? (
                      <button className="btn-primary" style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }} onClick={() => { setPasteCode(''); setScanFor(b); }}><ScanLine size={13} /> Scan seat QR to check in</button>
                    ) : (
                      <button className="btn-primary" style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }} onClick={() => act(() => bookingsAPI.checkIn(b._id), 'Checked in!')}><Zap size={13} /> {t('checkIn')}</button>
                    )
                  )}
                  {b.status === 'active' && b.checkInTime && (
                    <>
                      {maxExtra(b) >= 30 && (
                        <button className="btn-ghost" style={{ fontSize: '0.78rem' }} onClick={() => setExtending(b)}><PlusCircle size={13} /> {t('extend')}</button>
                      )}
                      <button className="btn-primary" style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem', background: 'var(--accent-green)', borderColor: 'var(--accent-green)' }} onClick={() => act(() => bookingsAPI.checkOut(b._id), 'Checked out')}><LogOut size={13} /> {t('checkOut')}</button>
                    </>
                  )}
                  {b.status === 'active' && !b.checkInTime && (
                    <button className="btn-danger" style={{ fontSize: '0.78rem' }} onClick={() => cancel(b)}><X size={13} /> {t('cancel')}</button>
                  )}
                  {unpaid && (
                    <Link to="/fines" className="btn-primary" style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem', background: 'var(--accent-yellow)', borderColor: 'var(--accent-yellow)', textDecoration: 'none' }}><IndianRupee size={13} /> Pay fine</Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Pagination page={page} pages={pages} onChange={(p) => load(p, status)} />

      {scanFor && (
        <Modal title={`Scan the QR code on seat ${scanFor.seat?.seatNumber}`} onClose={() => setScanFor(null)} maxWidth={400}>
          <QrScanner onScan={(text) => {
            const token = extractQrToken(text);
            const b = scanFor;
            setScanFor(null);
            if (!token) return toast.error('That is not a seat QR code.');
            act(() => bookingsAPI.checkIn(b._id, token), 'Checked in!');
          }} />
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '0.75rem' }}>
            Point the camera at the QR code stuck on your seat.
          </p>
          <form style={{ marginTop: '0.75rem' }} onSubmit={(e) => {
            e.preventDefault();
            const token = extractQrToken(pasteCode);
            const b = scanFor;
            if (!token) return toast.error('Paste the full link from the QR code.');
            setScanFor(null);
            act(() => bookingsAPI.checkIn(b._id, token), 'Checked in!');
          }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>No camera? Paste the link from the QR code</label>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.3rem' }}>
              <input className="input" placeholder="http://…/checkin?t=…" value={pasteCode} onChange={(e) => setPasteCode(e.target.value)} />
              <button className="btn-ghost" type="submit">Go</button>
            </div>
          </form>
        </Modal>
      )}

      {extending && (
        <Modal title={`Extend seat ${extending.seat?.seatNumber}`} onClose={() => setExtending(null)} maxWidth={380}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            Currently ends at {format(new Date(extending.endTime), 'h:mm a')}. Extension works only if nobody has booked the seat right after you.
          </p>
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            {[30, 60, 90].filter((m) => m <= maxExtra(extending)).map((m) => (
              <button key={m} className="btn-primary" onClick={() => { const id = extending._id; setExtending(null); act(() => bookingsAPI.extend(id, m), `Extended by ${m} min`); }}>
                +{m} min
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
