'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/Modal';
import { fmtDuration, fmtCurrency } from '@/lib/utils';
import { Plus, Search, ChevronRight, Euro, Trash2, ChevronDown } from 'lucide-react';

const COLORS = ['#007AFF','#34C759','#FF9500','#FF3B30','#AF52DE','#32ADE6','#5856D6','#FF2D55','#00C7BE'];
const MONTHS_FULL = ['Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie','Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie'];
const MONTHS_SHORT = ['Ian','Feb','Mar','Apr','Mai','Iun','Iul','Aug','Sep','Oct','Nov','Dec'];
const DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

const empty = { name: '', description: '', client_id: '', status: 'active', color: '#007AFF', billing_day: '', monthly_amount: '' };

export default function ProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [invoiceModal, setInvoiceModal] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(empty);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({});
  const [invoices, setInvoices] = useState([]);
  const [invForm, setInvForm] = useState({ month: new Date().getMonth() + 1, year: new Date().getFullYear(), amount: '' });

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
    (entries || []).forEach(e => { if (!e.project_id) return; s[e.project_id] = (s[e.project_id] || 0) + (e.duration_seconds || 0); });
    setStats(s);
  }

  async function loadInvoices(projectId) {
    const { data } = await supabase.from('invoices').select('*').eq('project_id', projectId).order('year', { ascending: false }).order('month', { ascending: false });
    setInvoices(data || []);
  }

  function openAdd() { setForm(empty); setSelected(null); setModal(true); }
  function openEdit(p) {
    setForm({ name: p.name, description: p.description || '', client_id: p.client_id || '',
      status: p.status, color: p.color, billing_day: p.billing_day || '', monthly_amount: p.monthly_amount || '' });
    setSelected(p); setModal(true);
  }
  async function openInvoices(p) {
    setSelected(p);
    await loadInvoices(p.id);
    setInvoiceModal(true);
  }

  async function save() {
    setLoading(true);
    const payload = {
      ...form,
      client_id: form.client_id || null,
      billing_day: form.billing_day ? parseInt(form.billing_day) : null,
      monthly_amount: form.monthly_amount ? parseFloat(form.monthly_amount) : null,
    };
    if (selected) await supabase.from('projects').update(payload).eq('id', selected.id);
    else await supabase.from('projects').insert(payload);
    setModal(false); setLoading(false); load();
  }

  async function del(id) {
    if (!confirm('Ștergi proiectul?')) return;
    await supabase.from('projects').delete().eq('id', id);
    setModal(false); load();
  }

  async function addInvoice() {
    if (!invForm.amount || !selected) return;
    setLoading(true);
    await supabase.from('invoices').upsert({
      project_id: selected.id,
      month: parseInt(invForm.month),
      year: parseInt(invForm.year),
      amount: parseFloat(invForm.amount),
    }, { onConflict: 'project_id,month,year' });
    await loadInvoices(selected.id);
    setInvForm({ ...invForm, amount: '' });
    setLoading(false);
  }

  async function delInvoice(id) {
    await supabase.from('invoices').delete().eq('id', id);
    loadInvoices(selected.id);
  }

  const filtered = projects.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.clients?.name?.toLowerCase().includes(search.toLowerCase())
  );

  const years = [];
  for (let y = new Date().getFullYear(); y >= new Date().getFullYear() - 2; y--) years.push(y);

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
          {filtered.map(p => (
            <div key={p.id} className="list-row hover:bg-ios-bg transition-colors">
              <div className="w-3 h-3 rounded-full shrink-0 mr-3" style={{ background: p.color }} />
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openEdit(p)}>
                <p className="text-subhead font-semibold text-ios-primary">{p.name}</p>
                <div className="flex gap-3 mt-0.5">
                  <p className="text-footnote text-ios-secondary">{p.clients?.name || 'Fără client'}</p>
                  {p.billing_day && <p className="text-footnote text-ios-tertiary">· Facturare ziua {p.billing_day}</p>}
                  {p.monthly_amount && <p className="text-footnote text-ios-green font-semibold">· {fmtCurrency(p.monthly_amount)}/lună</p>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {stats[p.id] && <span className="text-footnote text-ios-secondary">{fmtDuration(stats[p.id])}</span>}
                <button onClick={() => openInvoices(p)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-ios bg-green-50 text-ios-green text-caption1 font-semibold hover:bg-green-100 transition-colors">
                  <Euro className="w-3 h-3" /> Facturi
                </button>
                <span className={`badge ${p.status === 'active' ? 'badge-green' : 'badge-gray'}`}>
                  {p.status === 'active' ? 'Activ' : 'Arhivat'}
                </span>
                <ChevronRight className="w-4 h-4 text-ios-tertiary cursor-pointer" onClick={() => openEdit(p)} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Project modal */}
      {modal && (
        <Modal title={selected ? 'Editează proiect' : 'Proiect nou'} onClose={() => setModal(false)}>
          <div className="space-y-4">
            <div><label className="input-label">Nume proiect *</label>
              <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div><label className="input-label">Client</label>
              <div className="relative">
                <select className="input appearance-none pr-9" value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })}>
                  <option value="">— Fără client —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-tertiary pointer-events-none" />
              </div>
            </div>
            <div><label className="input-label">Descriere</label>
              <textarea className="input" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>

            {/* Billing settings */}
            <div className="bg-green-50 rounded-ios-lg p-3 space-y-3">
              <p className="text-footnote font-semibold text-ios-green uppercase tracking-wide">Setări facturare</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="input-label">Ziua facturării</label>
                  <div className="relative">
                    <select className="input appearance-none pr-9" value={form.billing_day} onChange={e => setForm({ ...form, billing_day: e.target.value })}>
                      <option value="">— Selectează —</option>
                      {DAYS.map(d => <option key={d} value={d}>Ziua {d}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-tertiary pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="input-label">Sumă lunară (€)</label>
                  <input className="input" type="number" placeholder="500" value={form.monthly_amount}
                    onChange={e => setForm({ ...form, monthly_amount: e.target.value })} />
                </div>
              </div>
            </div>

            <div>
              <label className="input-label">Culoare</label>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map(c => (
                  <button key={c} onClick={() => setForm({ ...form, color: c })} style={{ background: c }}
                    className={`w-8 h-8 rounded-full transition-all ${form.color === c ? 'ring-2 ring-offset-2 ring-ios-blue scale-110' : ''}`} />
                ))}
              </div>
            </div>
            <div><label className="input-label">Status</label>
              <div className="flex gap-2">
                {[['active','Activ'],['archived','Arhivat']].map(([k,v]) => (
                  <button key={k} onClick={() => setForm({ ...form, status: k })}
                    className={`flex-1 py-2 rounded-ios text-footnote font-semibold transition-all ${form.status === k ? 'bg-ios-blue text-white' : 'bg-ios-fill text-ios-secondary'}`}>{v}</button>
                ))}
              </div>
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

      {/* Invoices modal */}
      {invoiceModal && selected && (
        <Modal title={`Facturi — ${selected.name}`} onClose={() => setInvoiceModal(false)} size="lg">
          <div className="space-y-5">
            {selected.monthly_amount && (
              <div className="bg-blue-50 rounded-ios p-3">
                <p className="text-footnote text-ios-blue">
                  Sumă lunară setată: <span className="font-bold">{fmtCurrency(selected.monthly_amount)}</span>
                  {selected.billing_day && ` · Facturare ziua ${selected.billing_day}`}
                </p>
              </div>
            )}
            <div className="bg-green-50 rounded-ios-lg p-4">
              <p className="text-subhead font-semibold text-ios-green mb-3">Adaugă factură lunară</p>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="input-label">Lună</label>
                  <div className="relative">
                    <select className="input appearance-none pr-8" value={invForm.month} onChange={e => setInvForm({ ...invForm, month: e.target.value })}>
                      {MONTHS_FULL.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ios-tertiary pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="input-label">An</label>
                  <div className="relative">
                    <select className="input appearance-none pr-8" value={invForm.year} onChange={e => setInvForm({ ...invForm, year: e.target.value })}>
                      {years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ios-tertiary pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="input-label">Sumă (€)</label>
                  <input className="input" type="number" placeholder={selected.monthly_amount || "300"}
                    value={invForm.amount} onChange={e => setInvForm({ ...invForm, amount: e.target.value })} />
                </div>
              </div>
              {selected.monthly_amount && !invForm.amount && (
                <button onClick={() => setInvForm({ ...invForm, amount: selected.monthly_amount })}
                  className="text-footnote text-ios-blue mt-2 hover:underline">
                  Folosește suma lunară ({fmtCurrency(selected.monthly_amount)})
                </button>
              )}
              <button onClick={addInvoice} disabled={loading || !invForm.amount} className="btn-primary w-full mt-3">
                {loading ? 'Se salvează...' : 'Adaugă'}
              </button>
            </div>

            <div>
              <p className="text-subhead font-semibold text-ios-primary mb-2">Istoric ({invoices.length} facturi)</p>
              {invoices.length === 0 ? (
                <p className="text-footnote text-ios-tertiary text-center py-4">Nicio factură înregistrată</p>
              ) : (
                <div className="space-y-1.5">
                  {invoices.map(inv => (
                    <div key={inv.id} className="flex items-center justify-between p-3 bg-ios-bg rounded-ios">
                      <p className="text-subhead font-semibold text-ios-primary">{MONTHS_FULL[inv.month-1]} {inv.year}</p>
                      <div className="flex items-center gap-3">
                        <p className="text-subhead font-bold text-ios-green">{fmtCurrency(inv.amount)}</p>
                        <button onClick={() => delInvoice(inv.id)} className="p-1.5 hover:bg-red-50 rounded-ios text-ios-tertiary hover:text-ios-red transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
