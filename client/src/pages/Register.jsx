import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { BookOpen, Mail, Lock, User, Hash } from 'lucide-react';
import { errorMessage } from '../services/api';

const Field = ({ label, icon: Icon, ...props }) => (
  <div>
    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 500 }}>{label}</label>
    <div style={{ position: 'relative' }}>
      <Icon size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
      <input className="input" style={{ paddingLeft: '2.5rem' }} {...props} />
    </div>
  </div>
);

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', studentId: '' });
  const [loading, setLoading] = useState(false);

  const setField = (field) => (e) => setForm(p => ({ ...p, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(form.password)) {
      return toast.error('Password needs at least 8 characters, including a letter and a number');
    }
    setLoading(true);
    try {
      await register(form);
      toast.success('Account created! Check your email to verify your address.');
      navigate('/seats');
    } catch (err) {
      toast.error(errorMessage(err, 'Registration failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="glass-card fade-in" style={{ width: '100%', maxWidth: 420, padding: '2.5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ width: 56, height: 56, background: 'var(--accent)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
            <BookOpen size={28} color="white" />
          </div>
          <h1 className="gradient-text" style={{ fontSize: '1.75rem', fontWeight: 700 }}>BookMySeat</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>Create your student account</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Field label="Full Name" icon={User} type="text" placeholder="John Doe" value={form.name} onChange={setField('name')} required />
          <Field label="Email" icon={Mail} type="email" placeholder="you@library.edu" value={form.email} onChange={setField('email')} required />
          <Field label="Student ID (optional)" icon={Hash} type="text" placeholder="STU001" value={form.studentId} onChange={setField('studentId')} />
          <Field label="Password" icon={Lock} type="password" placeholder="8+ chars, letter and number" value={form.password} onChange={setField('password')} required minLength={8} />

          <button className="btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem' }} disabled={loading}>
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          Already have an account? <Link to="/login" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}
