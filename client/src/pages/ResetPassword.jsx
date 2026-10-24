import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Lock } from 'lucide-react';
import AuthCard from './AuthCard';
import { authAPI, errorMessage } from '../services/api';

export default function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (password !== confirm) return toast.error('Passwords do not match');
    if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password)) return toast.error('Password needs 8+ characters with a letter and a number');
    setLoading(true);
    try {
      await authAPI.resetPassword(token, password);
      toast.success('Password updated. Please sign in.');
      navigate('/login');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard title="Choose a new password">
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {[['New password', password, setPassword], ['Confirm password', confirm, setConfirm]].map(([ph, val, set]) => (
          <div key={ph} style={{ position: 'relative' }}>
            <Lock size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input className="input" style={{ paddingLeft: '2.5rem' }} type="password" placeholder={ph} value={val} onChange={(e) => set(e.target.value)} required minLength={8} />
          </div>
        ))}
        <button className="btn-primary" style={{ justifyContent: 'center' }} disabled={loading}>{loading ? 'Saving...' : 'Reset password'}</button>
      </form>
      <p style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '0.875rem' }}>
        <Link to="/login" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Back to sign in</Link>
      </p>
    </AuthCard>
  );
}
