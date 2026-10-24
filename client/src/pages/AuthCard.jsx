import { BookOpen } from 'lucide-react';

// Centered card used by the forgot/reset/verify pages
export default function AuthCard({ title, subtitle, children }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="glass-card fade-in" style={{ width: '100%', maxWidth: 420, padding: '2.25rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div style={{ width: 52, height: 52, background: 'var(--accent)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
            <BookOpen size={26} color="white" />
          </div>
          <h1 className="gradient-text" style={{ fontSize: '1.5rem' }}>{title}</h1>
          {subtitle && <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}
