'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/Modal';
import { fmtCurrency, fmtDate, parseUTC } from '@/lib/utils';
import { Plus, Search, ChevronRight, AlertCircle, CheckCircle, Clock, FileText, Euro, TrendingUp, ChevronDown } from 'lucide-react';

const STATUS = {
  draft:    { label: 'Schiță',    color: 'badge-gray',   icon: FileText },
  sent:     { label: 'Trimisă',  color: 'badge-blue',   icon: Clock },
  paid:     { label: 'Plătită',  color: 'badge-green',  icon: CheckCircle },
  overdue:  { label: 'Restantă', color: 'badge-red',    icon: AlertCircle },
  partial:  { label: 'Parțial',  color: 'badge-orange', icon: Clock },
};

const MONTHS = ['Ian','Feb','Mar','Apr','Mai','Iun','Iul','Aug','Sep','Oct','Nov','Dec'];

const empty = {
  client_id: '', invoice_number: '', amount: '', month: new Date().getMonth() + 1,
  year: new Date().getFullYear(), issue_date: '', due_date: '', paid_date: '',
  status: 'draft', notes: '',
};

function isOverdue(bill) {
  if (bill.status === 'paid') return false;
  if (!bill.due_date) return false;
  return parseUTC(bill.due_date) < new Date();
}

export default function BillingPage() {
  const [bills, setBills] = useState([]);
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterClient, setFilterClient] = useState('');
  const [modal, setModal] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(empty);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('all'); // all | unpaid | overdue | paid

  useEffect(() => { load(); }, []);

  async function load() {
    const [{ data: b }, { data: c }] = await Promise.all([
      supabase.from('billing').select('*, clients(name, company)').order('created_at', { ascending: false }),
      supabase.from('clients').select('id, name, company').order('name'),
    ]);
    // Auto-mark overdue
    const updated = (b || []).map(bill => ({
      ...bill,
      status: isOverdue(bill) && bill.status !== 'paid' ? 'overdue' : bill.status,
    }));
    setBills(updated);
    setClients(c || []);
  }

  function openAdd() { setForm(empty); setSelected(null); setModal(true); }
  function openEdit(b) {
    setForm({
      client_id: b.client_id || '', invoice_number: b.invoice_number || '',
      amount: b.amount || '', month: b.month || new Date().getMonth() + 1,
      year: b.year || new Date().getFullYear(),
      issue_date: b.issue_date || '', due_date: b.due_date || '',
      paid_date: b.paid_date || '', status: b.status || 'draft', notes: b.notes || '',
    });
    setSelected(b); setModal(true);
  }

  async function save() {
    setLoading(true);
    const payload = {
      ...form,
      amount: parseFloat(form.amount) || 0,
      month: parseInt(form.month),
      year: parseInt(form.year),
      client_id: form.client_id || null,
      issue_date: form.issue_date || null,
      due_date: form.due_date || null,
      paid_date: form.paid_date || null,
      invoice_number: form.invoice_number || null,
    };
    if (selected) await supabase.from('billing').update(payload).eq('id', selected.id);
    else await supabase.from('billing').insert(payload);
    setModal(false); setLoading(false); load();
  }

  async function quickStatus(id, status) {
    const update = { status };
    if (status === 'paid' && !bills.find(b => b.id === id)?.paid_date) {
      update.paid_date = new Date().toISOString().split('T')[0];
    }
    await supabase.from('billing').update(update).eq('id', id);
    load();
  }

  async function del(id) {
    if (!confirm('Ștergi factura?')) return;
    await supabase.from('billing').delete().eq('id', id);
    setModal(false); load();
  }

  // Filter
  let filtered = bills;
  if (tab === 'unpaid') filtered = filtered.filter(b => b.status !== 'paid');
  if (tab === 'overdue') filtered = filtered.filter(b => b.status === 'overdue');
  if (tab === 'paid') filtered = filtered.filter(b => b.status === 'paid');
  if (filterClient) filtered = filtered.filter(b => b.client_id === filterClient);
  if (search) filtered = filtered.filter(b =>
    b.clients?.name?.toLowerCase().includes(search.toLowerCase()) ||
    b.invoice_number?.toLowerCase().includes(search.toLowerCase())
  );

  // Stats
  const totalBilled = bills.reduce((a, b) => a + (b.amount || 0), 0);
  const totalPaid = bills.filter(b => b.status === 'paid').reduce((a, b) => a + (b.amount || 0), 0);
  const totalUnpaid = bills.filter(b => b.status !== 'paid').reduce((a, b) => a + (b.amount || 0), 0);
  const totalOverdue = bills.filter(b => b.status === 'overdue').reduce((a, b) => a + (b.amount || 0), 0);

  // Per client summary
  const byClient = {};
  bills.forEach(b => {
    const k = b.client_id;
    if (!k) return;
    if (!byClient[k]) byClient[k] = { name: b.clients?.name || '—', total: 0, paid: 0, unpaid: 0, overdue: 0, lastPaid: null };
    byClient[k].total += (b.amount || 0);
    if (b.status === 'paid') {
      byClient[k].paid += (b.amount || 0);
      if (!byClient[k].lastPaid || b.paid_date > byClient[k].lastPaid) byClient[k].lastPaid = b.paid_date;
    } else {
      byClient[k].unpaid += (b.amount || 0);
      if (b.status === 'overdue') byClient[k].overdue += (b.amount || 0);
    }
  });

  const years = [];
  for (let y = new Date().getFullYear(); y >= new Date().getFullYear() - 2; y--) years.push(y);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-title2 font-bold text-ios-primary">Facturare</h1>
          <p className="text-subhead text-ios-secondary">{bills.length} facturi</p>
        </div>
        <button onClick={openAdd} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" strokeWidth={2.5} /> Factură nouă
        </button>
      </div>

      {/* Overdue alert */}
      {totalOverdue > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-ios-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-ios-red shrink-0" />
          <div>
            <p className="text-subhead font-semibold text-ios-red">Facturi restante!</p>
            <p className="text-footnote text-ios-red/80">
              {bills.filter(b => b.status === 'overdue').length} facturi restante în valoare de {fmtCurrency(totalOverdue)}
            </p>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total facturat', value: fmtCurrency(totalBilled), color: 'text-ios-blue bg-blue-50', icon: Euro },
          { label: 'Încasat', value: fmtCurrency(totalPaid), color: 'text-ios-green bg-green-50', icon: CheckCircle },
          { label: 'De încasat', value: fmtCurrency(totalUnpaid), color: 'text-ios-orange bg-orange-50', icon: Clock },
          { label: 'Restante', value: fmtCurrency(totalOverdue), color: 'text-ios-red bg-red-50', icon: AlertCircle },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className="card p-4">
            <div className={`w-9 h-9 rounded-ios flex items-center justify-center mb-3 ${color}`}>
              <Icon className="w-4 h-4" />
            </div>
            <p className="text-title3 font-bold text-ios-primary">{value}</p>
            <p className="text-footnote text-ios-secondary">{label}</p>
          </div>
        ))}
      </div>

      {/* Per client summary */}
      {Object.keys(byClient).length > 0 && (
        <div className="card p-4">
          <p className="text-headline font-semibold text-ios-primary mb-3">Situație per client</p>
          <div className="space-y-2">
            {Object.entries(byClient).sort((a,b) => b[1].unpaid - a[1].unpaid).map(([id, c]) => (
              <div key={id} className="flex items-center justify-between p-3 bg-ios-bg rounded-ios">
                <div>
                  <p className="text-subhead font-semibold text-ios-primary">{c.name}</p>
                  <div className="flex gap-3 mt-0.5">
                    <span className="text-caption1 text-ios-secondary">Total: <span className="font-semibold">{fmtCurrency(c.total)}</span></span>
                    {c.lastPaid && <span className="text-caption1 text-ios-secondary">Ultima plată: <span className="font-semibold">{MONTHS[new Date(c.lastPaid).getMonth()]} {new Date(c.lastPaid).getFullYear()}</span></span>}
                  </div>
                </div>
                <div className="text-right">
                  {c.unpaid > 0 ? (
                    <p className="text-subhead font-bold text-ios-orange">{fmtCurrency(c.unpaid)}</p>
                  ) : (
                    <p className="text-subhead font-bold text-ios-green">✓ La zi</p>
                  )}
                  {c.overdue > 0 && <p className="text-caption1 text-ios-red font-semibold">{fmtCurrency(c.overdue)} restant</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-0.5 bg-ios-fill p-1 rounded-ios">
        {[['all','Toate'],['unpaid','Neplatite'],['overdue','Restante'],['paid','Platite']].map(([k,v]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex-1 py-2 rounded-ios-sm text-footnote font-semibold transition-all whitespace-nowrap ${tab === k ? 'bg-white text-ios-primary shadow-ios-sm' : 'text-ios-secondary'}`}>{v}
          </button>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-tertiary" />
          <input className="input pl-10" placeholder="Caută client, nr. factură..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="relative">
          <select className="input appearance-none pr-8 py-2 text-footnote w-44" value={filterClient} onChange={e => setFilterClient(e.target.value)}>
            <option value="">Toți clienții</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ios-tertiary pointer-events-none" />
        </div>
      </div>

      {/* Bills list */}
      {filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <FileText className="w-8 h-8 text-ios-label4 mx-auto mb-3" />
          <p className="text-headline font-semibold text-ios-secondary mb-1">Nicio factură</p>
          <p className="text-subhead text-ios-tertiary mb-4">Adaugă prima factură</p>
          <button onClick={openAdd} className="btn-primary">Factură nouă</button>
        </div>
      ) : (
        <div className="card">
          {filtered.map(b => {
            const st = STATUS[b.status] || STATUS.draft;
            const Icon = st.icon;
            const overdue = b.status === 'overdue';
            return (
              <div key={b.id} className={`list-row hover:bg-ios-bg transition-colors ${overdue ? 'border-l-2 border-ios-red' : ''}`}>
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openEdit(b)}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-subhead font-semibold text-ios-primary">{b.clients?.name || 'Fără client'}</p>
                    {b.invoice_number && <span className="text-caption1 text-ios-tertiary">#{b.invoice_number}</span>}
                    <span className={`badge ${st.color}`}><Icon className="w-2.5 h-2.5 mr-1 inline" />{st.label}</span>
                  </div>
                  <div className="flex gap-3 mt-0.5 flex-wrap">
                    <span className="text-footnote text-ios-secondary">{MONTHS[(b.month||1)-1]} {b.year}</span>
                    {b.due_date && <span className={`text-footnote ${overdue ? 'text-ios-red font-semibold' : 'text-ios-secondary'}`}>Scadent: {fmtDate(b.due_date)}</span>}
                    {b.paid_date && <span className="text-footnote text-ios-green">Plătit: {fmtDate(b.paid_date)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <p className="text-subhead font-bold text-ios-primary">{fmtCurrency(b.amount)}</p>
                  {b.status !== 'paid' && (
                    <button onClick={() => quickStatus(b.id, 'paid')}
                      className="px-2.5 py-1.5 bg-green-50 text-ios-green rounded-ios text-caption1 font-semibold hover:bg-green-100 transition-colors whitespace-nowrap">
                      ✓ Plătit
                    </button>
                  )}
                  <ChevronRight className="w-4 h-4 text-ios-tertiary" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      {modal && (
        <Modal title={selected ? 'Editează factură' : 'Factură nouă'} onClose={() => setModal(false)} size="lg">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="input-label">Client *</label>
                <select className="input" value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })}>
                  <option value="">— Selectează client —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="input-label">Nr. factură</label>
                <input className="input" placeholder="ex: 2025-001" value={form.invoice_number} onChange={e => setForm({ ...form, invoice_number: e.target.value })} />
              </div>
              <div>
                <label className="input-label">Sumă (€) *</label>
                <input className="input" type="number" placeholder="500" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
              </div>
              <div>
                <label className="input-label">Luna de referință</label>
                <select className="input" value={form.month} onChange={e => setForm({ ...form, month: e.target.value })}>
                  {['Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie','Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie'].map((m, i) => (
                    <option key={i} value={i+1}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="input-label">An</label>
                <select className="input" value={form.year} onChange={e => setForm({ ...form, year: e.target.value })}>
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div>
                <label className="input-label">Data emiterii</label>
                <input className="input" type="date" value={form.issue_date} onChange={e => setForm({ ...form, issue_date: e.target.value })} />
              </div>
              <div>
                <label className="input-label">Data scadenței</label>
                <input className="input" type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
              </div>
              <div className="col-span-2">
                <label className="input-label">Status</label>
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(STATUS).map(([k, v]) => (
                    <button key={k} onClick={() => setForm({ ...form, status: k, paid_date: k === 'paid' && !form.paid_date ? new Date().toISOString().split('T')[0] : form.paid_date })}
                      className={`px-3 py-1.5 rounded-ios text-footnote font-semibold transition-all ${form.status === k ? 'bg-ios-blue text-white' : 'bg-ios-fill text-ios-secondary'}`}>
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>
              {form.status === 'paid' && (
                <div className="col-span-2">
                  <label className="input-label">Data plății</label>
                  <input className="input" type="date" value={form.paid_date} onChange={e => setForm({ ...form, paid_date: e.target.value })} />
                </div>
              )}
              <div className="col-span-2">
                <label className="input-label">Note</label>
                <textarea className="input" rows={2} placeholder="Observații..." value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              {selected && <button className="btn-danger" onClick={() => del(selected.id)}>Șterge</button>}
              <button className="btn-secondary flex-1" onClick={() => setModal(false)}>Anulează</button>
              <button className="btn-primary flex-1" onClick={save} disabled={loading || !form.amount || !form.client_id}>
                {loading ? 'Se salvează...' : 'Salvează'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
