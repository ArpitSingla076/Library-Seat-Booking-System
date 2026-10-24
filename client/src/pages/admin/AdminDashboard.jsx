import { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { Armchair, CalendarDays, Users, TrendingUp, Activity, IndianRupee, Clock } from 'lucide-react';
import { adminAPI, errorMessage } from '../../services/api';
import { useSocket } from '../../context/SocketContext';
import { PageHeader, Spinner } from '../../components/ui';

const StatCard = ({ icon: Icon, label, value, sub, color = '#2563eb' }) => (
  <div className="stat-card">
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={18} color={color} />
      </div>
    </div>
    <div style={{ fontSize: '2rem', fontWeight: 700, lineHeight: 1.1 }}>{value}</div>
    {sub && <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{sub}</div>}
  </div>
);

// Simple dependency-free vertical bar chart
const BarChart = ({ data, color = '#2563eb', height = 140 }) => {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height, paddingTop: 18 }}>
      {data.map((d) => (
        <div key={d.label} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }} title={`${d.label}: ${d.value}`}>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginBottom: 2 }}>{d.value || ''}</div>
          <div style={{ width: '100%', maxWidth: 38, height: `${(d.value / max) * 100}%`, minHeight: d.value ? 3 : 1, background: d.value ? color : 'var(--border)', borderRadius: '4px 4px 0 0', transition: 'height 0.4s' }} />
          <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: 4, whiteSpace: 'nowrap' }}>{d.label}</div>
        </div>
      ))}
    </div>
  );
};

const statusColors = { active: '#2563eb', completed: '#10b981', cancelled: '#ef4444', expired: '#64748b', no_show: '#f59e0b' };
const hourLabel = (h) => (h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`);

export default function AdminDashboard() {
  const { on } = useSocket();
  const [a, setA] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setA((await adminAPI.getAnalytics()).data.analytics);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to load analytics'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // live refresh on any seat change (debounced) + a slow poll as a safety net
  const timer = useRef(null);
  useEffect(() => on('seat_update', () => { clearTimeout(timer.current); timer.current = setTimeout(load, 500); }), [on, load]);
  useEffect(() => { const t = setInterval(load, 60000); return () => { clearInterval(t); clearTimeout(timer.current); }; }, [load]);

  if (loading) return <Spinner label="Loading analytics..." />;
  if (!a) {
    return (
      <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', maxWidth: 400, margin: '4rem auto' }}>
        <p style={{ color: 'var(--accent-red)', fontWeight: 600, marginBottom: '1rem' }}>Failed to load dashboard analytics</p>
        <button className="btn-primary" style={{ justifyContent: 'center', width: '100%' }} onClick={() => { setLoading(true); load(); }}>Retry</button>
      </div>
    );
  }

  const { seats, bookings, users, sections, fines, noShowLeaders = [] } = a;
  const occupancy = seats.bookable ? Math.round((seats.occupiedNow / seats.bookable) * 100) : 0;
  const statusTotal = Object.values(bookings.statusBreakdown).reduce((x, y) => x + y, 0);
  const hours = bookings.peakHours.map((v, h) => ({ label: hourLabel(h), value: v })).slice(6, 23); // 6am-10pm

  return (
    <div className="page">
      <PageHeader title="Dashboard" subtitle="Live library seat utilization" />

      <div className="grid-auto" style={{ marginBottom: '1.5rem' }}>
        <StatCard icon={Armchair} label="Total seats" value={seats.total} sub={`${seats.maintenance} in maintenance`} color="#2563eb" />
        <StatCard icon={Activity} label="Occupied now" value={seats.occupiedNow} sub={`${occupancy}% · ${seats.availableNow} free`} color="#ef4444" />
        <StatCard icon={CalendarDays} label="Today's bookings" value={bookings.today} sub={`${bookings.thisWeek} this week · ${bookings.upcoming} upcoming`} color="#10b981" />
        <StatCard icon={Users} label="Students" value={users.total} sub={`${users.blocked} blocked`} color="#f59e0b" />
        <StatCard icon={IndianRupee} label="Fines outstanding" value={`₹${fines.outstandingAmount}`} sub={`${fines.outstandingCount} unpaid · ₹${fines.collectedAmount} collected`} color="#8b5cf6" />
      </div>

      <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <h3 style={{ fontWeight: 600 }}>Current occupancy</h3>
          <span style={{ fontSize: '1.5rem', fontWeight: 700, color: occupancy > 80 ? 'var(--accent-red)' : occupancy > 50 ? 'var(--accent-yellow)' : 'var(--accent-green)' }}>{occupancy}%</span>
        </div>
        <div style={{ height: 10, background: 'var(--border)', borderRadius: 9999, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${occupancy}%`, background: occupancy > 80 ? 'var(--accent-red)' : 'var(--accent)', borderRadius: 9999, transition: 'width 0.5s' }} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: 8 }}><TrendingUp size={18} /> Bookings, last 7 days</h3>
          <BarChart data={bookings.perDay.map((d) => ({ label: d.label, value: d.count }))} />
        </div>
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: 8 }}><Clock size={18} /> Peak hours (last 30 days)</h3>
          <BarChart data={hours} color="#10b981" />
        </div>
      </div>

      <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <h3 style={{ fontWeight: 600, marginBottom: '0.75rem' }}>No-show leaderboard (last 30 days)</h3>
        {noShowLeaders.length === 0 ? <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No no-shows. 🎉</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {noShowLeaders.map((u, i) => (
              <div key={u._id} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', fontSize: '0.88rem' }}>
                <span style={{ width: 22, color: 'var(--text-secondary)' }}>{i + 1}.</span>
                <span style={{ flex: 1 }}><b>{u.name || 'Unknown'}</b> <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>{u.studentId || u.email}</span></span>
                <span className="badge badge-no_show">{u.count} no-show{u.count > 1 ? 's' : ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontWeight: 600, marginBottom: '1rem' }}>Occupancy by section</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {sections.map((s) => {
              const usable = s.total - s.maintenance;
              const pct = usable ? Math.round((s.occupied / usable) * 100) : 0;
              return (
                <div key={s.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 4 }}>
                    <span>{s.name}</span><span style={{ color: 'var(--text-secondary)' }}>{s.occupied}/{usable} ({pct}%)</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--border)', borderRadius: 9999, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: pct > 80 ? 'var(--accent-red)' : 'var(--accent)', borderRadius: 9999 }} />
                  </div>
                </div>
              );
            })}
            {sections.length === 0 && <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No sections yet.</p>}
          </div>
        </div>

        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontWeight: 600, marginBottom: '1rem' }}>All-time booking outcomes</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {Object.entries(bookings.statusBreakdown).map(([status, count]) => {
              const pct = statusTotal ? Math.round((count / statusTotal) * 100) : 0;
              return (
                <div key={status}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 4 }}>
                    <span style={{ textTransform: 'capitalize', color: statusColors[status] }}>{status.replace('_', ' ')}</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{count} ({pct}%)</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--border)', borderRadius: 9999, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: statusColors[status] || 'var(--accent)', borderRadius: 9999 }} />
                  </div>
                </div>
              );
            })}
            {statusTotal === 0 && <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No bookings yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
