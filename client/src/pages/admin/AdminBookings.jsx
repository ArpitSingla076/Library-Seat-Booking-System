import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { Search, Download, UserCheck } from 'lucide-react';
import { adminAPI, errorMessage } from '../../services/api';
import { useDialog, StatusBadge, PageHeader, Chip, Spinner, Pagination, downloadBlob } from '../../components/ui';

const STATUSES = ['', 'active', 'completed', 'cancelled', 'expired', 'no_show'];

export default function AdminBookings() {
  const { prompt } = useDialog();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [f, setF] = useState({ status: '', q: '', from: '', to: '' });
  const [q, setQ] = useState('');

  const params = useCallback((p) => {
    const o = { page: p, limit: 15 };
    Object.entries(f).forEach(([k, v]) => { if (v) o[k] = v; });
    return o;
  }, [f]);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const res = await adminAPI.getBookings(params(p));
      setRows(res.data.bookings);
      setTotal(res.data.total);
      setPages(res.data.pages);
      setPage(p);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to fetch bookings'));
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => { load(1); }, [load]);

  // debounce the search box
  useEffect(() => { const t = setTimeout(() => setF((p) => (p.q === q ? p : { ...p, q })), 400); return () => clearTimeout(t); }, [q]);

  const cancel = async (b) => {
    const reason = await prompt({ title: 'Cancel booking', message: `Seat ${b.seat?.seatNumber} · ${b.user?.name}. The student will be notified.`, placeholder: 'Reason (shown to the student)', required: true, confirmLabel: 'Cancel booking', danger: true });
    if (!reason) return;
    try {
      await adminAPI.cancelBooking(b._id, reason);
      toast.success('Booking cancelled');
      load(page);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const manualCheckIn = async (b) => {
    try {
      await adminAPI.checkInBooking(b._id);
      toast.success(`${b.user?.name} checked in`);
      load(page);
    } catch (err) { toast.error(errorMessage(err)); }
  };

  const exportCsv = async () => {
    try {
      const { page: _p, limit: _l, ...rest } = params(1);
      const res = await adminAPI.exportBookings(rest);
      downloadBlob(res.data, `bookings-${format(new Date(), 'yyyy-MM-dd')}.csv`);
    } catch (err) {
      toast.error(errorMessage(err, 'Export failed'));
    }
  };

  return (
    <div className="page">
      <PageHeader title="All Bookings" subtitle={`${total} total`}>
        <button className="btn-ghost" onClick={exportCsv}><Download size={15} /> Export CSV</button>
      </PageHeader>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 320 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input className="input" style={{ paddingLeft: '2.2rem' }} placeholder="Search student name, email, ID" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
          From <input className="input" style={{ width: 150 }} type="date" value={f.from} onChange={(e) => setF((p) => ({ ...p, from: e.target.value }))} />
        </label>
        <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
          To <input className="input" style={{ width: 150 }} type="date" value={f.to} min={f.from} onChange={(e) => setF((p) => ({ ...p, to: e.target.value }))} />
        </label>
        {(f.from || f.to) && <button className="btn-ghost" onClick={() => setF((p) => ({ ...p, from: '', to: '' }))}>Clear dates</button>}
      </div>
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        {STATUSES.map((s) => <Chip key={s} active={f.status === s} onClick={() => setF((p) => ({ ...p, status: s }))}>{s ? s.replace('_', ' ') : 'All'}</Chip>)}
      </div>

      {loading ? <Spinner /> : (
        <div className="table-wrapper">
          <table>
            <thead><tr><th>Student</th><th>Seat</th><th>Section</th><th>Time</th><th>Status</th><th>Fine</th><th></th></tr></thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b._id}>
                  <td><div style={{ fontWeight: 600 }}>{b.user?.name}</div><div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{b.user?.studentId || b.user?.email}</div></td>
                  <td style={{ fontWeight: 600 }}>{b.seat?.seatNumber}</td>
                  <td>{b.section?.name}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{format(new Date(b.startTime), 'd MMM, h:mm a')} → {format(new Date(b.endTime), 'h:mm a')}</td>
                  <td><StatusBadge status={b.status} />{b.checkInTime && b.status === 'active' && <span style={{ marginLeft: 6, fontSize: '0.7rem', color: 'var(--accent-green)' }}>in</span>}</td>
                  <td>{b.fineAmount > 0 ? <span style={{ color: b.finePaid || b.fineWaived ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 600 }}>₹{b.fineAmount}{b.finePaid ? ' paid' : b.fineWaived ? ' waived' : ''}</span> : '-'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{b.status === 'active' && !b.checkInTime && <button className="btn-ghost" style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', marginRight: 6 }} onClick={() => manualCheckIn(b)}><UserCheck size={12} /> Check in</button>}{b.status === 'active' && <button className="btn-danger" style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }} onClick={() => cancel(b)}>Cancel</button>}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>No bookings match your filters</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} pages={pages} onChange={load} />
    </div>
  );
}
