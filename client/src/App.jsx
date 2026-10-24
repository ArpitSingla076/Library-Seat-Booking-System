import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { SettingsProvider } from './context/SettingsContext';
import { DialogProvider } from './components/ui';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import VerifyEmail from './pages/VerifyEmail';
import Profile from './pages/Profile';
import CheckInPage from './pages/student/CheckInPage';
import AdminSections from './pages/admin/AdminSections';
import AdminQrCodes from './pages/admin/AdminQrCodes';
import AdminFines from './pages/admin/AdminFines';
import AdminSettings from './pages/admin/AdminSettings';
import AdminAudit from './pages/admin/AdminAudit';
import NotificationsPage from './pages/student/NotificationsPage';
import { ThemeProvider } from './context/ThemeContext';
import { I18nProvider } from './i18n';
import StudentLayout from './layouts/StudentLayout';
import AdminLayout from './layouts/AdminLayout';
import SeatsPage from './pages/student/SeatsPage';
import MyBookingsPage from './pages/student/MyBookingsPage';
import FinesPage from './pages/student/FinesPage';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminBookings from './pages/admin/AdminBookings';
import AdminSeats from './pages/admin/AdminSeats';
import AdminUsers from './pages/admin/AdminUsers';

const ProtectedRoute = ({ children, role }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <div style={{ width: 48, height: 48, border: '3px solid rgba(37, 99, 235, 0.1)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (role && user.role !== role) return <Navigate to={user.role === 'admin' ? '/admin' : '/seats'} replace />;
  return children;
};

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password/:token" element={<ResetPassword />} />
      <Route path="/verify-email/:token" element={<VerifyEmail />} />

      {/* Student routes */}
      <Route path="/" element={
        <ProtectedRoute role="student">
          <StudentLayout />
        </ProtectedRoute>
      }>
        <Route index element={<Navigate to="/seats" replace />} />
        <Route path="seats" element={<SeatsPage />} />
        <Route path="bookings" element={<MyBookingsPage />} />
        <Route path="fines" element={<FinesPage />} />
        <Route path="checkin" element={<CheckInPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="profile" element={<Profile />} />
      </Route>

      {/* Admin routes */}
      <Route path="/admin" element={
        <ProtectedRoute role="admin">
          <AdminLayout />
        </ProtectedRoute>
      }>
        <Route index element={<AdminDashboard />} />
        <Route path="bookings" element={<AdminBookings />} />
        <Route path="seats" element={<AdminSeats />} />
        <Route path="sections" element={<AdminSections />} />
        <Route path="qr" element={<AdminQrCodes />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="fines" element={<AdminFines />} />
        <Route path="settings" element={<AdminSettings />} />
        <Route path="audit" element={<AdminAudit />} />
        <Route path="profile" element={<Profile />} />
      </Route>

      <Route path="*" element={<Navigate to="/seats" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
    <I18nProvider>
    <AuthProvider>
      <SocketProvider>
        <SettingsProvider>
        <DialogProvider>
        <BrowserRouter>
          <AppRoutes />
          <Toaster
            position="top-right"
            toastOptions={{
              style: { background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)' },
              success: { iconTheme: { primary: 'var(--accent-green)', secondary: '#ffffff' } },
              error: { iconTheme: { primary: 'var(--accent-red)', secondary: '#ffffff' } },
            }}
          />
          <style>{`@keyframes spin { to { transform: rotate(360deg); }}`}</style>
        </BrowserRouter>
        </DialogProvider>
        </SettingsProvider>
      </SocketProvider>
    </AuthProvider>
    </I18nProvider>
    </ThemeProvider>
  );
}
