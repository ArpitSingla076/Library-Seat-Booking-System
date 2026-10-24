import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AuthCard from './AuthCard';
import { authAPI, errorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function VerifyEmail() {
  const { token } = useParams();
  const { user, refreshUser } = useAuth();
  const [state, setState] = useState({ loading: true, ok: false, message: '' });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // StrictMode runs effects twice; the token is single-use
    started.current = true;
    authAPI.verifyEmail(token)
      .then((r) => { setState({ loading: false, ok: true, message: r.data.message }); if (user) refreshUser(); })
      .catch((err) => setState({ loading: false, ok: false, message: errorMessage(err) }));
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AuthCard title="Email verification">
      <p style={{ textAlign: 'center', color: state.loading ? 'var(--text-secondary)' : state.ok ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 600 }}>
        {state.loading ? 'Verifying...' : state.message}
      </p>
      <p style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '0.875rem' }}>
        <Link to={user ? (user.role === 'admin' ? '/admin' : '/seats') : '/login'} style={{ color: 'var(--accent)', textDecoration: 'none' }}>Continue</Link>
      </p>
    </AuthCard>
  );
}
