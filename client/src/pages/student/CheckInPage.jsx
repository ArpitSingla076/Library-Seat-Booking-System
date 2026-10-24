import { useEffect, useRef, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, XCircle, ScanLine, Camera } from 'lucide-react';
import { format } from 'date-fns';
import { bookingsAPI, errorMessage } from '../../services/api';
import { PageHeader } from '../../components/ui';
import QrScanner, { extractQrToken } from '../../components/QrScanner';

// Check in by scanning a seat QR code with the in-app camera, by opening the scanned link,
// or by pasting the code. URL form: /checkin?t=<token>
export default function CheckInPage() {
  const [params] = useSearchParams();
  const urlToken = params.get('t');
  const [state, setState] = useState({ phase: urlToken ? 'working' : 'idle', message: '', booking: null });
  const [scanning, setScanning] = useState(false);
  const [paste, setPaste] = useState('');
  const started = useRef(false);

  const run = useCallback(async (token) => {
    setScanning(false);
    setState({ phase: 'working', message: '', booking: null });
    try {
      const r = await bookingsAPI.checkInByQr(token);
      setState({ phase: 'ok', message: r.data.message, booking: r.data.booking });
    } catch (err) {
      setState({ phase: 'error', message: errorMessage(err, 'Check-in failed'), booking: null });
    }
  }, []);

  useEffect(() => {
    if (urlToken && !started.current) { started.current = true; run(urlToken); }
  }, [urlToken, run]);

  const onScan = (text) => {
    const token = extractQrToken(text);
    if (token) run(token);
    else setState({ phase: 'error', message: 'That QR code is not a BookMySeat seat code.', booking: null });
  };

  const submitPaste = (e) => {
    e.preventDefault();
    const token = extractQrToken(paste);
    if (token) run(token);
    else setState({ phase: 'error', message: 'Paste the full link from the QR code, or the seat code.', booking: null });
  };

  return (
    <div className="page" style={{ maxWidth: 520, margin: '0 auto' }}>
      <PageHeader title="QR Check-in" subtitle="Scan the QR code on your seat to check in" />
      <div className="glass-card" style={{ padding: '1.75rem', textAlign: 'center' }}>
        {state.phase === 'working' && <p style={{ color: 'var(--text-secondary)' }}>Checking you in...</p>}

        {state.phase === 'ok' && (
          <>
            <CheckCircle2 size={52} color="var(--accent-green)" style={{ marginBottom: '0.75rem' }} />
            <h2 style={{ fontWeight: 700 }}>You're checked in!</h2>
            {state.booking && <p style={{ color: 'var(--text-secondary)', marginTop: '0.4rem', fontSize: '0.9rem' }}>Until {format(new Date(state.booking.endTime), 'h:mm a')}. Remember to check out when you leave.</p>}
          </>
        )}

        {state.phase === 'error' && (
          <>
            <XCircle size={52} color="var(--accent-red)" style={{ marginBottom: '0.75rem' }} />
            <h2 style={{ fontWeight: 700 }}>Could not check in</h2>
            <p style={{ color: 'var(--text-secondary)', marginTop: '0.4rem', fontSize: '0.9rem' }}>{state.message}</p>
          </>
        )}

        {(state.phase === 'idle' || state.phase === 'error') && (
          <div style={{ marginTop: '1.25rem' }}>
            {scanning ? (
              <>
                <QrScanner onScan={onScan} />
                <button className="btn-ghost" style={{ marginTop: '1rem' }} onClick={() => setScanning(false)}>Stop camera</button>
              </>
            ) : (
              <>
                {state.phase === 'idle' && <ScanLine size={48} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />}
                <div><button className="btn-primary" onClick={() => setScanning(true)}><Camera size={16} /> Open camera and scan</button></div>
              </>
            )}
            <form onSubmit={submitPaste} style={{ marginTop: '1.5rem', textAlign: 'left' }}>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>No camera? Paste the link from the QR code</label>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.35rem' }}>
                <input className="input" placeholder="http://…/checkin?t=…" value={paste} onChange={(e) => setPaste(e.target.value)} />
                <button className="btn-ghost" type="submit">Check in</button>
              </div>
            </form>
          </div>
        )}

        <Link to="/bookings" className="btn-ghost" style={{ marginTop: '1.5rem', textDecoration: 'none', justifyContent: 'center' }}>Go to My Bookings</Link>
      </div>
    </div>
  );
}
