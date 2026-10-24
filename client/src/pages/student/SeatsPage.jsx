import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { format, addDays, addMinutes } from 'date-fns';
import { MapPin, Clock, Armchair, Wifi, AlertTriangle, CalendarCheck } from 'lucide-react';
import { seatsAPI, bookingsAPI, waitlistAPI, errorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useT } from '../../i18n';
import { useSocket } from '../../context/SocketContext';
import { useSettings } from '../../context/SettingsContext';
import { Modal, PageHeader, Field, Spinner, useDialog } from '../../components/ui';

const SLOT = 30 * 60 * 1000;
const floorToSlot = (d) => new Date(Math.floor(d.getTime() / SLOT) * SLOT);
const dayStr = (d) => format(d, 'yyyy-MM-dd');
const toDate = (day, time) => new Date(`${day}T${time}:00`); // local time

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const allTimes = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

export default function SeatsPage() {
  const navigate = useNavigate();
  const { on } = useSocket();
  const { settings } = useSettings();
  const { user } = useAuth();
  const { t } = useT();
  const { confirm } = useDialog();

  const [sections, setSections] = useState([]);
  const [activeSection, setActiveSection] = useState(null);
  const [seats, setSeats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [upcoming, setUpcoming] = useState([]);
  const [unpaid, setUnpaid] = useState(0);

  // Time window picker (defaults to the next half hour for 1 hour)
  const [day, setDay] = useState(() => dayStr(floorToSlot(new Date())));
  const [time, setTime] = useState(() => format(floorToSlot(new Date()), 'HH:mm'));
  const [duration, setDuration] = useState(60);

  const [selected, setSelected] = useState(null);
  const [groupSize, setGroupSize] = useState(1);
  const [repeatWeeks, setRepeatWeeks] = useState(1);
  const [booking, setBooking] = useState(false);

  const todayStr = dayStr(new Date());
  const times = useMemo(() => {
    if (day !== todayStr) return allTimes;
    const nowSlot = format(floorToSlot(new Date()), 'HH:mm');
    return allTimes.filter((t) => t >= nowSlot);
  }, [day, todayStr]);

  // keep the chosen time valid when the date changes
  useEffect(() => {
    if (times.length && !times.includes(time)) setTime(times[0]);
  }, [times, time]);

  const maxMinutes = settings.maxDurationHours * 60;
  const durations = useMemo(() => Array.from({ length: Math.max(1, maxMinutes / 30) }, (_, i) => (i + 1) * 30), [maxMinutes]);
  useEffect(() => { if (duration > maxMinutes) setDuration(maxMinutes); }, [duration, maxMinutes]);

  const start = useMemo(() => toDate(day, time), [day, time]);
  const end = useMemo(() => addMinutes(start, duration), [start, duration]);
  const windowLabel = `${format(start, 'EEE d MMM, h:mm a')} – ${format(end, 'h:mm a')}`;

  const loadMeta = useCallback(async () => {
    try {
      const [secRes, activeRes, finesRes] = await Promise.all([
        seatsAPI.getSections(),
        bookingsAPI.getActive(),
        bookingsAPI.getMyFines({ limit: 1 }),
      ]);
      setSections(secRes.data.sections);
      setActiveSection((cur) => cur || secRes.data.sections[0]?._id || null);
      if (secRes.data.sections.length === 0) setLoading(false); // nothing to load: show the empty message
      setUpcoming(activeRes.data.bookings || []);
      setUnpaid(finesRes.data.summary?.unpaidAmount || 0);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to load data'));
      setLoading(false);
    }
  }, []);

  const loadSeats = useCallback(async () => {
    if (!activeSection) return;
    try {
      const res = await seatsAPI.getAll({ sectionId: activeSection, startTime: start.toISOString(), endTime: end.toISOString() });
      setSeats(res.data.seats);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to load seats'));
    } finally {
      setLoading(false);
    }
  }, [activeSection, start, end]);

  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => { loadSeats(); }, [loadSeats]);

  // Live updates: refetch (debounced) whenever anyone books/cancels
  const timer = useRef(null);
  useEffect(() => on('seat_update', () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { loadSeats(); }, 250);
  }), [on, loadSeats]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const rows = [...new Set(seats.map((s) => s.row ?? 1))].sort((a, b) => a - b);

  const joinWaitlist = async (seat) => {
    const ok = await confirm({ title: `Seat ${seat.seatNumber} is booked`, message: `Want a notification if it becomes free for ${windowLabel}?`, confirmLabel: 'Notify me' });
    if (!ok) return;
    try {
      const res = await waitlistAPI.join({ seatId: seat._id, startTime: start.toISOString(), endTime: end.toISOString() });
      toast.success(res.data.message);
    } catch (err) { toast.error(errorMessage(err)); }
  };

  const clickSeat = (seat) => {
    if (seat.isMaintenance) return toast.error('This seat is under maintenance.');
    if (seat.bookedByMe) return toast('You already booked a seat for this time.');
    if (seat.isBookedForSlot) return joinWaitlist(seat);
    if (settings.requireVerifiedEmail && !user?.emailVerified) return toast.error('Verify your email on the Profile page before booking.');
    if (unpaid > 0) return toast.error(`Pay your outstanding fine (₹${unpaid}) before booking.`);
    if (end <= new Date()) return toast.error('That time has already passed.');
    setGroupSize(1);
    setRepeatWeeks(1);
    setSelected(seat);
  };

  const confirmBooking = async () => {
    setBooking(true);
    try {
      const res = await bookingsAPI.create({
        seatId: selected._id, startTime: start.toISOString(), endTime: end.toISOString(),
        groupSize: selected.kind === 'room' ? groupSize : 1, repeatWeeks,
      });
      if (repeatWeeks > 1) {
        const skipped = res.data.skipped || [];
        toast.success(`${res.data.created} weekly booking(s) made for ${selected.seatNumber}.`);
        if (skipped.length) toast(`${skipped.length} week(s) skipped: ${skipped[0].reason}`, { duration: 8000 });
      } else {
        toast.success(`${selected.kind === 'room' ? 'Room' : 'Seat'} ${selected.seatNumber} booked!`);
      }
      setSelected(null);
      await Promise.all([loadMeta(), loadSeats()]);
    } catch (err) {
      toast.error(errorMessage(err, 'Booking failed'));
      loadSeats();
    } finally {
      setBooking(false);
    }
  };

  const section = sections.find((s) => s._id === activeSection);
  const next = upcoming[0];

  return (
    <div className="page" style={{ maxWidth: 1100, margin: '0 auto' }}>
      <PageHeader title={t('seatMapTitle')} subtitle={t('seatMapSub')} />

      {settings.hoursEnabled && (
        <div className="glass-card" style={{ padding: '0.7rem 1.1rem', marginBottom: '1.25rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          Library hours: <b style={{ color: 'var(--text-primary)' }}>{hm(settings.openMinutes)} – {hm(settings.closeMinutes)}</b>
          {settings.closedWeekdays?.length > 0 && <> · Closed on {settings.closedWeekdays.map((d) => WEEKDAYS[d]).join(', ')}</>}
          {settings.holidays?.length > 0 && <> · Holidays: {settings.holidays.filter((h) => h >= todayStr).slice(0, 5).join(', ') || 'none upcoming'}</>}
        </div>
      )}

      {unpaid > 0 && (
        <div className="glass-card fade-in" style={{ padding: '1rem 1.25rem', marginBottom: '1.25rem', borderColor: 'rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.04)', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <AlertTriangle size={20} color="var(--accent-red)" />
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--accent-red)' }}>Outstanding fine: ₹{unpaid}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>You cannot book a new seat until your fines are paid.</div>
          </div>
          <button className="btn-primary" style={{ background: 'var(--accent-red)', borderColor: 'var(--accent-red)' }} onClick={() => navigate('/fines')}>Pay fines</button>
        </div>
      )}

      {next && (
        <div className="glass-card fade-in" style={{ padding: '0.9rem 1.25rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', borderColor: 'rgba(37,99,235,0.25)' }}>
          <CalendarCheck size={20} color="var(--accent)" />
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
              {upcoming.length} active booking{upcoming.length > 1 ? 's' : ''} · next: Seat {next.seat?.seatNumber}, {next.section?.name}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              {format(new Date(next.startTime), 'EEE d MMM, h:mm a')} → {format(new Date(next.endTime), 'h:mm a')}
              {next.checkInTime && <span style={{ marginLeft: 8, color: 'var(--accent-green)' }}>✓ Checked in</span>}
            </div>
          </div>
          <Link to="/bookings" className="btn-ghost" style={{ textDecoration: 'none' }}>Manage</Link>
        </div>
      )}

      {/* Time window picker */}
      <div className="glass-card" style={{ padding: '1.1rem 1.25rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.9rem' }}>
          <Field label="Date">
            <input className="input" type="date" value={day} min={todayStr} max={dayStr(addDays(new Date(), settings.advanceBookingDays))} onChange={(e) => e.target.value && setDay(e.target.value)} />
          </Field>
          <Field label="Start time">
            <select className="input" value={time} onChange={(e) => setTime(e.target.value)}>
              {times.map((t) => <option key={t} value={t}>{format(toDate(day, t), 'h:mm a')}</option>)}
            </select>
          </Field>
          <Field label="Duration">
            <select className="input" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              {durations.map((m) => <option key={m} value={m}>{m >= 60 ? `${m / 60 % 1 ? (m / 60).toFixed(1) : m / 60} hr` : `${m} min`}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ marginTop: '0.8rem', fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Clock size={13} /> Showing availability for <b style={{ color: 'var(--text-primary)' }}>{windowLabel}</b>
          <span>· check-in opens {settings.earlyCheckInMinutes} min before the start</span>
        </div>
      </div>

      {/* Section tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        {sections.map((sec) => (
          <button key={sec._id} onClick={() => { setLoading(true); setActiveSection(sec._id); }} className={`chip${activeSection === sec._id ? ' chip-active' : ''}`} style={{ padding: '0.5rem 1.1rem', fontSize: '0.85rem' }}>
            {sec.name}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.1rem', flexWrap: 'wrap' }}>
        {[['seat-available', t('available')], ['seat-booked', t('booked')], ['seat-mine', t('yourSeat')], ['seat-maintenance', t('maintenance')]].map(([cls, label]) => (
          <div key={cls} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            <div className={`seat-cell ${cls}`} style={{ width: 14, height: 14, borderRadius: 4, cursor: 'default' }} />{label}
          </div>
        ))}
        <div style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}><Wifi size={12} /> live</div>
      </div>

      {!loading && sections.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <Armchair size={44} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
          <h3 style={{ fontWeight: 600 }}>No seats have been set up yet</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginTop: '0.4rem' }}>
            The library has no sections or seats. Ask the admin to add them (Admin panel, Sections and Seats).
          </p>
        </div>
      ) : loading ? <Spinner label="Loading seats..." /> : (
        <div className="glass-card" style={{ padding: '1.5rem', overflowX: 'auto' }}>
          {rows.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
              <Armchair size={40} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
              <p>No seats in this section</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center', minWidth: 'max-content', margin: '0 auto' }}>
              <div style={{ width: '80%', height: 6, background: 'linear-gradient(135deg, rgba(37,99,235,0.2), transparent)', borderRadius: 9999 }} />
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>ENTRANCE</div>
              {rows.map((row) => (
                <div key={row} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span style={{ width: 24, fontSize: '0.7rem', color: 'var(--text-secondary)', textAlign: 'right' }}>R{row}</span>
                  {seats.filter((s) => (s.row ?? 1) === row).sort((a, b) => (a.col ?? 0) - (b.col ?? 0)).map((seat) => {
                    const cls = seat.isMaintenance ? 'seat-maintenance' : seat.bookedByMe ? 'seat-mine' : seat.isBookedForSlot ? 'seat-booked' : 'seat-available';
                    const label = seat.isMaintenance ? 'Maintenance' : seat.bookedByMe ? 'Your booking' : seat.isBookedForSlot ? 'Booked at this time' : 'Available';
                    return (
                      <div key={seat._id} className={`seat-cell ${cls}`} title={`${seat.kind === 'room' ? 'Room' : 'Seat'} ${seat.seatNumber} — ${label}`} onClick={() => clickSeat(seat)} role="button" tabIndex={0}
                        aria-label={`${seat.kind === 'room' ? 'Room' : 'Seat'} ${seat.seatNumber}, ${label}`}
                        onKeyDown={(e) => e.key === 'Enter' && clickSeat(seat)}
                        style={seat.kind === 'room' ? { width: 'auto', minWidth: 96, padding: '0 0.6rem', whiteSpace: 'nowrap' } : undefined}>
                        {seat.seatNumber}{seat.kind === 'room' ? ` (${seat.capacity})` : ''}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {section && (section.amenities?.length > 0 || section.description) && (
        <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {section.description && <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{section.description} · Floor {section.floor}</span>}
          {section.amenities?.map((a) => (
            <span key={a} style={{ padding: '0.2rem 0.7rem', borderRadius: 9999, background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.15)', fontSize: '0.75rem', color: 'var(--accent)' }}>
              {a.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      )}

      {selected && (
        <Modal title={`Book ${selected.kind === 'room' ? 'room' : 'seat'} ${selected.seatNumber}`} onClose={() => setSelected(null)}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 6 }}>
            <MapPin size={13} /> {selected.section?.name}, Floor {selected.section?.floor}
          </p>
          <div style={{ background: 'rgba(37,99,235,0.04)', border: '1px solid rgba(37,99,235,0.12)', borderRadius: 10, padding: '0.9rem 1rem', marginBottom: '1rem' }}>
            <div style={{ fontWeight: 600 }}>{format(start, 'EEEE, d MMM yyyy')}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{format(start, 'h:mm a')} – {format(end, 'h:mm a')} ({duration} min)</div>
          </div>
          {selected.kind === 'room' && (
            <div style={{ marginBottom: '1rem' }}>
              <Field label={`Group size (max ${selected.capacity})`}>
                <input className="input" type="number" min="1" max={selected.capacity} value={groupSize} onChange={(e) => setGroupSize(Math.min(selected.capacity, Math.max(1, Number(e.target.value) || 1)))} />
              </Field>
            </div>
          )}
          <div style={{ marginBottom: '1rem' }}>
            <Field label="Repeat" hint="Books the same time on the same weekday; weeks that clash with a rule are skipped">
              <select className="input" value={repeatWeeks} onChange={(e) => setRepeatWeeks(Number(e.target.value))}>
                <option value={1}>Just once</option>
                {[2, 3, 4, 6, 8].map((w) => <option key={w} value={w}>Every week for {w} weeks</option>)}
              </select>
            </Field>
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: 1.6 }}>
            ⚡ Check in within {settings.gracePeriodMinutes} min of the start{settings.requireQrCheckIn ? ' by scanning the QR code on the seat' : ''} or the booking is cancelled
            {settings.noShowFine > 0 ? ` and a ₹${settings.noShowFine} fine applies` : ''}.
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setSelected(null)}>Cancel</button>
            <button className="btn-primary" style={{ flex: 2, justifyContent: 'center' }} disabled={booking} onClick={confirmBooking}>
              {booking ? 'Booking...' : 'Confirm booking'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}