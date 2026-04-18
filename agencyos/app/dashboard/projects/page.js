'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/Modal';
import { fmtDuration } from '@/lib/utils';
import { Plus, Search, ChevronRight, Circle } from 'lucide-react';

const COLORS = ['#007AFF','#34C759','#FF9500','#FF3B30','#AF52DE','#32ADE6','#5856D6','#FF2D55','#00C7BE'];
const empty = { name: '', description: '', client_id: '', status: 'active', color: '#007AFF', hourly_rate: '' };

export default function ProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(empty);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({});

  useEffect(() => { load(); }, []);

  async function load() {
    const [{ data: proj }, { data: cli }] = await Promise.all([
      supabase.from('projects').select('*, clients(name)').order('created_at', { ascending: false }),
      supabase.from('clients').select('id, name').order('name'),
    ]);
    setProjects(proj || []);
    setClients(cli || []);

    const { data: entries } = await supabase.from('time_entries').select('project_id, duration_seconds').not('end_time', 'is', null);
    const s = {};
    (entries || []).forEach(e => {
      if (!e.project_id) return;
      s[e.project_id] = (s[e.project_id] || 0) + (e.duration_seconds || 0);
    });
    setStats(s);
  }

  function openAdd() { setForm(empty); setSelected(null); setModal(true); }
  function openEdit(p) {
    setForm({ name: p.name, description: p.description || '', client_id: p.client_id || '', status: p.status, color: p.color, hourly_rate: p.hourly_rate || '' });
    setSelected(p); setModal(true);
  }

  async function save() {
    setLoading(true);
    const payload = { ...form, client_id: form.client_id || null, hourly_rate: form.hourly_rate ? parseFloat(form.hourly_rate) : null };
    if (selected) await supabase.from('projects').update(payload).eq('id', selected.id);
    else await supabase.from('projects').insert(payload);
    setModal(false); setLoading(false); load();
  }

  async function del(id) {
    if (!confirm('Ștergi proiectul?')) return;
    await supabase.from('projects').delete().eq('id', id);
    load();
  }

  const filtered = projects.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.clients?.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-title2 font-bold text-ios-primary">Proiecte</h1>
          <p className="text-subhead text-ios-secondary">{projects.filter(p => p.status === 'active').length} active</p>
        </div>
        <button onClick={openAdd} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" strokeWidth={2.5} /> Proiect nou
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-tertiary" />
        <input className="input pl-10" placeholder="Caută proiecte..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-headline font-semibold text-ios-secondary mb-4">Niciun proiect</p>
          <button onClick={openAdd} className="btn-primary">Adaugă proiect</button>
        </div>
      ) : (
        <div className="card">
          {filtered.map((p, i) => (
            <button key={p.id} onClick={() => openEdit(p)}
              className={`list-row w-full text-left hover:bg-ios-bg transition-colors ${i === 0 ? '' : ''}`}>
              <div className="w-3 h-3 rounded-full shrink-0 mr-3" style={{ background: p.color }} />
              <div className="flex-1 min-w-0">
                <p className="text-subhead font-semibold text-ios-primary">{p.name}</p>
                <p className="text-footnote text-ios-secondary">{p.clients?.name || 'Fără client'}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {stats[p.id] && <span className="text-footnote text-ios-secondary">{fmtDuration(stats[p.id])}</span>}
                <span className={`badge ${p.status === 'active' ? 'badge-green' : 'badge-gray'}`}>
                  {p.status === 'active' ? 'Activ' : 'Arhivat'}
                </span>
                <ChevronRight className="w-4 h-4 text-ios-tertiary" />
              </div>
            </button>
          ))}
        </div>
      )}

      {modal && (
        <Modal title={selected ? 'Editează proiect' : 'Proiect nou'} onClose={() => setModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="input-label">Nume proiect *</label>
              <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="input-label">Client</label>
              <select className="input" value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })}>
                <option value="">— Fără client —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="input-label">Descriere</label>
              <textarea className="input" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
            <div>
              <label className="input-label">Cost/oră (€)</label>
              <input className="input" type="number" placeholder="25" value={form.hourly_rate} onChange={e => setForm({ ...form, hourly_rate: e.target.value })} />
            </div>
            <div>
              <label className="input-label">Culoare</label>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map(c => (
                  <button key={c} onClick={() => setForm({ ...form, color: c })}
                    style={{ background: c }}
                    className={`w-8 h-8 rounded-full transition-all ${form.color === c ? 'ring-2 ring-offset-2 ring-ios-blue scale-110' : ''}`} />
                ))}
              </div>
            </div>
            <div>
              <label className="input-label">Status</label>
              <div className="flex gap-2">
                {[['active','Activ'],['archived','Arhivat']].map(([k,v]) => (
                  <button key={k} onClick={() => setForm({ ...form, status: k })}
                    className={`flex-1 py-2 rounded-ios text-footnote font-semibold transition-all ${form.status === k ? 'bg-ios-blue text-white' : 'bg-ios-fill text-ios-secondary'}`}>{v}</button>
                ))}
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              {selected && <button className="btn-danger" onClick={() => { del(selected.id); setModal(false); }}>Șterge</button>}
              <button className="btn-secondary flex-1" onClick={() => setModal(false)}>Anulează</button>
              <button className="btn-primary flex-1" onClick={save} disabled={loading || !form.name}>
                {loading ? 'Se salvează...' : 'Salvează'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
