'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/Modal';
import { fmtCurrency, fmtDuration, getNeglectLabel } from '@/lib/utils';
import { Plus, Search, ChevronRight, Mail, Phone, Building2, TrendingUp } from 'lucide-react';

const empty = { name: '', company: '', email: '', phone: '', notes: '', monthly_budget: '', hourly_rate: '', type: 'direct' };

export default function ClientsPage() {
  const [clients, setClients] = useState([]);
  const [clientStats, setClientStats] = useState({});
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(empty);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState('grid');

  useEffect(() => { load(); }, []);

  async function load() {
    const { data } = await supabase.from('clients').select('*').order('name');
    setClients(data || []);

    // Load time stats per client
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const { data: entries } = await supabase.from('time_entries')
      .select('project_id, duration_seconds, created_at, projects(client_id)')
      .not('end_time', 'is', null).gte('created_at', monthStart);

    const stats = {};
    (entries || []).forEach(e => {
      const cid = e.projects?.client_id;
      if (!cid) return;
      if (!stats[cid]) stats[cid] = { seconds: 0, lastActivity: null };
      stats[cid].seconds += (e.duration_seconds || 0);
      if (!stats[cid].lastActivity || e.created_at > stats[cid].lastActivity)
        stats[cid].lastActivity = e.created_at;
    });
    setClientStats(stats);
  }

  function openAdd() { setForm(empty); setSelected(null); setModal(true); }
  function openEdit(c) {
    setForm({ name: c.name, company: c.company || '', email: c.email || '', phone: c.phone || '',
      notes: c.notes || '', monthly_budget: c.monthly_budget || '', hourly_rate: c.hourly_rate || '', type: c.type || 'direct' });
    setSelected(c); setModal(true);
  }

  async function save() {
    setLoading(true);
    const payload = {
      ...form,
      monthly_budget: form.monthly_budget ? parseFloat(form.monthly_budget) : null,
      hourly_rate: form.hourly_rate ? parseFloat(form.hourly_rate) : null,
    };
    if (selected) await supabase.from('clients').update(payload).eq('id', selected.id);
    else await supabase.from('clients').insert(payload);
    setModal(false); setLoading(false); load();
  }

  async function del(id) {
    if (!confirm('Ștergi clientul? Proiectele asociate vor rămâne fără client.')) return;
    await supabase.from('clients').delete().eq('id', id);
    load();
  }

  const filtered = clients.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.company?.toLowerCase().includes(search.toLowerCase())
  );

  const typeColors = {
    direct:     'badge-blue',
    whitelabel: 'badge-purple',
    partner:    'badge-green',
  };
  const typeLabels = { direct: 'Direct', whitelabel: 'White-label', partner: 'Partener' };

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

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-tertiary" />
        <input className="input pl-10" placeholder="Caută clienți..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-headline font-semibold text-ios-secondary mb-1">Niciun client</p>
          <p className="text-subhead text-ios-tertiary mb-4">Adaugă primul tău client</p>
          <button onClick={openAdd} className="btn-primary">Adaugă client</button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(c => {
            const st = clientStats[c.id] || {};
            const neglect = getNeglectLabel(st.lastActivity ? 0 : 100);
            const profitability = c.monthly_budget && c.hourly_rate && st.seconds
              ? Math.round(((c.monthly_budget - (st.seconds / 3600) * c.hourly_rate) / c.monthly_budget) * 100)
              : null;

            return (
              <div key={c.id} className="card hover:shadow-ios-lg transition-shadow cursor-pointer" onClick={() => openEdit(c)}>
                <div className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 bg-orange-50 rounded-ios flex items-center justify-center text-ios-orange text-headline font-bold">
                        {c.name[0]?.toUpperCase()}
                      </div>
                      <div>
                        <p className="text-subhead font-semibold text-ios-primary">{c.name}</p>
                        {c.company && <p className="text-footnote text-ios-secondary">{c.company}</p>}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-ios-tertiary shrink-0 mt-0.5" />
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-3">
                    <span className={typeColors[c.type] || 'badge-gray'}>{typeLabels[c.type] || c.type}</span>
                    {st.seconds > 0 && <span className="badge-blue">{fmtDuration(st.seconds)} luna asta</span>}
                    {profitability !== null && (
                      <span className={profitability >= 50 ? 'badge-green' : profitability >= 20 ? 'badge-orange' : 'badge-red'}>
                        {profitability}% profit
                      </span>
                    )}
                  </div>

                  <div className="border-t border-ios-separator/50 pt-3 flex items-center justify-between">
                    {c.monthly_budget
                      ? <span className="text-footnote text-ios-secondary">Budget: <span className="font-semibold text-ios-primary">{fmtCurrency(c.monthly_budget)}/lună</span></span>
                      : <span className="text-footnote text-ios-tertiary">Fără budget setat</span>
                    }
                    {c.email && <Mail className="w-3.5 h-3.5 text-ios-tertiary" />}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <Modal title={selected ? 'Editează client' : 'Client nou'} onClose={() => setModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="input-label">Tip client</label>
              <div className="flex gap-2">
                {Object.entries(typeLabels).map(([k, v]) => (
                  <button key={k} onClick={() => setForm({ ...form, type: k })}
                    className={`flex-1 py-2 rounded-ios text-footnote font-semibold transition-all ${
                      form.type === k ? 'bg-ios-blue text-white' : 'bg-ios-fill text-ios-secondary hover:bg-ios-fill2'
                    }`}>{v}</button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="input-label">Nume client *</label>
                <input className="input" placeholder="Numele clientului" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="col-span-2">
                <label className="input-label">Companie</label>
                <input className="input" placeholder="Numele companiei" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} />
              </div>
              <div>
                <label className="input-label">Email</label>
                <input className="input" type="email" placeholder="email@client.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <label className="input-label">Telefon</label>
                <input className="input" placeholder="+40 ..." value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <label className="input-label">Budget lunar (€)</label>
                <input className="input" type="number" placeholder="1000" value={form.monthly_budget} onChange={e => setForm({ ...form, monthly_budget: e.target.value })} />
              </div>
              <div>
                <label className="input-label">Cost/oră intern (€)</label>
                <input className="input" type="number" placeholder="25" value={form.hourly_rate} onChange={e => setForm({ ...form, hourly_rate: e.target.value })} />
              </div>
              <div className="col-span-2">
                <label className="input-label">Note</label>
                <textarea className="input" rows={3} placeholder="Informații importante..." value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              {selected && (
                <button className="btn-danger" onClick={() => { del(selected.id); setModal(false); }}>Șterge</button>
              )}
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
