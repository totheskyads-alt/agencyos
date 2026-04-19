'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/Modal';
import { fmtCurrency, fmtDate, parseUTC } from '@/lib/utils';
import { Plus, Search, AlertCircle, CheckCircle, Clock, FileText, Euro, ChevronDown, TrendingUp } from 'lucide-react';

const STATUS = {
  draft:   { label:'Schiță',   color:'badge-gray',   icon:FileText },
  sent:    { label:'Trimisă',  color:'badge-blue',   icon:Clock },
  paid:    { label:'Plătită',  color:'badge-green',  icon:CheckCircle },
  overdue: { label:'Restantă', color:'badge-red',    icon:AlertCircle },
  partial: { label:'Parțial', color:'badge-orange',  icon:Clock },
};

const CLIENT_TYPES = {
  direct:      { label:'Clienți direcți',  color:'#007AFF' },
  whitelabel:  { label:'White Label',      color:'#AF52DE' },
  colaborator: { label:'Colaboratori',     color:'#FF9500' },
};

const MONTHS_FULL = ['Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie','Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie'];
const MONTHS_SHORT = ['Ian','Feb','Mar','Apr','Mai','Iun','Iul','Aug','Sep','Oct','Nov','Dec'];

const RANGES = [
  { key:'7days',   label:'7 zile' },
  { key:'14days',  label:'14 zile' },
  { key:'30days',  label:'30 zile' },
  { key:'3months', label:'3 luni' },
  { key:'1year',   label:'1 an' },
  { key:'all',     label:'Toate' },
  { key:'custom',  label:'Custom' },
];

function getDateRange(key) {
  const now = new Date();
  const today = new Date(now.getFullYear(),now.getMonth(),now.getDate());
  // Default: last 30 days excluding today
  const yesterday = new Date(today.getTime()-86400000);
  switch(key) {
    case '7days':   return { from: new Date(yesterday.getTime()-6*86400000).toISOString(), to: yesterday.toISOString() };
    case '14days':  return { from: new Date(yesterday.getTime()-13*86400000).toISOString(), to: yesterday.toISOString() };
    case '30days':  return { from: new Date(yesterday.getTime()-29*86400000).toISOString(), to: yesterday.toISOString() };
    case '3months': return { from: new Date(now.getFullYear(),now.getMonth()-2,1).toISOString(), to: yesterday.toISOString() };
    case '1year':   return { from: new Date(now.getFullYear()-1,now.getMonth(),1).toISOString(), to: yesterday.toISOString() };
    case 'all':     return { from: '2020-01-01T00:00:00Z', to: now.toISOString() };
    default:        return { from: new Date(yesterday.getTime()-29*86400000).toISOString(), to: yesterday.toISOString() };
  }
}

function isOverdue(bill) {
  if (bill.status==='paid') return false;
  if (!bill.due_date) return false;
  return parseUTC(bill.due_date) < new Date();
}

function LineChart({ data, color='#007AFF' }) {
  const valid=data.filter(d=>d.value>0);
  if (valid.length<2) return <div className="flex items-center justify-center h-20 text-ios-tertiary text-footnote">Date insuficiente</div>;
  const max=Math.max(...data.map(d=>d.value),1);
  const W=400,H=80,PAD=20;
  const pts=data.map((d,i)=>({x:PAD+(i/(data.length-1))*(W-PAD*2),y:d.value>0?PAD+((max-d.value)/max)*(H-PAD*2):H,...d}));
  const pathD=pts.filter(p=>p.value>0).map((p,i)=>`${i===0?'M':'L'} ${p.x} ${p.y}`).join(' ');
  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H+20}`} className="w-full" style={{minWidth:200}}>
        <path d={pathD} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        {pts.map((p,i)=>p.value>0&&<g key={i}>
          <circle cx={p.x} cy={p.y} r="3.5" fill="white" stroke={color} strokeWidth="2"/>
          <text x={p.x} y={p.y-7} textAnchor="middle" fontSize="9" fill={color} fontWeight="700">{p.displayValue}</text>
          <text x={p.x} y={H+14} textAnchor="middle" fontSize="9" fill="#AEAEB2">{p.label}</text>
        </g>)}
      </svg>
    </div>
  );
}

const empty = { client_id:'', invoice_number:'', amount:'', month:new Date().getMonth()+1, year:new Date().getFullYear(), issue_date:'', due_date:'', paid_date:'', status:'draft', notes:'' };

export default function BillingPage() {
  const [bills, setBills] = useState([]);
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(empty);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [range, setRange] = useState('30days');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [typeTab, setTypeTab] = useState('all');
  const [viewTab, setViewTab] = useState('list');

  useEffect(() => { load(); }, []);
  useEffect(() => { if(range!=='custom') filterByRange(); }, [range, bills.length]);

  async function load() {
    const [{data:b},{data:c}] = await Promise.all([
      supabase.from('billing').select('*,clients(name,company,type)').order('year',{ascending:false}).order('month',{ascending:false}),
      supabase.from('clients').select('id,name,company,type').order('name'),
    ]);
    setBills((b||[]).map(bill=>({...bill,status:isOverdue(bill)&&bill.status!=='paid'?'overdue':bill.status})));
    setClients(c||[]);
  }

  function filterByRange() {}

  function openAdd() { setForm(empty); setSelected(null); setModal(true); }
  function openEdit(b) {
    setForm({client_id:b.client_id||'',invoice_number:b.invoice_number||'',amount:b.amount||'',
      month:b.month||new Date().getMonth()+1,year:b.year||new Date().getFullYear(),
      issue_date:b.issue_date||'',due_date:b.due_date||'',paid_date:b.paid_date||'',
      status:b.status||'draft',notes:b.notes||''});
    setSelected(b); setModal(true);
  }

  async function save() {
    setLoading(true);
    const payload={...form,amount:parseFloat(form.amount)||0,month:parseInt(form.month),year:parseInt(form.year),
      client_id:form.client_id||null,issue_date:form.issue_date||null,due_date:form.due_date||null,
      paid_date:form.paid_date||null,invoice_number:form.invoice_number||null};
    if(selected) await supabase.from('billing').update(payload).eq('id',selected.id);
    else await supabase.from('billing').insert(payload);
    setModal(false); setLoading(false); load();
  }

  async function quickPaid(id) {
    await supabase.from('billing').update({status:'paid',paid_date:new Date().toISOString().split('T')[0]}).eq('id',id);
    load();
  }

  async function del(id) {
    if(!confirm('Ștergi factura?')) return;
    await supabase.from('billing').delete().eq('id',id);
    setModal(false); load();
  }

  // Filter bills
  let filtered = bills;
  if (typeTab!=='all') filtered=filtered.filter(b=>b.clients?.type===typeTab);
  if (statusFilter) filtered=filtered.filter(b=>b.status===statusFilter);
  if (search) filtered=filtered.filter(b=>b.clients?.name?.toLowerCase().includes(search.toLowerCase())||b.invoice_number?.toLowerCase().includes(search.toLowerCase()));

  // Range filter for charts
  function getRangeFilter() {
    if (range==='custom') return { from:new Date(customFrom),to:new Date(customTo+'T23:59:59') };
    const {from,to}=getDateRange(range);
    return {from:new Date(from),to:new Date(to)};
  }

  // Stats
  const totalBilled=bills.reduce((a,b)=>a+(b.amount||0),0);
  const totalPaid=bills.filter(b=>b.status==='paid').reduce((a,b)=>a+(b.amount||0),0);
  const totalUnpaid=bills.filter(b=>b.status!=='paid').reduce((a,b)=>a+(b.amount||0),0);
  const totalOverdue=bills.filter(b=>b.status==='overdue').reduce((a,b)=>a+(b.amount||0),0);

  // Per type stats
  function typeStats(type) {
    const tb=bills.filter(b=>b.clients?.type===type);
    return {
      total:tb.reduce((a,b)=>a+(b.amount||0),0),
      paid:tb.filter(b=>b.status==='paid').reduce((a,b)=>a+(b.amount||0),0),
      unpaid:tb.filter(b=>b.status!=='paid').reduce((a,b)=>a+(b.amount||0),0),
      count:tb.length,
    };
  }

  // Monthly chart data (last 6 months)
  function getMonthlyChart() {
    const now=new Date();
    return Array.from({length:6},(_,i)=>{
      const d=new Date(now.getFullYear(),now.getMonth()-5+i,1);
      const m=d.getMonth()+1,y=d.getFullYear();
      const mb=bills.filter(b=>b.month===m&&b.year===y&&b.status==='paid');
      return {label:`${MONTHS_SHORT[m-1]}'${y.toString().slice(2)}`,value:mb.reduce((a,b)=>a+(b.amount||0),0),displayValue:mb.length>0?`€${mb.reduce((a,b)=>a+(b.amount||0),0)}`:''};
    });
  }

  // Per client chart
  function getClientChart() {
    const map={};
    bills.filter(b=>b.status==='paid').forEach(b=>{
      const k=b.client_id;
      if(!k) return;
      if(!map[k]) map[k]={name:b.clients?.name||'—',amount:0,type:b.clients?.type||'direct'};
      map[k].amount+=(b.amount||0);
    });
    return Object.values(map).filter(c=>typeTab==='all'||c.type===typeTab).sort((a,b)=>b.amount-a.amount).slice(0,8);
  }

  const monthlyChart=getMonthlyChart();
  const clientChart=getClientChart();
  const years=[]; for(let y=new Date().getFullYear();y>=new Date().getFullYear()-2;y--) years.push(y);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-title2 font-bold text-ios-primary">Facturare</h1>
          <p className="text-subhead text-ios-secondary">{bills.length} facturi</p>
        </div>
        <button onClick={openAdd} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" strokeWidth={2.5}/> Factură nouă
        </button>
      </div>

      {/* Overdue alert */}
      {totalOverdue>0&&(
        <div className="bg-red-50 border border-red-100 rounded-ios-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-ios-red shrink-0"/>
          <div>
            <p className="text-subhead font-semibold text-ios-red">Facturi restante!</p>
            <p className="text-footnote text-ios-red/80">{bills.filter(b=>b.status==='overdue').length} facturi · {fmtCurrency(totalOverdue)}</p>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {label:'Total facturat',value:fmtCurrency(totalBilled),icon:Euro,color:'text-ios-blue bg-blue-50'},
          {label:'Încasat',value:fmtCurrency(totalPaid),icon:CheckCircle,color:'text-ios-green bg-green-50'},
          {label:'De încasat',value:fmtCurrency(totalUnpaid),icon:Clock,color:'text-ios-orange bg-orange-50'},
          {label:'Restante',value:fmtCurrency(totalOverdue),icon:AlertCircle,color:'text-ios-red bg-red-50'},
        ].map(({label,value,icon:Icon,color})=>(
          <div key={label} className="card p-4">
            <div className={`w-9 h-9 rounded-ios flex items-center justify-center mb-3 ${color}`}><Icon className="w-4 h-4"/></div>
            <p className="text-title3 font-bold text-ios-primary">{value}</p>
            <p className="text-footnote text-ios-secondary">{label}</p>
          </div>
        ))}
      </div>

      {/* Type tabs */}
      <div className="flex gap-0.5 bg-ios-fill p-1 rounded-ios">
        {[['all','Toate'],['direct','Clienți direcți'],['whitelabel','White Label'],['colaborator','Colaboratori']].map(([k,v])=>(
          <button key={k} onClick={()=>setTypeTab(k)}
            className={`flex-1 py-2 rounded-ios-sm text-footnote font-semibold transition-all whitespace-nowrap ${typeTab===k?'bg-white text-ios-primary shadow-ios-sm':'text-ios-secondary'}`}>{v}</button>
        ))}
      </div>

      {/* Per type summary when filtered */}
      {typeTab!=='all'&&(()=>{
        const ts=typeStats(typeTab);
        return (
          <div className="grid grid-cols-3 gap-3">
            <div className="card p-3 text-center"><p className="text-headline font-bold text-ios-primary">{fmtCurrency(ts.total)}</p><p className="text-caption1 text-ios-secondary">Total facturat</p></div>
            <div className="card p-3 text-center"><p className="text-headline font-bold text-ios-green">{fmtCurrency(ts.paid)}</p><p className="text-caption1 text-ios-secondary">Încasat</p></div>
            <div className="card p-3 text-center"><p className="text-headline font-bold text-ios-orange">{fmtCurrency(ts.unpaid)}</p><p className="text-caption1 text-ios-secondary">De încasat</p></div>
          </div>
        );
      })()}

      {/* View tabs */}
      <div className="flex gap-2 items-center flex-wrap">
        <div className="flex gap-0.5 bg-ios-fill p-1 rounded-ios">
          {[['list','Listă'],['charts','Grafice']].map(([k,v])=>(
            <button key={k} onClick={()=>setViewTab(k)}
              className={`px-4 py-1.5 rounded-ios-sm text-footnote font-semibold transition-all ${viewTab===k?'bg-white text-ios-primary shadow-ios-sm':'text-ios-secondary'}`}>{v}</button>
          ))}
        </div>
      </div>

      {viewTab==='charts'&&(
        <div className="space-y-4">
          {/* Period filter */}
          <div className="card p-4 space-y-3">
            <div className="flex gap-1.5 flex-wrap">
              {RANGES.map(r=>(
                <button key={r.key} onClick={()=>setRange(r.key)}
                  className={`px-3 py-1.5 rounded-ios text-footnote font-semibold transition-all ${range===r.key?'bg-ios-blue text-white':'bg-ios-fill text-ios-secondary'}`}>{r.label}</button>
              ))}
            </div>
            {range==='custom'&&(
              <div className="flex gap-3">
                <div className="flex-1"><label className="input-label">De la</label><input type="date" className="input" value={customFrom} onChange={e=>setCustomFrom(e.target.value)}/></div>
                <div className="flex-1"><label className="input-label">Până la</label><input type="date" className="input" value={customTo} onChange={e=>setCustomTo(e.target.value)}/></div>
              </div>
            )}
          </div>

          <div className="card p-4">
            <p className="text-headline font-semibold mb-1">Încasat pe luni</p>
            <p className="text-footnote text-ios-secondary mb-3">Ultimele 6 luni</p>
            <LineChart color="#34C759" data={monthlyChart}/>
          </div>

          <div className="card p-4">
            <p className="text-headline font-semibold mb-3">Top clienți — facturat total</p>
            {clientChart.length===0?<p className="text-ios-tertiary text-subhead text-center py-4">Nicio dată</p>:(
              <div className="space-y-2">
                {clientChart.map((c,i)=>{
                  const max=clientChart[0].amount;
                  return (
                    <div key={i}>
                      <div className="flex justify-between mb-1">
                        <span className="text-subhead font-medium text-ios-primary">{c.name}</span>
                        <span className="text-subhead font-bold text-ios-green">{fmtCurrency(c.amount)}</span>
                      </div>
                      <div className="h-2 bg-ios-fill rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{width:`${(c.amount/max)*100}%`,background:CLIENT_TYPES[c.type]?.color||'#007AFF'}}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {viewTab==='list'&&(
        <>
          {/* Filters */}
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1">
              <input className="input pl-4" placeholder="Caută client, nr. factură..." value={search} onChange={e=>setSearch(e.target.value)}/>
            </div>
            <div className="relative">
              <select className="input appearance-none pr-8 py-2 text-footnote w-36" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
                <option value="">Toate status</option>
                {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ios-tertiary pointer-events-none"/>
            </div>
          </div>

          {filtered.length===0?(
            <div className="card p-12 text-center">
              <FileText className="w-8 h-8 text-ios-label4 mx-auto mb-3"/>
              <p className="text-headline font-semibold text-ios-secondary mb-4">Nicio factură</p>
              <button onClick={openAdd} className="btn-primary">Factură nouă</button>
            </div>
          ):(
            <div className="card">
              {filtered.map(b=>{
                const st=STATUS[b.status]||STATUS.draft;
                const Icon=st.icon;
                return (
                  <div key={b.id} className={`list-row hover:bg-ios-bg transition-colors ${b.status==='overdue'?'border-l-2 border-ios-red':''}`}>
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={()=>openEdit(b)}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-subhead font-semibold text-ios-primary">{b.clients?.name||'Fără client'}</p>
                        {b.invoice_number&&<span className="text-caption1 text-ios-tertiary">#{b.invoice_number}</span>}
                        <span className={`badge ${st.color}`}><Icon className="w-2.5 h-2.5 mr-1 inline"/>{st.label}</span>
                        {b.clients?.type&&<span className={`badge ${b.clients.type==='direct'?'badge-blue':b.clients.type==='whitelabel'?'badge-purple':'badge-orange'}`}>{CLIENT_TYPES[b.clients.type]?.label||b.clients.type}</span>}
                      </div>
                      <div className="flex gap-3 mt-0.5 flex-wrap">
                        <span className="text-footnote text-ios-secondary">{MONTHS_SHORT[(b.month||1)-1]} {b.year}</span>
                        {b.due_date&&<span className={`text-footnote ${b.status==='overdue'?'text-ios-red font-semibold':'text-ios-secondary'}`}>Scadent: {fmtDate(b.due_date)}</span>}
                        {b.paid_date&&<span className="text-footnote text-ios-green">Plătit: {fmtDate(b.paid_date)}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <p className="text-subhead font-bold">{fmtCurrency(b.amount)}</p>
                      {b.status!=='paid'&&(
                        <button onClick={()=>quickPaid(b.id)}
                          className="px-2.5 py-1.5 bg-green-50 text-ios-green rounded-ios text-caption1 font-semibold hover:bg-green-100 transition-colors whitespace-nowrap">
                          ✓ Plătit
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {modal&&(
        <Modal title={selected?'Editează factură':'Factură nouă'} onClose={()=>setModal(false)} size="lg">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="input-label">Client *</label>
                <select className="input" value={form.client_id} onChange={e=>setForm({...form,client_id:e.target.value})}>
                  <option value="">— Selectează client —</option>
                  {Object.entries(CLIENT_TYPES).map(([type,info])=>{
                    const typeClients=clients.filter(c=>c.type===type);
                    if(typeClients.length===0) return null;
                    return <optgroup key={type} label={info.label}>{typeClients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>;
                  })}
                </select>
              </div>
              <div><label className="input-label">Nr. factură</label><input className="input" placeholder="2025-001" value={form.invoice_number} onChange={e=>setForm({...form,invoice_number:e.target.value})}/></div>
              <div><label className="input-label">Sumă (€) *</label><input className="input" type="number" placeholder="500" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></div>
              <div><label className="input-label">Lună referință</label>
                <select className="input" value={form.month} onChange={e=>setForm({...form,month:e.target.value})}>
                  {MONTHS_FULL.map((m,i)=><option key={i} value={i+1}>{m}</option>)}
                </select>
              </div>
              <div><label className="input-label">An</label>
                <select className="input" value={form.year} onChange={e=>setForm({...form,year:e.target.value})}>
                  {years.map(y=><option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div><label className="input-label">Data emiterii</label><input className="input" type="date" value={form.issue_date} onChange={e=>setForm({...form,issue_date:e.target.value})}/></div>
              <div><label className="input-label">Data scadenței</label><input className="input" type="date" value={form.due_date} onChange={e=>setForm({...form,due_date:e.target.value})}/></div>
              <div className="col-span-2">
                <label className="input-label">Status</label>
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(STATUS).map(([k,v])=>(
                    <button key={k} onClick={()=>setForm({...form,status:k,paid_date:k==='paid'&&!form.paid_date?new Date().toISOString().split('T')[0]:form.paid_date})}
                      className={`px-3 py-1.5 rounded-ios text-footnote font-semibold transition-all ${form.status===k?'bg-ios-blue text-white':'bg-ios-fill text-ios-secondary'}`}>{v.label}</button>
                  ))}
                </div>
              </div>
              {form.status==='paid'&&(
                <div className="col-span-2"><label className="input-label">Data plății</label><input className="input" type="date" value={form.paid_date} onChange={e=>setForm({...form,paid_date:e.target.value})}/></div>
              )}
              <div className="col-span-2"><label className="input-label">Note</label><textarea className="input" rows={2} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></div>
            </div>
            <div className="flex gap-3 pt-2">
              {selected&&<button className="btn-danger" onClick={()=>del(selected.id)}>Șterge</button>}
              <button className="btn-secondary flex-1" onClick={()=>setModal(false)}>Anulează</button>
              <button className="btn-primary flex-1" onClick={save} disabled={loading||!form.amount||!form.client_id}>
                {loading?'Se salvează...':'Salvează'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
