import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { BookOpen, LogOut, Menu, X, Moon, Sun, Languages } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useT, LANGUAGES } from '../i18n';

/**
 * Shared responsive shell (sidebar on desktop, slide-in drawer on phones).
 * nav: [{ to, icon, labelKey, end, badge }]
 */
export default function AppShell({ subtitleKey, accent = 'var(--accent)', nav, footer, onLogout }) {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const { t, lang, setLang } = useT();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleLogout = async () => {
    onLogout?.();
    await logout();
    navigate('/login');
  };

  const profilePath = user?.role === 'admin' ? '/admin/profile' : '/profile';
  const subtitle = t(subtitleKey);

  return (
    <div className="app-shell" style={{ display: 'flex', minHeight: '100vh' }}>
      <a href="#main" className="skip-link">Skip to content</a>
      <div className="app-topbar no-print">
        <button className="btn-ghost" style={{ padding: '0.4rem' }} onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
        <div style={{ fontWeight: 700 }}>BookMySeat</div>
        <div style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{subtitle}</div>
      </div>
      <div className={`sidebar-backdrop${open ? ' open' : ''}`} onClick={() => setOpen(false)} />

      <aside className={`sidebar${open ? ' open' : ''}`} aria-label="Main navigation">
        <div style={{ padding: '1.5rem 1.25rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: 36, height: 36, background: accent, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <BookOpen size={18} color="white" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>BookMySeat</div>
            <div style={{ fontSize: '0.7rem', color: accent, fontWeight: 600 }}>{subtitle}</div>
          </div>
          <button className="btn-ghost" style={{ padding: '0.25rem', display: open ? 'inline-flex' : 'none' }} onClick={() => setOpen(false)} aria-label="Close menu"><X size={18} /></button>
        </div>

        <nav style={{ flex: 1, padding: '1rem 0', overflowY: 'auto' }}>
          {nav.map(({ to, icon: Icon, labelKey, end, badge }) => (
            <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              <Icon size={18} />{t(labelKey)}
              {badge > 0 && <span className="nav-badge" aria-label={`${badge} unread`}>{badge > 99 ? '99+' : badge}</span>}
            </NavLink>
          ))}
        </nav>

        <div style={{ padding: '1rem', borderTop: '1px solid var(--border)' }}>
          {footer}
          <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.75rem' }}>
            <button className="btn-ghost" style={{ padding: '0.35rem 0.55rem' }} onClick={toggle} aria-label={t('darkMode')} title={t('darkMode')}>
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <label style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Languages size={14} style={{ position: 'absolute', left: 8, color: 'var(--text-secondary)', pointerEvents: 'none' }} />
              <select className="input" aria-label={t('language')} value={lang} onChange={(e) => setLang(e.target.value)} style={{ padding: '0.35rem 0.5rem 0.35rem 1.7rem', fontSize: '0.78rem' }}>
                {LANGUAGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </label>
          </div>
          <NavLink to={profilePath} onClick={() => setOpen(false)} style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'white', fontSize: '0.85rem', flexShrink: 0 }}>
              {user?.name?.[0]?.toUpperCase()}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontWeight: 600, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.role === 'admin' ? `Admin · ${t('profile')}` : `${user?.studentId || user?.email} · ${t('profile')}`}
              </div>
            </div>
          </NavLink>
          <button className="btn-ghost" style={{ width: '100%', justifyContent: 'center', fontSize: '0.82rem' }} onClick={handleLogout}>
            <LogOut size={15} /> {t('logout')}
          </button>
        </div>
      </aside>

      <main id="main" tabIndex={-1} style={{ flex: 1, minWidth: 0, overflow: 'auto', background: 'var(--bg-primary)' }}>
        <Outlet />
      </main>
    </div>
  );
}
