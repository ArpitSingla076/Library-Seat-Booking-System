import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { Bell, Info, CheckCircle2, AlertTriangle, XCircle, Trash2, CheckCheck } from 'lucide-react';
import { notificationsAPI, waitlistAPI, errorMessage } from '../../services/api';
import { useSocket } from '../../context/SocketContext';
import { useT } from '../../i18n';
import { PageHeader, Spinner, Empty } from '../../components/ui';

const icons = { info: Info, success: CheckCircle2, warning: AlertTriangle, error: XCircle };
const colors = { info: 'var(--accent)', success: 'var(--accent-green)', warning: 'var(--accent-yellow)', error: 'var(--accent-red)' };
const changed = () => window.dispatchEvent(new Event('notifications-changed'));

export default function NotificationsPage() {
  const { on } = useSocket();
  const { t } = useT();
  const [items, setItems] = useState([]);
  const [waiting, setWaiting] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [n, w] = await Promise.all([notificationsAPI.list({ limit: 60 }), waitlistAPI.mine()]);
      setItems(n.data.notifications);
      setWaiting(w.data.entries);
    } catch (err) { toast.error(errorMessage(err)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => on('notification', () => load()), [on, load]);

  const markAll = async () => { await notificationsAPI.readAll(); changed(); load(); };
  const clearAll = async () => { await notificationsAPI.clear(); changed(); load(); };
  const leave = async (id) => { try { await waitlistAPI.leave(id); load(); } catch (err) { toast.error(errorMessage(err)); } };
  const unread = items.filter((i) => !i.read).length;

  return (
    <div className="page" style={{ maxWidth: 780, margin: '0 auto' }}>
      <PageHeader title={t('notifications')} subtitle={unread ? `${unread} unread` : 'You are all caught up'}>
        {unread > 0 && <button className="btn-ghost" onClick={markAll}><CheckCheck size={15} /> {t('markAllRead')}</button>}
        {items.length > 0 && <button className="btn-ghost" onClick={clearAll}><Trash2 size={15} /> Clear</button>}
      </PageHeader>

      {waiting.length > 0 && (
        <div className="glass-card" style={{ padding: '1rem 1.25rem', marginBottom: '1.25rem' }}>
          <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Waiting list</div>
          {waiting.map((w) => (
            <div key={w._id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.85rem', padding: '0.3rem 0' }}>
              <span style={{ flex: 1 }}>Seat {w.seat?.seatNumber} · {format(new Date(w.startTime), 'EEE d MMM, h:mm a')} → {format(new Date(w.endTime), 'h:mm a')}{w.notified && <b style={{ color: 'var(--accent-green)', marginLeft: 8 }}>Free now!</b>}</span>
              <button className="btn-ghost" style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }} onClick={() => leave(w._id)}>Remove</button>
            </div>
          ))}
        </div>
      )}

      {loading ? <Spinner /> : items.length === 0 ? <Empty icon={Bell} text={t('noNotifications')} /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {items.map((n) => {
            const Icon = icons[n.type] || Info;
            return (
              <div key={n._id} className="glass-card" onClick={async () => { if (!n.read) { await notificationsAPI.read(n._id); changed(); load(); } }}
                style={{ padding: '0.9rem 1.1rem', display: 'flex', gap: '0.85rem', alignItems: 'flex-start', cursor: n.read ? 'default' : 'pointer', opacity: n.read ? 0.7 : 1, borderLeft: `3px solid ${colors[n.type]}` }}>
                <Icon size={18} color={colors[n.type]} style={{ marginTop: 2, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: n.read ? 400 : 600 }}>{n.message}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>{format(new Date(n.createdAt), 'd MMM, h:mm a')}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
