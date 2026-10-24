import axios from 'axios';
import { getSession, setSession, clearSession, roleFromPath } from './session';

const baseURL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({ baseURL, timeout: 15000 });

// Attach the access token to every request
api.interceptors.request.use((config) => {
  const token = getSession()?.token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const goToLogin = () => {
  if (window.location.pathname !== '/login') window.location.href = '/login';
};

// One shared refresh request at a time
let refreshing = null;
const refreshAccessToken = () => {
  if (!refreshing) {
    const refreshToken = getSession()?.refreshToken;
    refreshing = axios
      .post(`${baseURL}/auth/refresh`, { refreshToken })
      .then((res) => {
        setSession(roleFromPath(), res.data);
        return res.data.token;
      })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
};

// On 401: try to refresh the session once and retry; otherwise go to the login page
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config || {};
    const url = original.url || '';
    const isAuthCall = /\/auth\/(login|register|refresh|forgot-password|reset-password|verify-email)/.test(url);

    if (err.response?.status === 401 && !isAuthCall) {
      if (!original._retried && getSession()?.refreshToken) {
        original._retried = true;
        try {
          const token = await refreshAccessToken();
          original.headers = { ...(original.headers || {}), Authorization: `Bearer ${token}` };
          return api(original);
        } catch {
          // fall through to logout
        }
      }
      clearSession();
      goToLogin();
    }
    return Promise.reject(err);
  }
);

export const errorMessage = (err, fallback = 'Something went wrong') =>
  err?.response?.data?.message || (err?.code === 'ERR_NETWORK' ? 'Cannot reach the server. Is the backend running?' : fallback);

// Auth
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  twoFaSetup: () => api.post('/auth/2fa/setup'),
  twoFaEnable: (code) => api.post('/auth/2fa/enable', { code }),
  twoFaDisable: (password, code) => api.post('/auth/2fa/disable', { password, code }),
  logout: (refreshToken) => api.post('/auth/logout', { refreshToken }),
  me: () => api.get('/auth/me'),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token, password) => api.post('/auth/reset-password', { token, password }),
  changePassword: (data) => api.post('/auth/change-password', data),
  verifyEmail: (token) => api.post('/auth/verify-email', { token }),
  resendVerification: () => api.post('/auth/resend-verification'),
};

// Seats & sections
export const seatsAPI = {
  getAll: (params) => api.get('/seats', { params }),
  getSections: (params) => api.get('/seats/sections', { params }),
  getById: (id) => api.get(`/seats/${id}`),
  create: (data) => api.post('/seats', data),
  update: (id, data) => api.put(`/seats/${id}`, data),
  delete: (id) => api.delete(`/seats/${id}`),
  bulkCreate: (data) => api.post('/seats/bulk', data),
  createSection: (data) => api.post('/seats/sections', data),
  updateSection: (id, data) => api.put(`/seats/sections/${id}`, data),
  deleteSection: (id) => api.delete(`/seats/sections/${id}`),
};

// Bookings
export const bookingsAPI = {
  create: (data) => api.post('/bookings', data),
  getMy: (params) => api.get('/bookings/my', { params }),
  getActive: () => api.get('/bookings/active'),
  getById: (id) => api.get(`/bookings/${id}`),
  cancel: (id, reason) => api.delete(`/bookings/${id}`, { data: { reason } }),
  checkIn: (id, qrToken) => api.post(`/bookings/${id}/checkin`, { qrToken }),
  checkInByQr: (qrToken) => api.post('/bookings/checkin-by-qr', { qrToken }),
  checkOut: (id) => api.post(`/bookings/${id}/checkout`),
  extend: (id, minutes) => api.post(`/bookings/${id}/extend`, { minutes }),
  createOrder: (data) => api.post('/bookings/payments/create-order', data),
  verifyPayment: (data) => api.post('/bookings/payments/verify', data),
  getPayments: () => api.get('/bookings/payments/my'),
  getMyFines: (params) => api.get('/bookings/fines/my', { params }),
};

export const settingsAPI = { get: () => api.get('/settings') };

export const waitlistAPI = {
  join: (data) => api.post('/waitlist', data),
  mine: () => api.get('/waitlist'),
  leave: (id) => api.delete(`/waitlist/${id}`),
};

export const notificationsAPI = {
  list: (params) => api.get('/notifications', { params }),
  readAll: () => api.post('/notifications/read-all'),
  read: (id) => api.post(`/notifications/${id}/read`),
  clear: () => api.delete('/notifications'),
};

// Admin
export const adminAPI = {
  getBookings: (params) => api.get('/admin/bookings', { params }),
  cancelBooking: (id, reason) => api.delete(`/admin/bookings/${id}`, { data: { reason } }),
  getFines: (params) => api.get('/admin/fines', { params }),
  markPaid: (id, method) => api.post(`/admin/bookings/${id}/mark-paid`, { method }),
  waiveFine: (id, reason) => api.put(`/admin/bookings/${id}/waive-fine`, { reason }),
  getUsers: (params) => api.get('/admin/users', { params }),
  blockUser: (id, isBlocked, reason) => api.put(`/admin/users/${id}/block`, { isBlocked, reason }),
  getAnalytics: () => api.get('/admin/analytics'),
  checkInBooking: (id) => api.post(`/admin/bookings/${id}/checkin`),
  importStudents: (students) => api.post('/admin/users/import', { students }),
  getAudit: (params) => api.get('/admin/audit', { params }),
  emailStatus: () => api.get('/admin/email/status'),
  emailTest: () => api.post('/admin/email/test'),
  getSettings: () => api.get('/admin/settings'),
  updateSettings: (data) => api.put('/admin/settings', data),
  exportBookings: (params) => api.get('/admin/export/bookings', { params, responseType: 'blob' }),
};

export default api;
