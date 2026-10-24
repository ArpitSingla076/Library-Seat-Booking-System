import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { seatsAPI, errorMessage } from '../../services/api';
import { useDialog, Modal, PageHeader, Spinner, Field } from '../../components/ui';

const EMPTY = { name: '', description: '', floor: 1, amenities: '', isActive: true };

export default function AdminSections() {
  const { confirm } = useDialog();
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | 'new' | section
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setSections((await seatsAPI.getSections({ all: true })).data.sections);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to load sections'));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const open = (s) => {
    setEditing(s || 'new');
    setForm(s ? { name: s.name, description: s.description || '', floor: s.floor, amenities: (s.amenities || []).join(', '), isActive: s.isActive } : EMPTY);
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error('Section name is required');
    setSaving(true);
    const payload = {
      name: form.name.trim(), description: form.description, floor: Number(form.floor) || 0, isActive: form.isActive,
      amenities: form.amenities.split(',').map((a) => a.trim().toLowerCase().replace(/\s+/g, '_')).filter(Boolean),
    };
    try {
      if (editing === 'new') await seatsAPI.createSection(payload);
      else await seatsAPI.updateSection(editing._id, payload);
      toast.success('Section saved');
      setEditing(null);
      load();
    } catch (err) { toast.error(errorMessage(err)); }
    finally { setSaving(false); }
  };

  const remove = async (s) => {
    if (!(await confirm({ title: `Delete "${s.name}"?`, message: 'Only empty sections can be deleted.', confirmLabel: 'Delete', danger: true }))) return;
    try {
      await seatsAPI.deleteSection(s._id);
      toast.success('Section deleted');
      load();
    } catch (err) { toast.error(errorMessage(err)); }
  };

  return (
    <div className="page">
      <PageHeader title="Sections" subtitle="Reading rooms, zones and floors">
        <button className="btn-primary" onClick={() => open(null)}><Plus size={16} /> Add section</button>
      </PageHeader>

      {loading ? <Spinner /> : (
        <div className="table-wrapper">
          <table>
            <thead><tr><th>Name</th><th>Floor</th><th>Description</th><th>Amenities</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {sections.map((s) => (
                <tr key={s._id}>
                  <td style={{ fontWeight: 600 }}>{s.name}</td>
                  <td>{s.floor}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{s.description || '-'}</td>
                  <td>{(s.amenities || []).map((a) => a.replace(/_/g, ' ')).join(', ') || '-'}</td>
                  <td>{s.isActive ? <span className="badge badge-active">Open</span> : <span className="badge badge-expired">Closed</span>}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button className="btn-ghost" style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }} onClick={() => open(s)}><Pencil size={12} /> Edit</button>
                      <button className="btn-danger" style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }} onClick={() => remove(s)} aria-label="Delete section"><Trash2 size={12} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {sections.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>No sections yet</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Modal title={editing === 'new' ? 'Add section' : 'Edit section'} onClose={() => setEditing(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            <Field label="Name"><input className="input" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></Field>
            <Field label="Description"><input className="input" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} /></Field>
            <Field label="Floor"><input className="input" type="number" min="0" value={form.floor} onChange={(e) => setForm((p) => ({ ...p, floor: e.target.value }))} /></Field>
            <Field label="Amenities" hint="Comma separated, e.g. wifi, power outlet, whiteboard"><input className="input" value={form.amenities} onChange={(e) => setForm((p) => ({ ...p, amenities: e.target.value }))} /></Field>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem' }}>
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} /> Open for booking
            </label>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button className="btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn-primary" style={{ flex: 2, justifyContent: 'center' }} onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
