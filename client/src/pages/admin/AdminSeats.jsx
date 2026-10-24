import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Plus, Wrench, Trash2, Rows3, LayoutGrid, List } from 'lucide-react';
import { seatsAPI, errorMessage } from '../../services/api';
import { useSocket } from '../../context/SocketContext';
import { useDialog, Modal, PageHeader, Chip, Spinner, Field } from '../../components/ui';

export default function AdminSeats() {
  const { on } = useSocket();
  const { confirm, prompt } = useDialog();
  const [seats, setSeats] = useState([]);
  const [sections, setSections] = useState([]);
  const [sectionFilter, setSectionFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ seatNumber: '', section: '', row: '', col: '', kind: 'seat', capacity: 6 });
  const [view, setView] = useState('table'); // table | layout
  const [showBulk, setShowBulk] = useState(false);
  const [bulk, setBulk] = useState({ prefix: 'A', count: 20, columns: 5, startNumber: 1 });
  const [dragId, setDragId] = useState(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const [secRes, seatRes] = await Promise.all([
        seatsAPI.getSections({ all: true }),
        seatsAPI.getAll(sectionFilter ? { sectionId: sectionFilter } : {}),
      ]);
      setSections(secRes.data.sections);
      setSeats(seatRes.data.seats);
      setForm((p) => (p.section || !secRes.data.sections.length ? p : { ...p, section: secRes.data.sections[0]._id }));
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to load data'));
    } finally {
      setLoading(false);
    }
  }, [sectionFilter]);

  useEffect(() => { setLoading(true); load(); }, [load]);
  useEffect(() => on('seat_update', () => load()), [on, load]);

  const toggleMaintenance = async (seat) => {
    let note = null;
    if (!seat.isMaintenance) {
      note = await prompt({ title: `Maintenance: seat ${seat.seatNumber}`, message: 'All upcoming bookings for this seat will be cancelled and students notified.', placeholder: 'Note (optional, e.g. broken chair)', confirmLabel: 'Start maintenance' });
      if (note === null) return;
    }
    try {
      const res = await seatsAPI.update(seat._id, { isMaintenance: !seat.isMaintenance, maintenanceNote: note || (seat.isMaintenance ? null : 'Under maintenance') });
      toast.success(seat.isMaintenance ? 'Seat restored' : `Seat in maintenance${res.data.cancelledBookings ? ` · ${res.data.cancelledBookings} booking(s) cancelled` : ''}`);
      load();
    } catch (err) { toast.error(errorMessage(err)); }
  };

  const deleteSeat = async (seat) => {
    if (!(await confirm({ title: `Delete seat ${seat.seatNumber}?`, message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return;
    try {
      await seatsAPI.delete(seat._id);
      toast.success('Seat deleted');
      load();
    } catch (err) { toast.error(errorMessage(err)); }
  };

  const addSeat = async () => {
    if (!form.seatNumber || !form.section) return toast.error('Seat number and section required');
    setAdding(true);
    try {
      await seatsAPI.create({ seatNumber: form.seatNumber, section: form.section, row: Number(form.row) || undefined, col: Number(form.col) || undefined, kind: form.kind, capacity: form.kind === 'room' ? Number(form.capacity) || 6 : 1 });
      toast.success('Seat added');
      setShowAdd(false);
      setForm((p) => ({ ...p, seatNumber: '', row: '', col: '' }));
      load();
    } catch (err) { toast.error(errorMessage(err)); }
    finally { setAdding(false); }
  };

  const bulkAdd = async () => {
    if (!form.section) return toast.error('Choose a section first');
    setAdding(true);
    try {
      const res = await seatsAPI.bulkCreate({ section: form.section, ...bulk });
      toast.success(`${res.data.created} seats created${res.data.skipped ? `, ${res.data.skipped} skipped (number already exists)` : ''}`);
      setShowBulk(false);
      load();
    } catch (err) { toast.error(errorMessage(err)); }
    finally { setAdding(false); }
  };

  // Layout editor: drag a seat to an empty cell to change its row / column
  const moveSeat = async (seat, row, col) => {
    if (seat.row === row && seat.col === col) return;
    const prev = seats;
    setSeats((list) => list.map((s) => (s._id === seat._id ? { ...s, row, col } : s)));
    try { await seatsAPI.update(seat._id, { row, col }); } catch (err) { setSeats(prev); toast.error(errorMessage(err)); }
  };
  const layoutSections = sectionFilter ? sections.filter((s) => s._id === sectionFilter) : sections;

  return (
    <div className="page">
      <PageHeader title="Manage Seats" subtitle={`${seats.length} seats`}>
        <button className={view === 'table' ? 'btn-primary' : 'btn-ghost'} onClick={() => setView('table')}><List size={15} /> Table</button>
        <button className={view === 'layout' ? 'btn-primary' : 'btn-ghost'} onClick={() => setView('layout')}><LayoutGrid size={15} /> Layout editor</button>
        <button className="btn-ghost" onClick={() => setShowBulk(true)}><Rows3 size={15} /> Bulk add</button>
        <button className="btn-primary" onClick={() => setShowAdd(true)}><Plus size={16} /> Add seat / room</button>
      </PageHeader>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <Chip active={!sectionFilter} onClick={() => setSectionFilter('')}>All</Chip>
        {sections.map((s) => <Chip key={s._id} active={sectionFilter === s._id} onClick={() => setSectionFilter(s._id)}>{s.name}</Chip>)}
      </div>

      {!loading && view === 'layout' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Drag a seat onto an empty square to move it. Changes save instantly.</p>
          {layoutSections.map((sec) => {
            const list = seats.filter((s) => s.section?._id === sec._id);
            const maxRow = Math.max(3, ...list.map((s) => s.row || 1)) + 1;
            const maxCol = Math.max(5, ...list.map((s) => s.col || 1)) + 1;
            return (
              <div key={sec._id} className="glass-card" style={{ padding: '1rem', overflowX: 'auto' }}>
                <div style={{ fontWeight: 600, marginBottom: '0.75rem' }}>{sec.name} <span style={{ color: 'var(--text-secondary)', fontWeight: 400, fontSize: '0.8rem' }}>· {list.length} seats</span></div>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${maxCol}, minmax(54px, 1fr))`, gap: 6, minWidth: maxCol * 60 }}>
                  {Array.from({ length: maxRow * maxCol }, (_, i) => {
                    const row = Math.floor(i / maxCol) + 1;
                    const col = (i % maxCol) + 1;
                    const here = list.filter((s) => s.row === row && s.col === col);
                    const seat = here[0];
                    return (
                      <div key={i}
                        onDragOver={(e) => { if (!seat) e.preventDefault(); }}
                        onDrop={() => { const s = seats.find((x) => x._id === dragId); if (s && !seat) moveSeat(s, row, col); setDragId(null); }}
                        style={{ height: 44, borderRadius: 8, border: seat ? 'none' : '1px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {seat && (
                          <div draggable onDragStart={() => setDragId(seat._id)} onDragEnd={() => setDragId(null)}
                            className={`seat-cell ${seat.isMaintenance ? 'seat-maintenance' : 'seat-available'}`}
                            style={{ cursor: 'grab', width: '100%', height: '100%', fontSize: '0.72rem' }} title={`${seat.seatNumber} (row ${row}, col ${col})`}>
                            {seat.seatNumber}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {loading ? <Spinner /> : view === 'table' && (
        <div className="table-wrapper">
          <table>
            <thead><tr><th>Seat</th><th>Section</th><th>Floor</th><th>Row / Col</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {seats.map((seat) => (
                <tr key={seat._id}>
                  <td style={{ fontWeight: 600 }}>{seat.seatNumber}{seat.kind === 'room' && <span style={{ marginLeft: 6, fontSize: '0.7rem', color: 'var(--accent)' }}>room · {seat.capacity} people</span>}</td>
                  <td>{seat.section?.name}</td>
                  <td>{seat.section?.floor}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{seat.row} / {seat.col}</td>
                  <td>
                    {seat.isMaintenance ? <span className="badge" style={{ background: 'rgba(245,158,11,0.15)', color: '#d97706' }} title={seat.maintenanceNote || ''}>Maintenance</span>
                      : seat.isBookedForSlot ? <span className="badge badge-cancelled">Occupied now</span>
                      : <span className="badge badge-active">Free now</span>}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button className="btn-ghost" style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }} onClick={() => toggleMaintenance(seat)}>
                        <Wrench size={12} />{seat.isMaintenance ? 'Restore' : 'Maintenance'}
                      </button>
                      <button className="btn-danger" style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }} onClick={() => deleteSeat(seat)} aria-label="Delete seat"><Trash2 size={12} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {seats.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>No seats</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {showBulk && (
        <Modal title="Bulk add seats" onClose={() => setShowBulk(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            <Field label="Section">
              <select className="input" value={form.section} onChange={(e) => setForm((p) => ({ ...p, section: e.target.value }))}>
                {sections.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            </Field>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <Field label="Prefix" hint="e.g. B gives B01, B02…"><input className="input" maxLength={4} value={bulk.prefix} onChange={(e) => setBulk((p) => ({ ...p, prefix: e.target.value }))} /></Field>
              <Field label="Start at"><input className="input" type="number" min="1" value={bulk.startNumber} onChange={(e) => setBulk((p) => ({ ...p, startNumber: e.target.value }))} /></Field>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <Field label="How many (max 200)"><input className="input" type="number" min="1" max="200" value={bulk.count} onChange={(e) => setBulk((p) => ({ ...p, count: e.target.value }))} /></Field>
              <Field label="Seats per row"><input className="input" type="number" min="1" max="30" value={bulk.columns} onChange={(e) => setBulk((p) => ({ ...p, columns: e.target.value }))} /></Field>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button className="btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setShowBulk(false)}>Cancel</button>
              <button className="btn-primary" style={{ flex: 2, justifyContent: 'center' }} onClick={bulkAdd} disabled={adding}>{adding ? 'Creating...' : 'Create seats'}</button>
            </div>
          </div>
        </Modal>
      )}

      {showAdd && (
        <Modal title="Add new seat" onClose={() => setShowAdd(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            <Field label="Seat number"><input className="input" placeholder="e.g. A11" value={form.seatNumber} onChange={(e) => setForm((p) => ({ ...p, seatNumber: e.target.value }))} /></Field>
            <Field label="Section">
              <select className="input" value={form.section} onChange={(e) => setForm((p) => ({ ...p, section: e.target.value }))}>
                {sections.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            </Field>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <Field label="Type">
                <select className="input" value={form.kind} onChange={(e) => setForm((p) => ({ ...p, kind: e.target.value }))}>
                  <option value="seat">Single seat</option>
                  <option value="room">Group room</option>
                </select>
              </Field>
              {form.kind === 'room' && <Field label="Capacity"><input className="input" type="number" min="2" max="100" value={form.capacity} onChange={(e) => setForm((p) => ({ ...p, capacity: e.target.value }))} /></Field>}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <Field label="Row"><input className="input" type="number" min="1" value={form.row} onChange={(e) => setForm((p) => ({ ...p, row: e.target.value }))} /></Field>
              <Field label="Column"><input className="input" type="number" min="1" value={form.col} onChange={(e) => setForm((p) => ({ ...p, col: e.target.value }))} /></Field>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button className="btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="btn-primary" style={{ flex: 2, justifyContent: 'center' }} onClick={addSeat} disabled={adding}>{adding ? 'Adding...' : 'Add seat'}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
