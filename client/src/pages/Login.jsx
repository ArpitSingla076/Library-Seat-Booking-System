import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { BookOpen, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { errorMessage } from '../services/api';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '', otp: '' });
  const [needOtp, setNeedOtp] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const user = await login(form.email.trim(), form.password, form.otp);
      toast.success(`Welcome back, ${user.name.split(' ')[0]}!`);
      const from = location.state?.from;
      navigate(from && user.role === 'student' ? `${from.pathname}${from.search || ''}` : user.role === 'admin' ? '/admin' : '/seats', { replace: true });
    } catch (err) {
      if (err.response?.data?.requireOtp) setNeedOtp(true);
      toast.error(errorMessage(err, 'Login failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="glass-card fade-in" style={{ width: '100%', maxWidth: 420, padding: '2.5rem' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ width: 56, height: 56, background: 'var(--accent)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
            <BookOpen size={28} color="white" />
          </div>
          <h1 className="gradient-text" style={{ fontSize: '1.75rem', fontWeight: 700 }}>BookMySeat</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 500 }}>Email or Student ID</label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input className="input" style={{ paddingLeft: '2.5rem' }} type="text" autoComplete="username" placeholder="you@library.edu or STU001" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} required />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 500 }}>Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input className="input" style={{ paddingLeft: '2.5rem', paddingRight: '2.75rem' }} type={showPass ? 'text' : 'password'} placeholder="••••••••" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} required />
              <button type="button" onClick={() => setShowPass(p => !p)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 0 }}>
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {needOtp && (
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 500 }}>Authentication code</label>
              <input className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="6-digit code from your authenticator app" value={form.otp} onChange={e => setForm(p => ({ ...p, otp: e.target.value.replace(/\D/g, '') }))} autoFocus required />
            </div>
          )}

          <div style={{ textAlign: 'right', marginTop: '-0.5rem' }}>
            <Link to="/forgot-password" style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: '0.8rem' }}>Forgot password?</Link>
          </div>

          <button className="btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem' }} disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          Don&apos;t have an account? <Link to="/register" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>Register</Link>
        </p>
      </div>
    </div>
  );
}
