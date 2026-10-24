/**
 * Login sessions are stored PER ROLE, so a student and an admin can be logged in at the same time
 * in different browser tabs without overwriting each other:
 *   - pages under /admin use the admin session
 *   - every other page uses the student session
 */
export const roleFromPath = () => (window.location.pathname.startsWith('/admin') ? 'admin' : 'student');

const key = (role) => `session_${role}`;

export const getSession = (role = roleFromPath()) => {
  try {
    return JSON.parse(localStorage.getItem(key(role)) || 'null');
  } catch {
    return null;
  }
};

export const setSession = (role, data) => {
  const prev = getSession(role) || {};
  localStorage.setItem(key(role), JSON.stringify({
    token: data.token ?? prev.token,
    refreshToken: data.refreshToken ?? prev.refreshToken,
  }));
};

export const clearSession = (role = roleFromPath()) => localStorage.removeItem(key(role));
