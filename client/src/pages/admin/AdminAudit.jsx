import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { adminAPI, errorMessage } from '../../services/api';
import { PageHeader, Chip, Spinner, Pagination } from '../../components/ui';

const GROUPS = [['', 'All'], ['booking', 'Bookings'], ['fine', 'Fines'], ['user', 'Users'], ['seat', 'Seats'], ['section', 'Sections'], ['settings', 'Settings']];

export default function AdminAudit() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [group, setGroup] = useState('');

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const res = await adminAPI.getAudit({ page: p, limit: 25, ...(group ? { action: group } : {}) });
      setLogs(res.data.logs);
      setPages(res.data.pages);
      setPage(p);
    } catch (err) { toast.error(errorMessage(err)); }
    finally { setLoading(false); }
  }, [group]);

  useEffect(() => { load(1); }, [load]);

  return (
    <div className="page">
      <PageHeader title="Audit Log" subtitle="Who did what in the admin panel" />
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        {GROUPS.map(([v, l]) => <Chip key={v} active={group === v} onClick={() => setGroup(v)}>{l}</Chip>)}
      </div>
      {loading ? <Spinner /> : (
        <div className="table-wrapper">
          <table>
            <thead><tr><th>When</th><th>Admin</th><th>Action</th><th>Details</th></tr></thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l._id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{format(new Date(l.createdAt), 'd MMM yyyy, h:mm a')}</td>
                  <td>{l.adminName}</td>
                  <td><code style={{ fontSize: '0.78rem' }}>{l.action}</code></td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', maxWidth: 380 }}>{l.details}</td>
                </tr>
              ))}
              {logs.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>No activity recorded yet</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} pages={pages} onChange={load} />
    </div>
  );
}
