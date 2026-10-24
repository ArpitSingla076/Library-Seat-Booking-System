import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, CameraOff } from 'lucide-react';

/**
 * Camera QR scanner (uses the device camera + jsQR, works in any modern browser).
 * Calls onScan(text) once with the decoded text. Camera access needs HTTPS or localhost.
 */
export default function QrScanner({ onScan, active = true }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!active) return undefined;
    let stream;
    let raf;
    let stopped = false;
    let done = false;

    const tick = () => {
      if (stopped) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        const scale = Math.min(1, 640 / video.videoWidth);
        const w = Math.round(video.videoWidth * scale);
        const h = Math.round(video.videoHeight * scale);
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(video, 0, 0, w, h);
        const img = ctx.getImageData(0, 0, w, h);
        const code = jsQR(img.data, w, h, { inversionAttempts: 'attemptBoth' });
        if (code?.data && !done) {
          done = true;
          onScan(code.data);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Camera is not available here. Camera scanning needs HTTPS (or localhost). You can paste the code below instead.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        const video = videoRef.current;
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        await video.play();
        setReady(true);
        raf = requestAnimationFrame(tick);
      } catch (err) {
        setError(err.name === 'NotAllowedError'
          ? 'Camera permission was denied. Allow camera access in your browser, or paste the code below.'
          : `Could not start the camera (${err.name}). You can paste the code below instead.`);
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: '1.25rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
        <CameraOff size={36} style={{ opacity: 0.4, marginBottom: '0.5rem' }} />
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#000', aspectRatio: '1 / 1', maxWidth: 340, margin: '0 auto' }}>
      <video ref={videoRef} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <div style={{ position: 'absolute', inset: '15%', border: '3px solid rgba(255,255,255,0.85)', borderRadius: 16, pointerEvents: 'none', boxShadow: '0 0 0 999px rgba(0,0,0,0.25)' }} />
      {!ready && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', gap: 8, fontSize: '0.85rem' }}>
          <Camera size={18} /> Starting camera...
        </div>
      )}
    </div>
  );
}

// Accepts either a full check-in URL (…/checkin?t=TOKEN) or the bare token
// eslint-disable-next-line react-refresh/only-export-components
export const extractQrToken = (text) => {
  const raw = String(text || '').trim();
  try {
    const t = new URL(raw).searchParams.get('t');
    if (t) return t;
  } catch { /* not a URL */ }
  return /^[a-f0-9]{16,64}$/i.test(raw) ? raw : null;
};
