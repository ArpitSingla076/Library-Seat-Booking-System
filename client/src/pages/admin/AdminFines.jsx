import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { HandCoins, Download, Banknote } from 'lucide-react';
import { adminAPI, errorMessage } from '../../services/api';
import { useDialog, PageHeader, Chip, Spinner, Pagination, downloadBlob } from '../../components/ui';

export default function AdminFines() {
  const { prompt, confirm } = useDialog();
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({ outstandingAmount: 0, outstandingCount: 0, collectedAmount: 0, paymentsCount: 0 });
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('unpaid');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params = { page: p, limit: 15 };
      if (status) params.fineStatus = status;
      const res = await adminAPI.getFines(params);
      setRows(res.data.bookings);
      setSummary(res.data.summary);
      setPages(res.data.pages);
      setPage(p);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to load fines'));
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { load(1); }, [load]);

  const waive = async (b) => {
    const reason = await prompt({ title: `Waive ₹${b.fineAmount} fine`, message: `${b.user?.name} · seat ${b.seat?.seatNumber}. The student will be notified.`, placeholder: 'Reason for waiving', required: true, confirmLabel: 'Waive fine' });
    if (!reason) return;
    try {
      await adminAPI.waiveFine(b._id, reason);
      toast.success('Fine waived');
      load(page);
    } catch (err) { toast.error(errorMessage(err)); }
  };

  const markPaid = async (b) => {
    const ok = await confirm({ title: `Record ₹${b.fineAmount} as paid?`, message: `${b.user?.name} paid this fine in cash at the desk. A receipt is created and the student is notified.`, confirmLabel: 'Mark as paid' });
    if (!ok) return;
    try {
      await adminAPI.markPaid(b._id, 'cash');
      toast.success('Fine marked as paid');
      load(page);
    } catch (err) { toast.error(errorMessage(err)); }
  };

  const exportCsv = async () => {
    try {
      const params = { hasFine: 'true' };
      if (status) params.fineStatus = status;
      const res = await adminAPI.exportBookings(params);
      downloadBlob(res.data, `fines-${format(new Date(), 'yyyy-MM-dd')}.csv`);
    } catch (err) { toast.error(errorMessage(err, 'Export failed')); }
  };

  const Stat = ({ label, value, color }) => (
    <div className="stat-card"><div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div><div style={{ fontSize: '1.8rem', fontWeight: 700, color }}>{value}</div></div>
  );

  return (
    <div className="page">
      <PageHeader title="Fines" subtitle="Review, track and waive fines">
        <button className="btn-ghost" onClick={exportCsv}><Download size={15} /> Export CSV</button>
      </PageHeader>
      <div className="grid-auto" style={{ marginBottom: '1.5rem' }}>
        <Stat label="Outstanding" value={`₹${summary.outstandingAmount}`} color="var(--accent-red)" />
        <Stat label="Unpaid fines" value={summary.outstandingCount} color="var(--accent-yellow)" />
        <Stat label="Collected" value={`₹${summary.collectedAmount}`} color="var(--accent-green)" />
        <Stat label="Payments" value={summary.paymentsCount} color="var(--accent)" />
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        {[['unpaid', 'Unpaid'], ['paid', 'Paid'], ['waived', 'Waived'], ['', 'All']].map(([v, l]) => <Chip key={v} active={status === v} onClick={() => setStatus(v)}>{l}</Chip>)}
      </div>

      {loading ? <Spinner /> : (
        <div className="table-wrapper">
          <table>
            <thead><tr><th>Student</th><th>Seat</th><th>Date</th><th>Reason</th><th>Amount</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b._id}>
                  <td><div style={{ fontWeight: 600 }}>{b.user?.name}</div><div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{b.user?.studentId || b.user?.email}</div></td>
                  <td>{b.seat?.seatNumber}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{format(new Date(b.startTime), 'd MMM, h:mm a')}</td>
                  <td style={{ maxWidth: 260, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{b.fineReason}</td>
                  <td style={{ fontWeight: 700 }}>₹{b.fineAmount}</td>
                  <td>{b.fineWaived ? <span className="badge badge-completed" title={b.fineWaivedReason || ''}>Waived</span> : b.finePaid ? <span className="badge badge-active">Paid</span> : <span className="badge badge-no_show">Unpaid</span>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{!b.finePaid && !b.fineWaived && (<><button className="btn-primary" style={{ fontSize: '0.75rem', padding: '0.3rem 0.7rem', marginRight: 6 }} onClick={() => markPaid(b)}><Banknote size={12} /> Paid (cash)</button><button className="btn-ghost" style={{ fontSize: '0.75rem', padding: '0.3rem 0.7rem' }} onClick={() => waive(b)}><HandCoins size={12} /> Waive</button></>)}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>No fines</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} pages={pages} onChange={load} />
    </div>
  );
}
