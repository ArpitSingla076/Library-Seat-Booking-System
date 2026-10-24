import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { IndianRupee, CheckCircle2, Receipt, AlertTriangle, Printer, Lock, Smartphone, CreditCard, Landmark, Wallet } from 'lucide-react';
import { bookingsAPI, errorMessage } from '../../services/api';
import { useSettings } from '../../context/SettingsContext';
import { useAuth } from '../../context/AuthContext';
import { useT } from '../../i18n';
import { PageHeader, Chip, Spinner, Empty, Modal, Pagination, Field } from '../../components/ui';

const METHODS = [['upi', 'UPI', Smartphone], ['card', 'Card', CreditCard], ['netbanking', 'Net banking', Landmark], ['wallet', 'Wallet', Wallet]];
const BANKS = ['State Bank of India', 'HDFC Bank', 'ICICI Bank', 'Punjab National Bank', 'Axis Bank', 'Kotak Mahindra Bank'];

// Loads Razorpay's checkout window only when a real gateway is configured on the server
const loadRazorpay = () => new Promise((resolve, reject) => {
  if (window.Razorpay) return resolve(window.Razorpay);
  const s = document.createElement('script');
  s.src = 'https://checkout.razorpay.com/v1/checkout.js';
  s.onload = () => resolve(window.Razorpay);
  s.onerror = () => reject(new Error('Could not load the payment window. Check your internet connection.'));
  document.body.appendChild(s);
});

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Opens a clean printable receipt in a new window
const printReceipt = (payments, user) => {
  const w = window.open('', '_blank', 'width=520,height=700');
  if (!w) return toast.error('Allow pop-ups to print the receipt.');
  const total = payments.reduce((s, p) => s + p.amount, 0);
  const rows = payments.map((p) => `<tr><td>${esc(p.receiptNo)}</td><td>${p.booking?.seat?.seatNumber ? `Seat ${esc(p.booking.seat.seatNumber)}` : 'Library fine'}</td><td style="text-align:right">₹${esc(p.amount)}</td></tr>`).join('');
  w.document.write(`<!doctype html><html><head><title>Receipt</title><style>
    body{font-family:Arial,sans-serif;margin:32px;color:#0f172a} h1{font-size:20px;margin:0} .muted{color:#64748b;font-size:13px}
    table{width:100%;border-collapse:collapse;margin-top:20px;font-size:14px} td,th{padding:8px 4px;border-bottom:1px solid #e2e8f0;text-align:left}
    .total{font-size:18px;font-weight:700;text-align:right;margin-top:16px} .ok{color:#16a34a;font-weight:700}
  </style></head><body>
    <h1>BookMySeat Library</h1><div class="muted">Payment receipt</div><hr style="margin:16px 0;border:none;border-top:1px solid #e2e8f0">
    <div><b>${esc(user?.name)}</b> <span class="muted">${esc(user?.studentId || user?.email)}</span></div>
    <div class="muted">${esc(format(new Date(payments[0].createdAt), 'd MMM yyyy, h:mm a'))} · ${esc(String(payments[0].method).toUpperCase())} · ${esc(payments[0].provider)}</div>
    <table><thead><tr><th>Receipt no</th><th>For</th><th style="text-align:right">Amount</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="total">Total paid: ₹${esc(total)}</div><div class="ok" style="margin-top:8px">PAID</div>
    <script>window.onload=function(){window.print()}<\/script></body></html>`);
  w.document.close();
};

export default function FinesPage() {
  const { settings } = useSettings();
  const { user } = useAuth();
  const { t } = useT();
  const [fines, setFines] = useState([]);
  const [payments, setPayments] = useState([]);
  const [summary, setSummary] = useState({ unpaidAmount: 0, unpaidCount: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('unpaid');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [busy, setBusy] = useState(false);
  const [sim, setSim] = useState(null); // demo checkout order
  const [receipt, setReceipt] = useState(null); // payments to show in the receipt dialog

  const load = useCallback(async (p = page) => {
    try {
      const params = { page: p, limit: 10 };
      if (filter !== 'all') params.fineStatus = filter;
      const [res, pay] = await Promise.all([bookingsAPI.getMyFines(params), bookingsAPI.getPayments()]);
      setFines(res.data.bookings);
      setSummary(res.data.summary);
      setPages(res.data.pages);
      setPage(p);
      setPayments(pay.data.payments);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to load fines'));
    } finally {
      setLoading(false);
    }
  }, [filter, page]);

  useEffect(() => { setLoading(true); load(1); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Step 2 of checkout: the server confirms the payment and marks the fines paid
  const finish = async (orderRef, extra) => {
    setBusy(true);
    try {
      const res = await bookingsAPI.verifyPayment({ orderRef, ...extra });
      toast.success('Payment successful');
      setSim(null);
      setReceipt(res.data.payments);
      await load(page);
    } catch (err) {
      toast.error(errorMessage(err, 'Payment failed'));
    } finally {
      setBusy(false);
    }
  };

  // Step 1: ask the server for a checkout (amount is calculated on the server)
  const startPay = async (target) => {
    setBusy(true);
    try {
      const { data: order } = await bookingsAPI.createOrder(target === 'all' ? {} : { bookingId: target._id });
      if (order.provider === 'razorpay') {
        const Razorpay = await loadRazorpay();
        const rzp = new Razorpay({
          key: order.keyId,
          amount: Math.round(order.amount * 100),
          currency: order.currency,
          order_id: order.providerOrderId,
          name: 'BookMySeat Library',
          description: `Library fine (₹${order.amount})`,
          prefill: { name: user?.name, email: user?.email },
          theme: { color: '#2563eb' },
          handler: (r) => finish(order.orderRef, { paymentId: r.razorpay_payment_id, signature: r.razorpay_signature }),
          modal: { ondismiss: () => setBusy(false) },
        });
        rzp.on('payment.failed', (r) => { toast.error(r?.error?.description || 'Payment failed'); setBusy(false); });
        rzp.open();
      } else {
        setSim(order);
        setBusy(false);
      }
    } catch (err) {
      toast.error(errorMessage(err, 'Could not start the payment'));
      setBusy(false);
    }
  };

  const totalUnpaid = summary.unpaidAmount;

  return (
    <div className="page" style={{ maxWidth: 900, margin: '0 auto' }}>
      <PageHeader title={t('finesTitle')} subtitle={`No-show: ₹${settings.noShowFine} · Overstay: ₹${settings.overstayFine}`} />

      <div className="glass-card fade-in" style={{ padding: '1.5rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', borderColor: totalUnpaid ? 'rgba(239,68,68,0.35)' : 'rgba(34,197,94,0.35)' }}>
        <div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Outstanding balance</div>
          <div style={{ fontSize: '2.2rem', fontWeight: 800, color: totalUnpaid ? 'var(--accent-red)' : 'var(--accent-green)', display: 'flex', alignItems: 'center' }}>
            <IndianRupee size={28} />{totalUnpaid}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            {totalUnpaid ? <><AlertTriangle size={12} style={{ display: 'inline', marginRight: 4 }} />You cannot book seats until this is paid.</> : <><CheckCircle2 size={12} style={{ display: 'inline', marginRight: 4 }} />You're all clear. Happy studying!</>}
          </div>
        </div>
        {totalUnpaid > 0 && <button className="btn-primary" disabled={busy} onClick={() => startPay('all')}>{busy ? 'Please wait...' : `Pay all (₹${totalUnpaid})`}</button>}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {[['unpaid', `Unpaid (${summary.unpaidCount})`], ['paid', 'Paid'], ['waived', 'Waived'], ['all', 'All']].map(([k, l]) => <Chip key={k} active={filter === k} onClick={() => setFilter(k)}>{l}</Chip>)}
      </div>

      {loading ? <Spinner /> : fines.length === 0 ? <Empty icon={CheckCircle2} text="Nothing here" /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
          {fines.map((f) => (
            <div key={f._id} className="glass-card" style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Seat {f.seat?.seatNumber} · {f.section?.name}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{format(new Date(f.startTime), 'EEE d MMM, h:mm a')}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--danger-text)', marginTop: 2 }}>{f.fineReason}</div>
              </div>
              <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>₹{f.fineAmount}</div>
              {f.fineWaived ? <span className="badge badge-completed">Waived</span>
                : f.finePaid ? <span className="badge badge-active">Paid</span>
                : <button className="btn-primary" disabled={busy} onClick={() => startPay(f)}>Pay ₹{f.fineAmount}</button>}
            </div>
          ))}
        </div>
      )}

      <Pagination page={page} pages={pages} onChange={(p) => load(p)} />

      {payments.length > 0 && (
        <>
          <h3 style={{ fontWeight: 600, margin: '1rem 0 0.75rem', display: 'flex', alignItems: 'center', gap: 6 }}><Receipt size={18} /> Payment history</h3>
          <div className="table-wrapper">
            <table>
              <thead><tr><th>Receipt</th><th>Date</th><th>Seat</th><th>Method</th><th>Amount</th><th></th></tr></thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p._id}>
                    <td style={{ fontWeight: 600 }}>{p.receiptNo}</td>
                    <td>{format(new Date(p.createdAt), 'd MMM yyyy, h:mm a')}</td>
                    <td>{p.booking?.seat?.seatNumber || '-'}</td>
                    <td style={{ textTransform: 'uppercase' }}>{p.method}</td>
                    <td>₹{p.amount}</td>
                    <td><button className="btn-ghost" style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }} onClick={() => setReceipt([p])}>Receipt</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {sim && <DemoCheckout order={sim} busy={busy} onClose={() => !busy && setSim(null)} onPay={(method) => finish(sim.orderRef, { method })} />}

      {receipt && (
        <Modal title="Payment successful" onClose={() => setReceipt(null)} maxWidth={420}>
          <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
            <CheckCircle2 size={44} color="var(--accent-green)" />
            <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: 4 }}>₹{receipt.reduce((s, p) => s + p.amount, 0)}</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{receipt.map((p) => p.receiptNo).join(', ')}</div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={() => printReceipt(receipt, user)}><Printer size={15} /> Print receipt</button>
            <button className="btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setReceipt(null)}>Done</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// Demo checkout, shown when the server has no Razorpay keys. No real money moves.
function DemoCheckout({ order, busy, onClose, onPay }) {
  const [method, setMethod] = useState('upi');
  const [upi, setUpi] = useState('');
  const [card, setCard] = useState({ number: '', expiry: '', cvv: '' });
  const [bank, setBank] = useState(BANKS[0]);

  const valid = () => {
    if (method === 'upi') return /^[\w.\-]{2,}@[A-Za-z]{2,}$/.test(upi.trim());
    if (method === 'card') return /^\d{16}$/.test(card.number.replace(/\s/g, '')) && /^(0[1-9]|1[0-2])\/\d{2}$/.test(card.expiry) && /^\d{3}$/.test(card.cvv);
    return true;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!valid()) return toast.error(method === 'upi' ? 'Enter a UPI ID like name@bank' : 'Check the card details');
    await new Promise((r) => setTimeout(r, 900)); // pretend to talk to the bank
    onPay(method); // only the method is sent: card numbers and UPI IDs never leave this form
  };

  return (
    <Modal title="Pay library fine" onClose={onClose} maxWidth={440}>
      <div style={{ background: 'var(--warn-bg)', border: '1px solid var(--warn-bd)', color: 'var(--warn-tx)', borderRadius: 8, padding: '0.5rem 0.75rem', fontSize: '0.78rem', marginBottom: '1rem' }}>
        Demo checkout: no real money moves. The admin can switch on real payments by adding Razorpay keys.
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1rem' }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Amount to pay ({order.count} fine{order.count > 1 ? 's' : ''})</span>
        <span style={{ fontSize: '1.8rem', fontWeight: 800 }}>₹{order.amount}</span>
      </div>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {METHODS.map(([k, label, Icon]) => (
            <button type="button" key={k} className={`chip${method === k ? ' chip-active' : ''}`} onClick={() => setMethod(k)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon size={13} /> {label}</button>
          ))}
        </div>
        {method === 'upi' && <Field label="UPI ID"><input className="input" placeholder="yourname@bank" value={upi} onChange={(e) => setUpi(e.target.value)} autoFocus /></Field>}
        {method === 'card' && (
          <>
            <Field label="Card number"><input className="input" inputMode="numeric" maxLength={19} placeholder="4111 1111 1111 1111" value={card.number} onChange={(e) => setCard((p) => ({ ...p, number: e.target.value.replace(/[^\d ]/g, '') }))} /></Field>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <Field label="Expiry (MM/YY)"><input className="input" maxLength={5} placeholder="08/29" value={card.expiry} onChange={(e) => setCard((p) => ({ ...p, expiry: e.target.value }))} /></Field>
              <Field label="CVV"><input className="input" type="password" inputMode="numeric" maxLength={3} placeholder="123" value={card.cvv} onChange={(e) => setCard((p) => ({ ...p, cvv: e.target.value.replace(/\D/g, '') }))} /></Field>
            </div>
          </>
        )}
        {method === 'netbanking' && (
          <Field label="Choose your bank">
            <select className="input" value={bank} onChange={(e) => setBank(e.target.value)}>{BANKS.map((b) => <option key={b}>{b}</option>)}</select>
          </Field>
        )}
        {method === 'wallet' && <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>You will be charged to your wallet balance.</p>}
        <button className="btn-primary" style={{ justifyContent: 'center' }} disabled={busy}><Lock size={14} /> {busy ? 'Processing...' : `Pay ₹${order.amount}`}</button>
      </form>
    </Modal>
  );
}
