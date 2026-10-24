import { useEffect } from 'react';
import { LayoutDashboard, CalendarDays, Armchair, Users, Layers, Receipt, QrCode, Settings, UserCircle, ScrollText } from 'lucide-react';
import AppShell from './AppShell';
import { getSession } from '../services/session';
import { useSocket } from '../context/SocketContext';

const nav = [
  { to: '/admin', icon: LayoutDashboard, labelKey: 'dashboard', end: true },
  { to: '/admin/bookings', icon: CalendarDays, labelKey: 'bookings' },
  { to: '/admin/seats', icon: Armchair, labelKey: 'seats' },
  { to: '/admin/sections', icon: Layers, labelKey: 'sections' },
  { to: '/admin/qr', icon: QrCode, labelKey: 'qrCodes' },
  { to: '/admin/users', icon: Users, labelKey: 'users' },
  { to: '/admin/fines', icon: Receipt, labelKey: 'fines' },
  { to: '/admin/audit', icon: ScrollText, labelKey: 'audit' },
  { to: '/admin/settings', icon: Settings, labelKey: 'settings' },
  { to: '/admin/profile', icon: UserCircle, labelKey: 'profile' },
];

export default function AdminLayout() {
  const { connect, disconnect } = useSocket();

  // Admin pages also receive live seat updates
  useEffect(() => {
    if (getSession()?.token) connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return <AppShell subtitleKey="adminPanel" accent="var(--accent-yellow)" nav={nav} onLogout={disconnect} />;
}
