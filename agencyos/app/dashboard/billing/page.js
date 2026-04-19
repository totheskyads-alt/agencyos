'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/Modal';
import { fmtCurrency, fmtDate, parseUTC } from '@/lib/utils';
import { Plus, Search, AlertCircle, CheckCircle, Clock, FileText, Euro, ChevronDown, Trash2, TrendingDown } from 'lucide-react';

const INVOICE_STATUS = {
  draft:   { label: 'Draft',    color: 'badge-gray',   icon: FileText },
  sent:    { label: 'Sent',     color: 'badge-blue',   icon: Clock },
  paid:    { label: 'Paid',     color: 'badge-green',  icon: CheckCircle },
  overdue: { label: 'Overdue',  color: 'badge-red',    icon: AlertCircle },
  partial: { label: 'Partial',  color: 'badge-orange', icon: Clock },
};

const EXPENSE_CATEGORIES = [
  'Salaries', 'Taxes', 'Software & Tools', 'Advertising', 'Office', 'Freelancers', 'Other'
];

const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const CLIENT_TYPES = {
  direct:      { label: 'Direct',      color: 'badge-blue' },
  whitelabel:  { label: 'White-label', color: 'badge-purple' },
  colaborator: { label: 'Collaborator',color: 'badge-orange' },
};

const RANGES = [
  { key: '7days',  label: 'Last 7 days' },
  { key: '14days', label: 'Last 14 days' },
  { key: '30days', label: 'Last 30 days', default: true },
  { key: '3months',label: 'Last 3 months' },
  { key: '1year',  label: 'This year' },
  { key: 'all',    label: 'All time' },
];

const emptyInv = { client_id:'', invoice_number:'', amount:'', month: new Date().getMonth()+1, year: new Date().getFullYear(), issue_date:'', due_date:'', paid_date:'', status:'draft', notes:'' };
const emptyExp = { category:'Salaries', description:'', amount:'', month: new Date().getMonth()+1, year: new Date().getFullYear(), date:'' };

export default function BillingPage() {
  const [bills, setBills] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [range, setRange] = useState('30days');
  const [mainTab, setMainTab] = useState('invoices'); // invoices | expenses | overview
  const [statusTab, setStatusTab] = useState('all');
  const [invModal, setInvModal] = useState(false);
  const [expModal, setExpModal] = useState(false);
  const [selectedInv, setSelectedInv] = useState(null);
  const [selectedExp, setSelectedExp] = useState(null);
  const [invForm, setInvForm] = useState(emptyInv);
  const [expForm, setExpForm] = useState(emptyExp);
  const [loading, setLoading] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    const [{ data: b }, { data: c }, { data: e }] = await Promise.all([
      supabase.from('billing').select('*, clients(name,company,client_type)').order('year',{ascending:false}).order('month',{ascending:false}),
      supabase.from('clients').select('id,name,company,client_type').order('name'),
      supabase.from('expenses').select('*').order('year',{ascending:false}).order('month',{ascending:false}).limit(200),
    ]);
    setBills((b||[]).map(bill => ({
      ...bill,
      status: bill.status!=='paid' && bill.due_date && parseUTC(bill.due_date) < new Date() ? 'overdue' : bill.status,
    })));
    setClients(c||[]);
    setExpenses(e||[]);
  }

  function getFilteredBills() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let from = null;
    switch (range) {
      case '7days':   from = new Date(today.getTime()-6*86400000); break;
      case '14days':  from = new Date(today.getTime()-13*86400000); break;
      case '30days':  from = new Date(today.getTime()-29*86400000); break;
      case '3months': from = new Date(now.getFullYear(), now.getMonth()-2, 1); break;
      case '1year':   from = new Date(now.getFullYear(), 0, 1); break;
    }
    return bills.filter(b => {
      if (from && b.created_at && parseUTC(b.created_at) < from) return false;
      if (statusTab==='unpaid' && b.status==='paid') return false;
      if (statusTab==='overdue' && b.status!=='overdue') return false;
      if (statusTab==='paid' && b.status!=='paid') return false;
      if (filterType && b.clients?.client_type!==filterType) return false;
      if (search && !b.clients?.name?.toLowerCase().includes(search.toLowerCase()) && !b.invoice_number?.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }

  function getFilteredExpenses() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let from = null;
    switch (range) {
      case '7days':   from = new Date(today.getTime()-6*86400000); break;
      case '14days':  from = new Date(today.getTime()-13*86400000); break;
      case '30days':  from = new Date(today.getTime()-29*86400000); break;
      case '3months': from = new Date(now.getFullYear(), now.getMonth()-2, 1); break;
      case '1year':   from = new Date(now.getFullYear(), 0, 1); break;
    }
    return expenses.filter(e => {
      if (from && e.date && new Date(e.date) < from) return false;
      return true;
    });
  }

  const filtered = getFilteredBills();
  const filteredExp = getFilteredExpenses();

  // Stats
  const totalBilled = filtered.reduce((a,b) => a+(b.amount||0), 0);
  const totalPaid = filtered.filter(b => b.status==='paid').reduce((a,b) => a+(b.amount||0), 0);
  const totalUnpaid = filtered.filter(b => b.status!=='paid').reduce((a,b) => a+(b.amount||0), 0);
  const totalOverdue = filtered.filter(b => b.status==='overdue').reduce((a,b) => a+(b.amount||0), 0);
  const totalExpenses = filteredExp.reduce((a,e) => a+(e.amount||0), 0);
  const netProfit = totalPaid - totalExpenses;

  // Expenses by category
  const expByCategory = filteredExp.reduce((acc, e) => {
    acc[e.category] = (acc[e.category]||0)+(e.amount||0);
    return acc;
  }, {});

  async function saveInvoice() {
    setLoading(true);
    const payload = { ...invForm, amount: parseFloat(invForm.amount)||0, month: parseInt(invForm.month), year: parseInt(invForm.year), client_id: invForm.client_id||null, issue_date: invForm.issue_date||null, due_date: invForm.due_date||null, paid_date: invForm.paid_date||null, invoice_number: invForm.invoice_number||null };
    if (selectedInv) await supabase.from('billing').update(payload).eq('id', selectedInv.id);
    else await supabase.from('billing').insert(payload);
    setInvModal(false); setLoading(false); load();
  }

  async function saveExpense() {
    setLoading(true);
    const payload = { ...expForm, amount: parseFloat(expForm.amount)||0, month: parseInt(expForm.month), year: parseInt(expForm.year), date: expForm.date||null };
    if (selectedExp) await supabase.from('expenses').update(payload).eq('id', selectedExp.id);
    else await supabase.from('expenses').insert(payload);
    setExpModal(false); setLoading(false); load();
  }

  async function quickPaid(id) {
    await supabase.from('billing').update({ status:'paid', paid_date: new Date().toISOString().split('T')[0] }).eq('id', id);
    load();
  }

  async function delInvoice(id) {
    if (!confirm('Delete invoice?')) return;
    await supabase.from('billing').delete().eq('id', id);
    setInvModal(false); load();
  }

  async function delExpense(id) {
    if (!confirm('Delete expense?')) return;
    await supabase.from('expenses').delete().eq('id', id);
    setExpModal(false); load();
  }

  function openEditInv(b) {
    setInvForm({ client_id: b.client_id||'', invoice_number: b.invoice_number||'', amount: b.amount||'', month: b.month||new Date().getMonth()+1, year: b.year||new Date().getFullYear(), issue_date: b.issue_date||'', due_date: b.due_date||'', paid_date: b.paid_date||'', status: b.status||'draft', notes: b.notes||'' });
    setSelectedInv(b); setInvModal(true);
  }

  function openEditExp(e) {
    setExpForm({ category: e.category||'Salaries', description: e.description||'', amount: e.amount||'', month: e.month||new Date().getMonth()+1, year: e.year||new Date().getFullYear(), date: e.date||'' });
    setSelectedExp(e); setExpModal(true);
  }

  const years = Array.from({length:3},(_,i)=>new Date().getFullYear()-i);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-title2 font-bold text-ios-primary">Billing</h1>
          <p className="text-subhead text-ios-secondary">{bills.length} invoices · {expenses.length} expenses</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setExpForm(emptyExp); setSelectedExp(null); setExpModal(true); }} className="btn-secondary flex items-center gap-2 text-footnote">
            <TrendingDown className="w-4 h-4" /> Add Expense
          </button>
          <button onClick={() => { setInvForm(emptyInv); setSelectedInv(null); setInvModal(true); }} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" strokeWidth={2.5} /> New Invoice
          </button>
        </div>
      </div>

      {/* Overdue alert */}
      {totalOverdue > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-ios-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-ios-red shrink-0" />
          <p className="text-subhead font-semibold text-ios-red">
            {filtered.filter(b => b.status==='overdue').length} overdue invoices — {fmtCurrency(totalOverdue)}
          </p>
        </div>
      )}

      {/* Main tabs */}
      <div className="flex gap-0.5 bg-ios-fill p-1 rounded-ios">
        {[['invoices','Invoices'],['expenses','Expenses'],['overview','Overview']].map(([k,v]) => (
          <button key={k} onClick={() => setMainTab(k)}
            className={`flex-1 py-2 rounded-ios-sm text-footnote font-semibold transition-all ${mainTab===k ? 'bg-white text-ios-primary shadow-ios-sm' : 'text-ios-secondary'}`}>{v}</button>
        ))}
      </div>

      {/* Range selector */}
      <div className="flex gap-1.5 flex-wrap">
        {RANGES.map(r => (
          <button key={r.key} onClick={() => setRange(r.key)}
            className={`px-3 py-1.5 rounded-ios text-footnote font-semibold whitespace-nowrap ${range===r.key ? 'bg-ios-blue text-white' : 'bg-ios-fill text-ios-secondary'}`}>
            {r.label}
          </button>
        ))}
      </div>

      {/* INVOICES TAB */}
      {mainTab === 'invoices' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label:'Total billed', value: fmtCurrency(totalBilled), icon: Euro, color:'text-ios-blue bg-blue-50' },
              { label:'Collected', value: fmtCurrency(totalPaid), icon: CheckCircle, color:'text-ios-green bg-green-50' },
              { label:'Outstanding', value: fmtCurrency(totalUnpaid), icon: Clock, color:'text-ios-orange bg-orange-50' },
              { label:'Overdue', value: fmtCurrency(totalOverdue), icon: AlertCircle, color:'text-ios-red bg-red-50' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="card p-4">
                <div className={`w-9 h-9 rounded-ios flex items-center justify-center mb-3 ${color}`}><Icon className="w-4 h-4"/></div>
                <p className="text-title3 font-bold text-ios-primary">{value}</p>
                <p className="text-footnote text-ios-secondary">{label}</p>
              </div>
            ))}
          </div>

          <div className="flex gap-0.5 bg-ios-fill p-1 rounded-ios">
            {[['all','All'],['unpaid','Unpaid'],['overdue','Overdue'],['paid','Paid']].map(([k,v]) => (
              <button key={k} onClick={() => setStatusTab(k)}
                className={`flex-1 py-1.5 rounded-ios-sm text-footnote font-semibold ${statusTab===k ? 'bg-white text-ios-primary shadow-ios-sm' : 'text-ios-secondary'}`}>{v}</button>
            ))}
          </div>

          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-tertiary"/>
              <input className="input pl-9" placeholder="Search client, invoice #..." value={search} onChange={e => setSearch(e.target.value)}/>
            </div>
            <select className="input py-2 text-footnote w-40" value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option value="">All types</option>
              {Object.entries(CLIENT_TYPES).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>

          <div className="card">
            {filtered.length === 0 ? (
              <div className="p-12 text-center"><FileText className="w-8 h-8 text-ios-label4 mx-auto mb-3"/><p className="text-subhead text-ios-secondary mb-4">No invoices</p><button onClick={() => { setInvForm(emptyInv); setSelectedInv(null); setInvModal(true); }} className="btn-primary">New Invoice</button></div>
            ) : filtered.map(b => {
              const st = INVOICE_STATUS[b.status]||INVOICE_STATUS.draft;
              const Icon = st.icon;
              const ct = CLIENT_TYPES[b.clients?.client_type];
              return (
                <div key={b.id} onClick={() => openEditInv(b)}
                  className={`list-row hover:bg-ios-bg cursor-pointer ${b.status==='overdue' ? 'border-l-2 border-ios-red' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-subhead font-semibold">{b.clients?.name||'—'}</p>
                      {b.invoice_number && <span className="text-caption1 text-ios-tertiary">#{b.invoice_number}</span>}
                      <span className={`badge ${st.color}`}><Icon className="w-2.5 h-2.5 mr-1 inline"/>{st.label}</span>
                      {ct && <span className={`badge ${ct.color}`}>{ct.label}</span>}
                    </div>
                    <div className="flex gap-3 mt-0.5 flex-wrap">
                      <span className="text-footnote text-ios-secondary">{MONTHS_FULL[(b.month||1)-1]} {b.year}</span>
                      {b.due_date && <span className={`text-footnote ${b.status==='overdue' ? 'text-ios-red font-semibold' : 'text-ios-secondary'}`}>Due: {fmtDate(b.due_date)}</span>}
                      {b.paid_date && <span className="text-footnote text-ios-green">Paid: {fmtDate(b.paid_date)}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                    <p className="text-subhead font-bold">{fmtCurrency(b.amount)}</p>
                    {b.status!=='paid' && (
                      <button onClick={() => quickPaid(b.id)} className="px-2.5 py-1.5 bg-green-50 text-ios-green rounded-ios text-caption1 font-semibold hover:bg-green-100 whitespace-nowrap">✓ Paid</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* EXPENSES TAB */}
      {mainTab === 'expenses' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="card p-4">
              <div className="w-9 h-9 rounded-ios flex items-center justify-center mb-3 text-ios-red bg-red-50"><TrendingDown className="w-4 h-4"/></div>
              <p className="text-title3 font-bold text-ios-primary">{fmtCurrency(totalExpenses)}</p>
              <p className="text-footnote text-ios-secondary">Total expenses</p>
            </div>
            {Object.entries(expByCategory).sort((a,b) => b[1]-a[1]).slice(0,5).map(([cat, amt]) => (
              <div key={cat} className="card p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-footnote font-semibold text-ios-secondary uppercase tracking-wide">{cat}</p>
                </div>
                <p className="text-title3 font-bold text-ios-primary">{fmtCurrency(amt)}</p>
                <div className="mt-2 h-1.5 bg-ios-fill rounded-full overflow-hidden">
                  <div className="h-full bg-ios-red rounded-full" style={{ width: `${(amt/totalExpenses*100).toFixed(0)}%` }} />
                </div>
              </div>
            ))}
          </div>

          <div className="card">
            {filteredExp.length === 0 ? (
              <div className="p-12 text-center"><TrendingDown className="w-8 h-8 text-ios-label4 mx-auto mb-3"/><p className="text-subhead text-ios-secondary mb-4">No expenses</p><button onClick={() => { setExpForm(emptyExp); setSelectedExp(null); setExpModal(true); }} className="btn-primary">Add Expense</button></div>
            ) : filteredExp.map(e => (
              <div key={e.id} onClick={() => openEditExp(e)} className="list-row hover:bg-ios-bg cursor-pointer">
                <div className="w-8 h-8 bg-red-50 rounded-ios flex items-center justify-center shrink-0 mr-2">
                  <TrendingDown className="w-4 h-4 text-ios-red" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-subhead font-semibold">{e.category}</p>
                  <p className="text-footnote text-ios-secondary">{e.description||'—'} · {MONTHS_FULL[(e.month||1)-1]} {e.year}</p>
                </div>
                <p className="text-subhead font-bold text-ios-red shrink-0">{fmtCurrency(e.amount)}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {/* OVERVIEW TAB */}
      {mainTab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="card p-4 text-center">
              <p className="text-footnote text-ios-secondary mb-1">Collected</p>
              <p className="text-title3 font-bold text-ios-green">{fmtCurrency(totalPaid)}</p>
            </div>
            <div className="card p-4 text-center">
              <p className="text-footnote text-ios-secondary mb-1">Expenses</p>
              <p className="text-title3 font-bold text-ios-red">{fmtCurrency(totalExpenses)}</p>
            </div>
            <div className={`card p-4 text-center ${netProfit >= 0 ? 'border-2 border-ios-green/30' : 'border-2 border-ios-red/30'}`}>
              <p className="text-footnote text-ios-secondary mb-1">Net Profit</p>
              <p className={`text-title3 font-bold ${netProfit >= 0 ? 'text-ios-green' : 'text-ios-red'}`}>{fmtCurrency(netProfit)}</p>
            </div>
          </div>

          {/* By client type */}
          <div className="grid lg:grid-cols-3 gap-3">
            {Object.entries(CLIENT_TYPES).map(([typeKey, typeInfo]) => {
              const typeBills = filtered.filter(b => (b.clients?.client_type||'direct')===typeKey);
              const typePaid = typeBills.filter(b => b.status==='paid').reduce((a,b) => a+(b.amount||0), 0);
              const typeTotal = typeBills.reduce((a,b) => a+(b.amount||0), 0);
              return (
                <div key={typeKey} className="card p-4">
                  <span className={`badge ${typeInfo.color} mb-3`}>{typeInfo.label}</span>
                  <p className="text-title3 font-bold text-ios-primary mt-2">{fmtCurrency(typeTotal)}</p>
                  <p className="text-footnote text-ios-secondary">{typeBills.length} invoices</p>
                  <p className="text-footnote text-ios-green font-semibold mt-1">{fmtCurrency(typePaid)} collected</p>
                </div>
              );
            })}
          </div>

          {/* Expenses breakdown */}
          {Object.keys(expByCategory).length > 0 && (
            <div className="card p-4">
              <p className="text-headline font-semibold mb-4">Expenses by category</p>
              <div className="space-y-3">
                {Object.entries(expByCategory).sort((a,b) => b[1]-a[1]).map(([cat, amt]) => (
                  <div key={cat}>
                    <div className="flex justify-between mb-1">
                      <span className="text-subhead font-medium">{cat}</span>
                      <span className="text-footnote text-ios-secondary">{fmtCurrency(amt)}</span>
                    </div>
                    <div className="h-2 bg-ios-fill rounded-full overflow-hidden">
                      <div className="h-full bg-ios-red rounded-full" style={{ width: `${totalExpenses > 0 ? (amt/totalExpenses*100).toFixed(0) : 0}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Invoice Modal */}
      {invModal && (
        <Modal title={selectedInv ? 'Edit Invoice' : 'New Invoice'} onClose={() => setInvModal(false)} size="lg">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="input-label">Client *</label>
                <select className="input" value={invForm.client_id} onChange={e => setInvForm({...invForm, client_id: e.target.value})}>
                  <option value="">— Select client —</option>
                  {Object.entries(CLIENT_TYPES).map(([typeKey, typeInfo]) => {
                    const typeClients = clients.filter(c => (c.client_type||'direct')===typeKey);
                    if (!typeClients.length) return null;
                    return <optgroup key={typeKey} label={typeInfo.label}>{typeClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>;
                  })}
                </select>
              </div>
              <div><label className="input-label">Invoice #</label><input className="input" placeholder="2025-001" value={invForm.invoice_number} onChange={e => setInvForm({...invForm, invoice_number: e.target.value})}/></div>
              <div><label className="input-label">Amount (€) *</label><input className="input" type="number" placeholder="500" value={invForm.amount} onChange={e => setInvForm({...invForm, amount: e.target.value})}/></div>
              <div><label className="input-label">Month</label>
                <select className="input" value={invForm.month} onChange={e => setInvForm({...invForm, month: e.target.value})}>
                  {MONTHS_FULL.map((m,i) => <option key={i} value={i+1}>{m}</option>)}
                </select>
              </div>
              <div><label className="input-label">Year</label>
                <select className="input" value={invForm.year} onChange={e => setInvForm({...invForm, year: e.target.value})}>
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div><label className="input-label">Issue Date</label><input className="input" type="date" value={invForm.issue_date} onChange={e => setInvForm({...invForm, issue_date: e.target.value})}/></div>
              <div><label className="input-label">Due Date</label><input className="input" type="date" value={invForm.due_date} onChange={e => setInvForm({...invForm, due_date: e.target.value})}/></div>
              <div className="col-span-2">
                <label className="input-label">Status</label>
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(INVOICE_STATUS).map(([k,v]) => (
                    <button key={k} onClick={() => setInvForm({...invForm, status: k, paid_date: k==='paid' && !invForm.paid_date ? new Date().toISOString().split('T')[0] : invForm.paid_date})}
                      className={`px-3 py-1.5 rounded-ios text-footnote font-semibold ${invForm.status===k ? 'bg-ios-blue text-white' : 'bg-ios-fill text-ios-secondary'}`}>{v.label}</button>
                  ))}
                </div>
              </div>
              {invForm.status==='paid' && (
                <div className="col-span-2"><label className="input-label">Payment Date</label><input className="input" type="date" value={invForm.paid_date} onChange={e => setInvForm({...invForm, paid_date: e.target.value})}/></div>
              )}
              <div className="col-span-2"><label className="input-label">Notes</label><textarea className="input" rows={2} value={invForm.notes} onChange={e => setInvForm({...invForm, notes: e.target.value})}/></div>
            </div>
            <div className="flex gap-3 pt-2">
              {selectedInv && <button className="btn-danger flex items-center gap-1" onClick={() => delInvoice(selectedInv.id)}><Trash2 className="w-4 h-4"/></button>}
              <button className="btn-secondary flex-1" onClick={() => setInvModal(false)}>Cancel</button>
              <button className="btn-primary flex-1" onClick={saveInvoice} disabled={loading||!invForm.amount||!invForm.client_id}>{loading ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Expense Modal */}
      {expModal && (
        <Modal title={selectedExp ? 'Edit Expense' : 'New Expense'} onClose={() => setExpModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="input-label">Category *</label>
              <select className="input" value={expForm.category} onChange={e => setExpForm({...expForm, category: e.target.value})}>
                {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div><label className="input-label">Description</label><input className="input" placeholder="e.g. Diana salary March" value={expForm.description} onChange={e => setExpForm({...expForm, description: e.target.value})}/></div>
            <div><label className="input-label">Amount (€) *</label><input className="input" type="number" placeholder="1000" value={expForm.amount} onChange={e => setExpForm({...expForm, amount: e.target.value})}/></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="input-label">Month</label>
                <select className="input" value={expForm.month} onChange={e => setExpForm({...expForm, month: e.target.value})}>
                  {MONTHS_FULL.map((m,i) => <option key={i} value={i+1}>{m}</option>)}
                </select>
              </div>
              <div><label className="input-label">Year</label>
                <select className="input" value={expForm.year} onChange={e => setExpForm({...expForm, year: e.target.value})}>
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
            <div><label className="input-label">Date (optional)</label><input className="input" type="date" value={expForm.date} onChange={e => setExpForm({...expForm, date: e.target.value})}/></div>
            <div className="flex gap-3 pt-2">
              {selectedExp && <button className="btn-danger flex items-center gap-1" onClick={() => delExpense(selectedExp.id)}><Trash2 className="w-4 h-4"/></button>}
              <button className="btn-secondary flex-1" onClick={() => setExpModal(false)}>Cancel</button>
              <button className="btn-primary flex-1" onClick={saveExpense} disabled={loading||!expForm.amount}>{loading ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
