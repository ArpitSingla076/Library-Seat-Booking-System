import { useState } from 'react';
import toast from 'react-hot-toast';
import { BadgeCheck, MailWarning, ShieldCheck } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../context/AuthContext';
import { useDialog } from '../components/ui';
import { authAPI, errorMessage } from '../services/api';
import { PageHeader, Field } from '../components/ui';

export default function Profile() {
  const { user, applyTokens, refreshUser } = useAuth();
  const { prompt } = useDialog();
  const [twoFa, setTwoFa] = useState(null); // { secret, otpauthUrl }
  const [code, setCode] = useState('');
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [devUrl, setDevUrl] = useState(null);

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const changePassword = async (e) => {
    e.preventDefault();
    if (form.newPassword !== form.confirm) return toast.error('New passwords do not match');
    if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(form.newPassword)) return toast.error('Password needs 8+ characters with a letter and a number');
    setSaving(true);
    try {
      const res = await authAPI.changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword });
      applyTokens(res.data);
      toast.success('Password changed');
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const resend = async () => {
    try {
      const res = await authAPI.resendVerification();
      toast.success(res.data.message);
      if (res.data.devVerifyUrl) setDevUrl(res.data.devVerifyUrl.replace(/^https?:\/\/[^/]+/, ''));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const startTwoFa = async () => {
    try { setTwoFa((await authAPI.twoFaSetup()).data); setCode(''); } catch (err) { toast.error(errorMessage(err)); }
  };
  const enableTwoFa = async (e) => {
    e.preventDefault();
    try {
      await authAPI.twoFaEnable(code);
      toast.success('Two-factor authentication is on');
      setTwoFa(null);
      refreshUser();
    } catch (err) { toast.error(errorMessage(err)); }
  };
  const disableTwoFa = async () => {
    const pw = await prompt({ title: 'Turn off two-factor login', message: 'Enter your password, then a current 6-digit code in the next step.', placeholder: 'Password', required: true, confirmLabel: 'Next' });
    if (!pw) return;
    const c = await prompt({ title: 'Authenticator code', placeholder: '6-digit code', required: true, confirmLabel: 'Turn off', danger: true });
    if (!c) return;
    try { await authAPI.twoFaDisable(pw, c); toast.success('Two-factor authentication is off'); refreshUser(); } catch (err) { toast.error(errorMessage(err)); }
  };

  return (
    <div className="page" style={{ maxWidth: 720, margin: '0 auto' }}>
      <PageHeader title="My Profile" subtitle="Account details and security" />

      <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <Info label="Name" value={user.name} />
          <Info label="Email" value={user.email} />
          <Info label="Role" value={user.role} />
          {user.studentId && <Info label="Student ID" value={user.studentId} />}
        </div>
        <div style={{ marginTop: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          {user.emailVerified ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--accent-green)', fontWeight: 600, fontSize: '0.85rem' }}><BadgeCheck size={16} /> Email verified</span>
          ) : (
            <>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--accent-yellow)', fontWeight: 600, fontSize: '0.85rem' }}><MailWarning size={16} /> Email not verified</span>
              <button className="btn-ghost" style={{ fontSize: '0.8rem' }} onClick={resend}>Resend verification email</button>
              {devUrl && <a href={devUrl} style={{ color: 'var(--accent)', fontSize: '0.8rem' }}>Dev: open verification link</a>}
            </>
          )}
        </div>
      </div>

      <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <h3 style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}><ShieldCheck size={18} /> Two-factor login</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0.4rem 0 1rem' }}>
          Adds a 6-digit code from an authenticator app (Google Authenticator, Authy, Microsoft Authenticator) to your login.{user.role === 'admin' ? ' Strongly recommended for admins.' : ''}
        </p>
        {user.twoFactorEnabled ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--accent-green)', fontWeight: 600, fontSize: '0.85rem' }}>● Enabled</span>
            <button className="btn-danger" onClick={disableTwoFa}>Turn off</button>
          </div>
        ) : twoFa ? (
          <form onSubmit={enableTwoFa} style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="qr-box"><QRCodeSVG value={twoFa.otpauthUrl} size={132} marginSize={1} /></div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Scan with your authenticator app, or type this key:</p>
              <code style={{ fontSize: '0.8rem', wordBreak: 'break-all' }}>{twoFa.secret}</code>
              <input className="input" style={{ marginTop: '0.75rem' }} inputMode="numeric" maxLength={6} placeholder="Enter the 6-digit code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required />
              <button className="btn-primary" style={{ marginTop: '0.6rem' }}>Confirm and enable</button>
            </div>
          </form>
        ) : (
          <button className="btn-primary" onClick={startTwoFa}>Set up</button>
        )}
      </div>

      <form className="glass-card" onSubmit={changePassword} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h3 style={{ fontWeight: 600 }}>Change password</h3>
        <Field label="Current password"><input className="input" type="password" value={form.currentPassword} onChange={set('currentPassword')} required /></Field>
        <Field label="New password" hint="At least 8 characters, with a letter and a number"><input className="input" type="password" value={form.newPassword} onChange={set('newPassword')} required minLength={8} /></Field>
        <Field label="Confirm new password"><input className="input" type="password" value={form.confirm} onChange={set('confirm')} required minLength={8} /></Field>
        <button className="btn-primary" style={{ alignSelf: 'flex-start' }} disabled={saving}>{saving ? 'Saving...' : 'Update password'}</button>
      </form>
    </div>
  );
}

const Info = ({ label, value }) => (
  <div>
    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    <div style={{ fontWeight: 600, marginTop: 2, textTransform: label === 'Role' ? 'capitalize' : 'none', wordBreak: 'break-word' }}>{value}</div>
  </div>
);
