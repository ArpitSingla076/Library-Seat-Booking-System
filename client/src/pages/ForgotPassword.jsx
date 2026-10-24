import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Mail } from 'lucide-react';
import AuthCard from './AuthCard';
import { authAPI, errorMessage } from '../services/api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await authAPI.forgotPassword(email);
      setDone(res.data);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard title="Forgot password" subtitle="We'll email you a link to reset it">
      {done ? (
        <div style={{ fontSize: '0.9rem' }}>
          <p style={{ color: 'var(--text-secondary)' }}>{done.message}</p>
          {done.devResetUrl && (
            <div className="glass-card" style={{ padding: '0.9rem', marginTop: '1rem', background: 'rgba(245,158,11,0.06)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.35rem' }}>Development mode (email is not configured)</div>
              <Link to={done.devResetUrl.replace(/^https?:\/\/[^/]+/, '')} style={{ color: 'var(--accent)', wordBreak: 'break-all', fontSize: '0.8rem' }}>Open the reset link</Link>
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ position: 'relative' }}>
            <Mail size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input className="input" style={{ paddingLeft: '2.5rem' }} type="email" placeholder="you@library.edu" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <button className="btn-primary" style={{ justifyContent: 'center' }} disabled={loading}>{loading ? 'Sending...' : 'Send reset link'}</button>
        </form>
      )}
      <p style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '0.875rem' }}>
        <Link to="/login" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Back to sign in</Link>
      </p>
    </AuthCard>
  );
}
