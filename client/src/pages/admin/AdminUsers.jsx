import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { Search, ShieldOff, ShieldCheck, BadgeCheck, History, Upload } from 'lucide-react';
import { adminAPI, errorMessage } from '../../services/api';
import { useDialog, PageHeader, Chip, Spinner, Pagination, Modal, StatusBadge } from '../../components/ui';

export default function AdminUsers() {
  const { prompt, confirm } = useDialog();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [blocked, setBlocked] = useState('');
  const [history, setHistory] = useState(null); // { user, bookings }
  const [showImport, setShowImport] = useState(false);
  const [csv, setCsv] = useState('');
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState(null);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params = { page: p, limit: 15, role: 'student' };
      if (query) params.q = query;
      if (blocked) params.isBlocked = blocked;
      const res = await adminAPI.getUsers(params);
      setUsers(res.data.users);
      setTotal(res.data.total);
      setPages(res.data.pages);
      setPage(p);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to load users'));
    } finally {
      setLoading(false);
    }
  }, [query, blocked]);

  useEffect(() => { load(1); }, [load]);
  useEffect(() => { const t = setTimeout(() => setQuery(q), 400); return () => clearTimeout(t); }, [q]);

  const toggleBlock = async (u) => {
    if (u.isBlocked) {
      if (!(await confirm({ title: `Unblock ${u.name}?`, confirmLabel: 'Unblock' }))) return;
      try { await adminAPI.blockUser(u._id, false); toast.success('User unblocked'); load(page); } catch (err) { toast.error(errorMessage(err)); }
    } else {
      const reason = await prompt({ title: `Block ${u.name}`, message: 'They will not be able to log in or book.', placeholder: 'Reason', required: true, confirmLabel: 'Block user', danger: true });
      if (!reason) return;
      try { await adminAPI.blockUser(u._id, true, reason); toast.success('User blocked'); load(page); } catch (err) { toast.error(errorMessage(err)); }
    }
  };

  const openHistory = async (u) => {
    try {
      const res = await adminAPI.getBookings({ userId: u._id, limit: 50 });
      setHistory({ user: u, bookings: res.data.bookings });
    } catch (err) { toast.error(errorMessage(err)); }
  };

  // CSV with a header row: name,email,studentId
  const parseCsv = (text) => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return [];
    const head = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const idx = (k) => head.indexOf(k);
    return lines.slice(1).map((l) => {
      const c = l.split(',').map((x) => x.trim().replace(/^"|"$/g, ''));
      return { name: c[idx('name')], email: c[idx('email')], studentId: idx('studentid') >= 0 ? c[idx('studentid')] : undefined };
    });
  };
  const runImport = async () => {
    const rows = parseCsv(csv);
    if (!rows.length) return toast.error('Add a header row (name,email,studentId) and at least one student');
    setImporting(true);
    try {
      const res = await adminAPI.importStudents(rows);
      setReport(res.data);
      toast.success(`${res.data.created.length} student(s) created`);
      load(1);
    } catch (err) { toast.error(errorMessage(err)); }
    finally { setImporting(false); }
  };
  const onFile = (e) => { const f = e.target.files?.[0]; if (f) f.text().then(setCsv); };

  return (
    <div className="page">
      <PageHeader title="Students" subtitle={`${total} registered`}>
        <button className="btn-ghost" onClick={() => { setReport(null); setShowImport(true); }}><Upload size={15} /> Import CSV</button>
      </PageHeader>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.25rem', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 340 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input className="input" style={{ paddingLeft: '2.2rem' }} placeholder="Search name, email or student ID" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {[['', 'All'], ['false', 'Active'], ['true', 'Blocked']].map(([v, l]) => <Chip key={v} active={blocked === v} onClick={() => setBlocked(v)}>{l}</Chip>)}
      </div>

      {loading ? <Spinner /> : (
        <div className="table-wrapper">
          <table>
            <thead><tr><th>Student</th><th>Student ID</th><th>Joined</th><th>Unpaid fines</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u._id}>
                  <td>
                    <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>{u.name}{u.emailVerified && <BadgeCheck size={13} color="var(--accent-green)" title="Email verified" />}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{u.email}</div>
                  </td>
                  <td>{u.studentId || '-'}</td>
                  <td>{format(new Date(u.createdAt), 'd MMM yyyy')}</td>
                  <td>{u.unpaidFines > 0 ? <span style={{ color: 'var(--accent-red)', fontWeight: 600 }}>₹{u.unpaidFines}</span> : '-'}</td>
                  <td>
                    {u.isBlocked ? <span className="badge badge-cancelled" title={u.blockedReason || ''}>Blocked</span> : <span className="badge badge-active">Active</span>}
                  </td>
                  <td>
                    <button className="btn-ghost" style={{ fontSize: '0.75rem', padding: '0.3rem 0.7rem', marginRight: 6 }} onClick={() => openHistory(u)}><History size={12} /> History</button>
                    <button className={u.isBlocked ? 'btn-ghost' : 'btn-danger'} style={{ fontSize: '0.75rem', padding: '0.3rem 0.7rem' }} onClick={() => toggleBlock(u)}>
                      {u.isBlocked ? <><ShieldCheck size={12} /> Unblock</> : <><ShieldOff size={12} /> Block</>}
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>No students found</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} pages={pages} onChange={load} />

      {history && (
        <Modal title={`${history.user.name} · booking history`} onClose={() => setHistory(null)} maxWidth={640}>
          {history.bookings.length === 0 ? <p style={{ color: 'var(--text-secondary)' }}>No bookings yet.</p> : (
            <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {history.bookings.map((b) => (
                <div key={b._id} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', padding: '0.55rem 0', borderBottom: '1px solid var(--border)', fontSize: '0.85rem', flexWrap: 'wrap' }}>
                  <b style={{ minWidth: 48 }}>{b.seat?.seatNumber}</b>
                  <span style={{ flex: 1, minWidth: 170 }}>{format(new Date(b.startTime), 'd MMM yyyy, h:mm a')} → {format(new Date(b.endTime), 'h:mm a')}</span>
                  <StatusBadge status={b.status} />
                  {b.fineAmount > 0 && <span style={{ color: b.finePaid || b.fineWaived ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 600 }}>₹{b.fineAmount}</span>}
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {showImport && (
        <Modal title="Import students from CSV" onClose={() => setShowImport(false)} maxWidth={620}>
          {report ? (
            <div style={{ fontSize: '0.85rem' }}>
              <p><b>{report.created.length}</b> created, <b>{report.failed.length}</b> failed. Each new student gets an email to set a password.</p>
              {report.created.some((c) => c.setPasswordUrl) && (
                <p style={{ margin: '0.6rem 0', color: 'var(--text-secondary)' }}>Email is not configured, so use these set-password links:</p>
              )}
              <div style={{ maxHeight: '38vh', overflowY: 'auto', marginTop: '0.5rem' }}>
                {report.created.map((c) => <div key={c.email} style={{ padding: '0.25rem 0', wordBreak: 'break-all' }}>✓ {c.name} ({c.email}){c.setPasswordUrl && <> — <a href={c.setPasswordUrl.replace(/^https?:\/\/[^/]+/, '')} style={{ color: 'var(--accent)' }}>set-password link</a></>}</div>)}
                {report.failed.map((f, i) => <div key={i} style={{ padding: '0.25rem 0', color: 'var(--accent-red)' }}>✗ row {f.row} {f.email}: {f.reason}</div>)}
              </div>
              <button className="btn-primary" style={{ marginTop: '1rem' }} onClick={() => setShowImport(false)}>Done</button>
            </div>
          ) : (
            <>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.6rem' }}>First line must be the header: <code>name,email,studentId</code> (studentId is optional). Up to 500 rows.</p>
              <input type="file" accept=".csv,text/csv" onChange={onFile} style={{ marginBottom: '0.6rem', fontSize: '0.82rem' }} />
              <textarea className="input" rows={7} placeholder={'name,email,studentId\nAsha Verma,asha@college.edu,STU101'} value={csv} onChange={(e) => setCsv(e.target.value)} style={{ fontFamily: 'monospace', fontSize: '0.8rem' }} />
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
                <button className="btn-ghost" onClick={() => setShowImport(false)}>Cancel</button>
                <button className="btn-primary" disabled={importing} onClick={runImport}>{importing ? 'Importing...' : 'Import'}</button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
