'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/Modal';
import { fmtCurrency, fmtDuration } from '@/lib/utils';
import { Plus, Search, ChevronRight, Mail, Phone } from 'lucide-react';

const CLIENT_TYPES = {
  direct:      { label: 'Direct',      color: 'badge-blue',   bg: 'bg-blue-50 text-ios-blue' },
  whitelabel:  { label: 'White-label', color: 'badge-purple', bg: 'bg-purple-50 text-ios-purple' },
  colaborator: { label: 'Colaborator', color: 'badge-orange', bg: 'bg-orange-50 text-ios-orange' },
};

const empty = { name: '', company: '', email: '', phone: '', notes: '', monthly_budget: '', client_type: 'direct' };

export default function ClientsPage() {
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [modal, setModal] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(empty);
  const [loading, setLoading] = useState(false);
  const [clientStats, setClientStats] = useState({});

  useEffect(() => { load(); }, []);

  async function load() {
    const { data } = await supabase.from('clients').select('*').order('name');
    setClients(data || []);

    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const { data: entries } = await supabase.from('time_entries')
      .select('duration_seconds, created_at, projects(client_id)')
      .not('end_time', 'is', null).gte('created_at', monthStart);

    const stats = {};
    (entries || []).forEach(e => {
      const cid = e.projects?.client_id; if (!cid) return;
      if (!stats[cid]) stats[cid] = { seconds: 0, lastActivity: null };
      stats[cid].seconds += (e.duration_seconds || 0);
      if (!stats[cid].lastActivity || e.created_at > stats[cid].lastActivity) stats[cid].lastActivity = e.created_at;
    });
    setClientStats(stats);
  }

  function openAdd() { setForm(empty); setSelected(null); setModal(true); }
  function openEdit(c) {
    setForm({ name: c.name, company: c.company || '', email: c.email || '', phone: c.phone || '',
      notes: c.notes || '', monthly_budget: c.monthly_budget || '', client_type: c.client_type || 'direct' });
    setSelected(c); setModal(true);
  }

  async function save() {
    setLoading(true);
    const payload = { ...form, monthly_budget: form.monthly_budget ? parseFloat(form.monthly_budget) : null };
    if (selected) await supabase.from('clients').update(payload).eq('id', selected.id);
    else await supabase.from('clients').insert(payload);
    setModal(false); setLoading(false); load();
  }

  async function del(id) {
    if (!confirm('Ștergi clientul?')) return;
    await supabase.from('clients').delete().eq('id', id);
    setModal(false); load();
  }

  const filtered = clients.filter(c => {
    if (filterType && (c.client_type || 'direct') !== filterType) return false;
    if (search && !c.name?.toLowerCase().includes(search.toLowerCase()) && !c.company?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Group by type
  const byType = { direct: [], whitelabel: [], colaborator: [] };
  filtered.forEach(c => { const t = c.client_type || 'direct'; if (byType[t]) byType[t].push(c); });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-title2 font-bold text-ios-primary">Clienți</h1>
          <p className="text-subhead text-ios-secondary">{clients.length} clienți</p>
        </div>
        <button onClick={openAdd} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" strokeWidth={2.5} /> Client nou
        </button>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-tertiary" />
          <input className="input pl-10" placeholder="Caută clienți..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1.5">
          {[['', 'Toți'], ...Object.entries(CLIENT_TYPES).map(([k,v]) => [k, v.label])].map(([k,v]) => (
            <button key={k} onClick={() => setFilterType(k)}
              className={`px-3 py-2 rounded-ios text-footnote font-semibold transition-all whitespace-nowrap ${filterType === k ? 'bg-ios-blue text-white' : 'bg-ios-fill text-ios-secondary'}`}>
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Grouped by type */}
      {Object.entries(CLIENT_TYPES).map(([typeKey, typeInfo]) => {
        const items = filterType ? (filterType === typeKey ? filtered : []) : byType[typeKey];
        if (items.length === 0) return null;
        return (
          <div key={typeKey}>
            <div className="flex items-center gap-2 mb-2 px-1">
              <span className={`badge ${typeInfo.color}`}>{typeInfo.label}</span>
              <span className="text-caption1 text-ios-tertiary">{items.length}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map(c => {
                const st = clientStats[c.id] || {};
                return (
                  <div key={c.id} className="card p-4 hover:shadow-ios-lg transition-shadow cursor-pointer" onClick={() => openEdit(c)}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 ${typeInfo.bg} rounded-ios flex items-center justify-center text-headline font-bold`}>
                          {c.name[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p className="text-subhead font-semibold text-ios-primary">{c.name}</p>
                          {c.company && <p className="text-footnote text-ios-secondary">{c.company}</p>}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-ios-tertiary shrink-0" />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {st.seconds > 0 && <span className="badge badge-blue">{fmtDuration(st.seconds)} luna asta</span>}
                      {c.monthly_budget && <span className="badge badge-green">{fmtCurrency(c.monthly_budget)}/lună</span>}
                    </div>
                    {(c.email || c.phone) && (
                      <div className="mt-2 pt-2 border-t border-ios-separator/50 flex gap-3">
                        {c.email && <div className="flex items-center gap-1 text-caption1 text-ios-secondary"><Mail className="w-3 h-3" />{c.email}</div>}
                        {c.phone && <div className="flex items-center gap-1 text-caption1 text-ios-secondary"><Phone className="w-3 h-3" />{c.phone}</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {filtered.length === 0 && (
        <div className="card p-12 text-center">
          <p className="text-headline font-semibold text-ios-secondary mb-4">Niciun client</p>
          <button onClick={openAdd} className="btn-primary">Adaugă client</button>
        </div>
      )}

      {modal && (
        <Modal title={selected ? 'Editează client' : 'Client nou'} onClose={() => setModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="input-label">Tip client</label>
              <div className="flex gap-2">
                {Object.entries(CLIENT_TYPES).map(([k, v]) => (
                  <button key={k} onClick={() => setForm({ ...form, client_type: k })}
                    className={`flex-1 py-2 rounded-ios text-footnote font-semibold transition-all ${form.client_type === k ? 'bg-ios-blue text-white' : 'bg-ios-fill text-ios-secondary'}`}>
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="input-label">Nume *</label><input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div className="col-span-2"><label className="input-label">Companie</label><input className="input" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} /></div>
              <div><label className="input-label">Email</label><input className="input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
              <div><label className="input-label">Telefon</label><input className="input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
              <div className="col-span-2"><label className="input-label">Budget lunar (€)</label><input className="input" type="number" placeholder="1000" value={form.monthly_budget} onChange={e => setForm({ ...form, monthly_budget: e.target.value })} /></div>
              <div className="col-span-2"><label className="input-label">Note</label><textarea className="input" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <div className="flex gap-3 pt-2">
              {selected && <button className="btn-danger" onClick={() => del(selected.id)}>Șterge</button>}
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
