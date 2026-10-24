import { useEffect, useState, useCallback } from 'react';
import { Grid3X3, CalendarDays, IndianRupee, UserCircle, ScanLine, Bell, Wifi, WifiOff } from 'lucide-react';
import toast from 'react-hot-toast';
import AppShell from './AppShell';
import { getSession } from '../services/session';
import { useSocket } from '../context/SocketContext';
import { notificationsAPI } from '../services/api';
import { useT } from '../i18n';

export default function StudentLayout() {
  const { connect, disconnect, connected, on } = useSocket();
  const { t } = useT();
  const [unread, setUnread] = useState(0);

  const refreshUnread = useCallback(() => {
    notificationsAPI.list({ limit: 1 }).then((r) => setUnread(r.data.unread)).catch(() => {});
  }, []);

  useEffect(() => {
    if (getSession()?.token) connect();
    refreshUnread();
    return () => disconnect();
  }, [connect, disconnect, refreshUnread]);

  // Private notifications from the server (reminders, fines, waitlist, admin cancellations)
  useEffect(() => on('notification', (n) => {
    const fn = n.type === 'error' ? toast.error : n.type === 'success' ? toast.success : toast;
    fn(n.message, { duration: 7000 });
    refreshUnread();
  }), [on, refreshUnread]);

  // The notifications page tells us when it marks things read
  useEffect(() => {
    window.addEventListener('notifications-changed', refreshUnread);
    return () => window.removeEventListener('notifications-changed', refreshUnread);
  }, [refreshUnread]);

  const nav = [
    { to: '/seats', icon: Grid3X3, labelKey: 'seatMap' },
    { to: '/bookings', icon: CalendarDays, labelKey: 'myBookings' },
    { to: '/checkin', icon: ScanLine, labelKey: 'qrCheckin' },
    { to: '/notifications', icon: Bell, labelKey: 'notifications', badge: unread },
    { to: '/fines', icon: IndianRupee, labelKey: 'fines' },
    { to: '/profile', icon: UserCircle, labelKey: 'profile' },
  ];

  const footer = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem', fontSize: '0.72rem', color: connected ? 'var(--accent-green)' : 'var(--text-secondary)' }}>
      {connected ? <Wifi size={13} /> : <WifiOff size={13} />}
      {connected ? 'Live updates on' : 'Connecting...'}
    </div>
  );

  return <AppShell subtitleKey="studentPortal" nav={nav} footer={footer} onLogout={disconnect} />;
}
