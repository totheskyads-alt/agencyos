'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/Modal';
import { fmtCurrency, fmtDate, parseUTC } from '@/lib/utils';
import { Plus, Search, AlertCircle, CheckCircle, Clock, FileText, Euro, ChevronDown, Trash2 } from 'lucide-react';

const STATUS = {
  draft:   { label: 'Schiță',   color: 'badge-gray',   icon: FileText },
  sent:    { label: 'Trimisă',  color: 'badge-blue',   icon: Clock },
  paid:    { label: 'Plătită',  color: 'badge-green',  icon: CheckCircle },
  overdue: { label: 'Restantă', color: 'badge-red',    icon: AlertCircle },
  partial: { label: 'Parțial',  color: 'badge-orange', icon: Clock },
};

const CLIENT_TYPES = {
  direct:      { label: 'Clienți direcți',  color: 'badge-blue' },
  whitelabel:  { label: 'White-label',      color: 'badge-purple' },
  colaborator: { label: 'Colaboratori',     color: 'badge-orange' },
};

const MONTHS_FULL = ['Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie','Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie'];

const RANGES = [
  { key: '7days',  label: 'Ultimele 7 zile' },
  { key: '14days', label: 'Ultimele 14 zile' },
  { key: '30days', label: 'Ultimele 30 zile', default: true },
  { key: '3months',label: 'Ultimele 3 luni' },
  { key: '1year',  label: 'Ultimul an' },
  { key: 'all',    label: 'Toate' },
];

const empty = {
  client_id: '', invoice_number: '', amount: '', month: new Date().getMonth() + 1,
  year: new Date().getFullYear(), issue_date: '', due_date: '', paid_date: '',
  status: 'draft', notes: '',
};

function LineChart({ data, color = '#007AFF', formatVal }) {
  const pts = data.filter(d => d.value > 0);
  if (pts.length < 2) return <div className="flex items-center justify-center h-20 text-ios-tertiary text-footnote">Date insuficiente</div>;
  const values = data.map(d => d.value);
  const max = Math.max(...values, 1);
  const W = 400, H = 80, PAD = 18;
  const points = data.map((d, i) => ({
    x: PAD + (i / (data.length - 1)) * (W - PAD * 2),
    y: d.value > 0 ? PAD + ((max - d.value) / max) * (H - PAD * 2) : H,
    ...d,
  }));
  const pathD = points.filter(p => p.value > 0).map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full" style={{ minWidth: 200 }}>
        {[0, 1].map(t => <line key={t} x1={PAD} x2={W-PAD} y1={PAD+t*(H-PAD*2)} y2={PAD+t*(H-PAD*2)} stroke="#F2F2F7" strokeWidth="1" />)}
        <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => p.value > 0 && (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="3.5" fill="white" stroke={color} strokeWidth="2" />
            <text x={p.x} y={p.y - 7} textAnchor="middle" fontSize="8" fill={color} fontWeight="700">{formatVal ? formatVal(p.value) : p.value}</text>
            <text x={p.x} y={H + 13} textAnchor="middle" fontSize="8" fill="#AEAEB2">{p.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export default function BillingPage() {
  const [bills, setBills] = useState([]);
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterClient, setFilterClient] = useState('');
  const [range, setRange] = useState('30days');
  const [tab, setTab] = useState('all');
  const [modal, setModal] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(empty);
  const [loading, setLoading] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    const [{ data: b }, { data: c }] = await Promise.all([
      supabase.from('billing').select('*, clients(name, company, client_type)').order('year', { ascending: false }).order('month', { ascending: false }),
      supabase.from('clients').select('id, name, company, client_type').order('name'),
    ]);
    setBills((b || []).map(bill => ({
      ...bill,
      status: bill.status !== 'paid' && bill.due_date && parseUTC(bill.due_date) < new Date() ? 'overdue' : bill.status,
    })));
    setClients(c || []);
  }

  function getFilteredBills() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let from = null;
    switch (range) {
      case '7days':   from = new Date(today.getTime() - 6*86400000); break;
      case '14days':  from = new Date(today.getTime() - 13*86400000); break;
      case '30days':  from = new Date(today.getTime() - 29*86400000); break;
      case '3months': from = new Date(now.getFullYear(), now.getMonth() - 2, 1); break;
      case '1year':   from = new Date(now.getFullYear() - 1, now.getMonth(), 1); break;
    }

    return bills.filter(b => {
      if (from && b.created_at && parseUTC(b.created_at) < from) return false;
      if (tab === 'unpaid' && b.status === 'paid') return false;
      if (tab === 'overdue' && b.status !== 'overdue') return false;
      if (tab === 'paid' && b.status !== 'paid') return false;
      if (filterType && b.clients?.client_type !== filterType) return false;
      if (filterClient && b.client_id !== filterClient) return false;
      if (search && !b.clients?.name?.toLowerCase().includes(search.toLowerCase()) && !b.invoice_number?.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }

  const filtered = getFilteredBills();

  // Monthly chart data
  const MONTHS = ['Ian','Feb','Mar','Apr','Mai','Iun','Iul','Aug','Sep','Oct','Nov','Dec'];
  const now = new Date();
  const last6months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5-i), 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1, label: MONTHS[d.getMonth()] };
  });
  const monthlyChartData = last6months.map(m => ({
    label: m.label,
    value: bills.filter(b => b.status === 'paid' && b.month === m.month && b.year === m.year).reduce((a, b) => a + (b.amount || 0), 0),
  }));

  // Stats
  const totalBilled = filtered.reduce((a, b) => a + (b.amount || 0), 0);
  const totalPaid = filtered.filter(b => b.status === 'paid').reduce((a, b) => a + (b.amount || 0), 0);
  const totalUnpaid = filtered.filter(b => b.status !== 'paid').reduce((a, b) => a + (b.amount || 0), 0);
  const totalOverdue = filtered.filter(b => b.status === 'overdue').reduce((a, b) => a + (b.amount || 0), 0);

  // Group by type
  const byType = {};
  filtered.forEach(b => {
    const t = b.clients?.client_type || 'direct';
    if (!byType[t]) byType[t] = { bills: [], total: 0, paid: 0 };
    byType[t].bills.push(b);
    byType[t].total += (b.amount || 0);
    if (b.status === 'paid') byType[t].paid += (b.amount || 0);
  });

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
      ...form, amount: parseFloat(form.amount) || 0,
      month: parseInt(form.month), year: parseInt(form.year),
      client_id: form.client_id || null, issue_date: form.issue_date || null,
      due_date: form.due_date || null, paid_date: form.paid_date || null,
      invoice_number: form.invoice_number || null,
    };
    if (selected) await supabase.from('billing').update(payload).eq('id', selected.id);
    else await supabase.from('billing').insert(payload);
    setModal(false); setLoading(false); load();
  }

  async function quickPaid(id) {
    await supabase.from('billing').update({ status: 'paid', paid_date: new Date().toISOString().split('T')[0] }).eq('id', id);
    load();
  }

  async function del(id) {
    if (!confirm('Ștergi factura?')) return;
    await supabase.from('billing').delete().eq('id', id);
    setModal(false); load();
  }

  const years = Array.from({ length: 3 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-title2 font-bold text-ios-primary">Facturare</h1>
          <p className="text-subhead text-ios-secondary">{bills.length} facturi totale</p>
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
            <p className="text-subhead font-semibold text-ios-red">
              {filtered.filter(b => b.status === 'overdue').length} facturi restante — {fmtCurrency(totalOverdue)}
            </p>
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total facturat', value: fmtCurrency(totalBilled), color: 'text-ios-blue bg-blue-50', icon: Euro },
          { label: 'Încasat', value: fmtCurrency(totalPaid), color: 'text-ios-green bg-green-50', icon: CheckCircle },
          { label: 'De încasat', value: fmtCurrency(totalUnpaid), color: 'text-ios-orange bg-orange-50', icon: Clock },
          { label: 'Restante', value: fmtCurrency(totalOverdue), color: 'text-ios-red bg-red-50', icon: AlertCircle },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className="card p-4">
            <div className={`w-9 h-9 rounded-ios flex items-center justify-center mb-3 ${color}`}><Icon className="w-4 h-4" /></div>
            <p className="text-title3 font-bold text-ios-primary">{value}</p>
            <p className="text-footnote text-ios-secondary">{label}</p>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="card p-4">
        <p className="text-headline font-semibold mb-1">Evoluție încasări (ultimele 6 luni)</p>
        <LineChart data={monthlyChartData} color="#34C759" formatVal={v => v > 0 ? `€${v}` : ''} />
      </div>

      {/* By type sections */}
      <div className="grid lg:grid-cols-3 gap-3">
        {Object.entries(CLIENT_TYPES).map(([typeKey, typeInfo]) => {
          const d = byType[typeKey] || { total: 0, paid: 0, bills: [] };
          return (
            <div key={typeKey} className="card p-4">
              <span className={`badge ${typeInfo.color} mb-3`}>{typeInfo.label}</span>
              <p className="text-title3 font-bold text-ios-primary mt-2">{fmtCurrency(d.total)}</p>
              <p className="text-footnote text-ios-secondary">Total · {d.bills.length} facturi</p>
              <div className="mt-2 pt-2 border-t border-ios-separator/50">
                <p className="text-footnote text-ios-green font-semibold">{fmtCurrency(d.paid)} încasat</p>
                {d.total - d.paid > 0 && <p className="text-footnote text-ios-orange">{fmtCurrency(d.total - d.paid)} de încasat</p>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="card p-4 space-y-3">
        <div className="flex gap-1.5 flex-wrap">
          {RANGES.map(r => (
            <button key={r.key} onClick={() => setRange(r.key)}
              className={`px-3 py-1.5 rounded-ios text-footnote font-semibold transition-all whitespace-nowrap ${range === r.key ? 'bg-ios-blue text-white' : 'bg-ios-fill text-ios-secondary'}`}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="flex gap-0.5 bg-ios-fill p-1 rounded-ios overflow-x-auto">
          {[['all','Toate'],['unpaid','Neplatite'],['overdue','Restante'],['paid','Platite']].map(([k,v]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`flex-1 py-1.5 rounded-ios-sm text-footnote font-semibold whitespace-nowrap ${tab === k ? 'bg-white text-ios-primary shadow-ios-sm' : 'text-ios-secondary'}`}>{v}</button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-tertiary" />
            <input className="input pl-9" placeholder="Caută..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="relative">
            <select className="input appearance-none pr-8 py-2 text-footnote w-40" value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option value="">Toate tipurile</option>
              {Object.entries(CLIENT_TYPES).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ios-tertiary pointer-events-none" />
          </div>
          <div className="relative">
            <select className="input appearance-none pr-8 py-2 text-footnote w-40" value={filterClient} onChange={e => setFilterClient(e.target.value)}>
              <option value="">Toți clienții</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ios-tertiary pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Bills list */}
      {filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <FileText className="w-8 h-8 text-ios-label4 mx-auto mb-3" />
          <p className="text-subhead text-ios-secondary mb-4">Nicio factură în perioada selectată</p>
          <button onClick={openAdd} className="btn-primary">Factură nouă</button>
        </div>
      ) : (
        <div className="card">
          {filtered.map(b => {
            const st = STATUS[b.status] || STATUS.draft;
            const Icon = st.icon;
            const ct = CLIENT_TYPES[b.clients?.client_type];
            return (
              <div key={b.id} className={`list-row hover:bg-ios-bg cursor-pointer ${b.status === 'overdue' ? 'border-l-2 border-ios-red' : ''}`}
                onClick={() => openEdit(b)}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-subhead font-semibold text-ios-primary">{b.clients?.name || '—'}</p>
                    {b.invoice_number && <span className="text-caption1 text-ios-tertiary">#{b.invoice_number}</span>}
                    <span className={`badge ${st.color}`}><Icon className="w-2.5 h-2.5 mr-1 inline" />{st.label}</span>
                    {ct && <span className={`badge ${ct.color}`}>{ct.label}</span>}
                  </div>
                  <div className="flex gap-3 mt-0.5 flex-wrap">
                    <span className="text-footnote text-ios-secondary">{MONTHS_FULL[(b.month||1)-1]} {b.year}</span>
                    {b.due_date && <span className={`text-footnote ${b.status === 'overdue' ? 'text-ios-red font-semibold' : 'text-ios-secondary'}`}>Scadent: {fmtDate(b.due_date)}</span>}
                    {b.paid_date && <span className="text-footnote text-ios-green">Plătit: {fmtDate(b.paid_date)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                  <p className="text-subhead font-bold text-ios-primary">{fmtCurrency(b.amount)}</p>
                  {b.status !== 'paid' && (
                    <button onClick={() => quickPaid(b.id)}
                      className="px-2.5 py-1.5 bg-green-50 text-ios-green rounded-ios text-caption1 font-semibold hover:bg-green-100 whitespace-nowrap">
                      ✓ Plătit
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <Modal title={selected ? 'Editează factură' : 'Factură nouă'} onClose={() => setModal(false)} size="lg">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="input-label">Client *</label>
                <select className="input" value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })}>
                  <option value="">— Selectează client —</option>
                  {Object.entries(CLIENT_TYPES).map(([typeKey, typeInfo]) => {
                    const typeClients = clients.filter(c => (c.client_type || 'direct') === typeKey);
                    if (typeClients.length === 0) return null;
                    return (
                      <optgroup key={typeKey} label={typeInfo.label}>
                        {typeClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </optgroup>
                    );
                  })}
                </select>
              </div>
              <div>
                <label className="input-label">Nr. factură</label>
                <input className="input" placeholder="2025-001" value={form.invoice_number} onChange={e => setForm({ ...form, invoice_number: e.target.value })} />
              </div>
              <div>
                <label className="input-label">Sumă (€) *</label>
                <input className="input" type="number" placeholder="500" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
              </div>
              <div>
                <label className="input-label">Luna referință</label>
                <select className="input" value={form.month} onChange={e => setForm({ ...form, month: e.target.value })}>
                  {MONTHS_FULL.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
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
              {selected && <button className="btn-danger" onClick={() => del(selected.id)}><Trash2 className="w-4 h-4" /></button>}
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
