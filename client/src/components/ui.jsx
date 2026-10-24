import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { X } from 'lucide-react';

/* ---------- Modal ---------- */
export function Modal({ title, onClose, children, maxWidth = 480 }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700 }}>{title}</h2>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------- Confirm / prompt dialogs (replace window.confirm / prompt) ---------- */
const DialogContext = createContext(null);

export function DialogProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const [value, setValue] = useState('');
  const resolver = useRef(null);

  const open = useCallback((config) => new Promise((resolve) => {
    resolver.current = resolve;
    setValue('');
    setDialog(config);
  }), []);

  const close = (result) => {
    resolver.current?.(result);
    resolver.current = null;
    setDialog(null);
  };

  const confirm = useCallback((opts) => open({ kind: 'confirm', ...opts }), [open]);
  const prompt = useCallback((opts) => open({ kind: 'prompt', ...opts }), [open]);

  const cancelValue = dialog?.kind === 'prompt' ? null : false;
  const submit = () => {
    if (dialog.kind === 'prompt') {
      if (dialog.required && !value.trim()) return;
      close(value.trim());
    } else close(true);
  };

  return (
    <DialogContext.Provider value={{ confirm, prompt }}>
      {children}
      {dialog && (
        <Modal title={dialog.title || 'Are you sure?'} onClose={() => close(cancelValue)} maxWidth={420}>
          {dialog.message && <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>{dialog.message}</p>}
          {dialog.kind === 'prompt' && (
            <textarea
              className="input" rows={3} autoFocus placeholder={dialog.placeholder || ''} value={value}
              onChange={(e) => setValue(e.target.value)} style={{ marginBottom: '1rem', resize: 'vertical' }}
            />
          )}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button className="btn-ghost" onClick={() => close(cancelValue)}>Cancel</button>
            <button
              className={dialog.danger ? 'btn-danger' : 'btn-primary'}
              disabled={dialog.kind === 'prompt' && dialog.required && !value.trim()}
              onClick={submit}
            >
              {dialog.confirmLabel || 'Confirm'}
            </button>
          </div>
        </Modal>
      )}
    </DialogContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useDialog = () => useContext(DialogContext);

/* ---------- Small shared pieces ---------- */
export const StatusBadge = ({ status }) => <span className={`badge badge-${status}`}>{String(status).replace('_', ' ')}</span>;

export const PageHeader = ({ title, subtitle, children }) => (
  <div className="page-header">
    <div>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 700 }}>{title}</h1>
      {subtitle && <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>{subtitle}</p>}
    </div>
    {children && <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>{children}</div>}
  </div>
);

export const Chip = ({ active, onClick, children }) => (
  <button type="button" onClick={onClick} className={`chip${active ? ' chip-active' : ''}`}>{children}</button>
);

export const Spinner = ({ label = 'Loading...' }) => (
  <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>{label}</div>
);

export const Empty = ({ icon: Icon, text }) => (
  <div className="glass-card" style={{ textAlign: 'center', padding: '3rem' }}>
    {Icon && <Icon size={44} style={{ opacity: 0.2, marginBottom: '0.75rem' }} />}
    <p style={{ color: 'var(--text-secondary)' }}>{text}</p>
  </div>
);

export const Pagination = ({ page, pages, onChange }) => {
  if (pages <= 1) return null;
  const list = Array.from({ length: pages }, (_, i) => i + 1).slice(0, 50);
  return (
    <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', marginTop: '1.25rem', flexWrap: 'wrap' }}>
      {list.map((p) => (
        <button key={p} onClick={() => onChange(p)} className={`chip${page === p ? ' chip-active' : ''}`} style={{ minWidth: 36 }}>{p}</button>
      ))}
    </div>
  );
};

export const Field = ({ label, hint, children }) => (
  <div>
    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 500 }}>{label}</label>
    {children}
    {hint && <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>{hint}</div>}
  </div>
);

// Trigger a browser download for a Blob response
// eslint-disable-next-line react-refresh/only-export-components
export const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};
