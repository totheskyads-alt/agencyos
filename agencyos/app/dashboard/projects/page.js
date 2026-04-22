'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/Modal';
import { useRole } from '@/lib/useRole';
import { fmtDuration, fmtCurrency } from '@/lib/utils';
import { Plus, Search, Euro, Trash2, ChevronDown, FolderOpen, Archive } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

const COLORS = ['#007AFF','#34C759','#FF9500','#FF3B30','#AF52DE','#32ADE6','#5856D6','#FF2D55','#00C7BE'];
const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = Array.from({length:28},(_,i)=>i+1);

const emptyProj = { name:'', description:'', client_id:'', status:'active', color:'#007AFF', billing_day:'', monthly_amount:'' };
const emptyClient = { name:'', company:'', client_type:'direct' };

export default function ProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('active'); // active | archived
  const [modal, setModal] = useState(false);
  const [invoiceModal, setInvoiceModal] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(emptyProj);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({});
  const [invoices, setInvoices] = useState([]);
  const [invForm, setInvForm] = useState({ month: new Date().getMonth()+1, year: new Date().getFullYear(), amount:'' });
  // Inline new client
  const [showNewClient, setShowNewClient] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [clientForm, setClientForm] = useState(emptyClient);
  const [savingClient, setSavingClient] = useState(false);
  const searchParams = useSearchParams();
  const clientFilter = searchParams.get('client') || '';
  const { isAdmin, can } = useRole();
  const canManageProjects = can('canManageProjects');

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!clientFilter || clients.length === 0) return;
    const client = clients.find(c => c.id === clientFilter);
    if (client) setSearch(client.name);
  }, [clientFilter, clients]);

  async function load() {
    const [{ data: proj }, { data: cli }] = await Promise.all([
      supabase.from('projects').select('*, clients(name)').order('created_at',{ascending:false}),
      supabase.from('clients').select('id,name').order('name'),
    ]);
    setProjects(proj||[]);
    setClients(cli||[]);
    const { data: entries } = await supabase.from('time_entries').select('project_id,duration_seconds').not('end_time','is',null);
    const s = {};
    (entries||[]).forEach(e => { if (!e.project_id) return; s[e.project_id] = (s[e.project_id]||0)+(e.duration_seconds||0); });
    setStats(s);
  }

  async function loadInvoices(projectId) {
    const { data } = await supabase.from('invoices').select('*').eq('project_id',projectId).order('year',{ascending:false}).order('month',{ascending:false});
    setInvoices(data||[]);
  }

  function openAdd() { if (!canManageProjects) return; setForm(emptyProj); setSelected(null); setShowNewClient(false); setClientForm(emptyClient); setModal(true); }
  function openEdit(p) {
    if (!canManageProjects) return;
    setForm({ name:p.name, description:p.description||'', client_id:p.client_id||'', status:p.status, color:p.color, billing_day:p.billing_day||'', monthly_amount:p.monthly_amount||'' });
    setSelected(p); setShowNewClient(false); setModal(true);
  }
  async function openInvoices(p, e) {
    e.stopPropagation();
    setSelected(p); await loadInvoices(p.id); setInvoiceModal(true);
  }

  async function createClientInline() {
    if (!clientForm.name.trim()) return;
    setSavingClient(true);
    const { data } = await supabase.from('clients').insert({ name: clientForm.name.trim(), company: clientForm.company||null, client_type: clientForm.client_type }).select().single();
    if (data) {
      setClients(prev => [...prev, data].sort((a,b) => a.name.localeCompare(b.name)));
      setForm(prev => ({ ...prev, client_id: data.id }));
    }
    setShowNewClient(false); setClientForm(emptyClient); setSavingClient(false);
  }

  async function save() {
    if (!form.client_id) { alert('Please select or create a client — required!'); return; }
    if (!form.name.trim()) { alert('Project name is required.'); return; }
    setLoading(true);
    const payload = { ...form, billing_day: form.billing_day ? parseInt(form.billing_day) : null, monthly_amount: form.monthly_amount ? parseFloat(form.monthly_amount) : null };
    if (selected) await supabase.from('projects').update(payload).eq('id', selected.id);
    else await supabase.from('projects').insert(payload);
    setModal(false); setLoading(false); load();
  }

  async function del(id) {
    if (!confirm('Delete this project?')) return;
    await supabase.from('projects').delete().eq('id', id);
    setModal(false); load();
  }

  async function toggleArchive(p, e) {
    e.stopPropagation();
    const newStatus = p.status === 'active' ? 'archived' : 'active';
    await supabase.from('projects').update({ status: newStatus }).eq('id', p.id);
    load();
  }

  async function addInvoice() {
    if (!invForm.amount || !selected) return;
    setLoading(true);
    // Save to billing table (main billing section) with project's client
    const payload = {
      client_id: selected.client_id,
      amount: parseFloat(invForm.amount),
      month: parseInt(invForm.month),
      year: parseInt(invForm.year),
      status: 'draft',
      invoice_number: `INV-${selected.clients?.name?.slice(0,3).toUpperCase()}-${invForm.year}-${String(invForm.month).padStart(2,'0')}`,
    };
    await supabase.from('billing').insert(payload);
    // Also save to invoices for project history
    await supabase.from('invoices').upsert({ project_id: selected.id, month: parseInt(invForm.month), year: parseInt(invForm.year), amount: parseFloat(invForm.amount) }, { onConflict:'project_id,month,year' });
    await loadInvoices(selected.id);
    setInvForm({...invForm, amount:''});
    setLoading(false);
  }

  async function delInvoice(id) { await supabase.from('invoices').delete().eq('id',id); loadInvoices(selected.id); }

  const filtered = projects.filter(p => {
    if (activeTab === 'active' && p.status !== 'active') return false;
    if (activeTab === 'archived' && p.status !== 'archived') return false;
    if (clientFilter && p.client_id !== clientFilter) return false;
    return p.name?.toLowerCase().includes(search.toLowerCase()) || p.clients?.name?.toLowerCase().includes(search.toLowerCase());
  });

  const activeCount = projects.filter(p => p.status === 'active').length;
  const archivedCount = projects.filter(p => p.status !== 'active').length;
  const years = Array.from({length:3},(_,i)=>new Date().getFullYear()-i);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-title2 font-bold text-ios-primary">Projects</h1>
          <p className="text-subhead text-ios-secondary">{activeCount} active{archivedCount > 0 ? ` · ${archivedCount} archived` : ''}</p>
        </div>
        {canManageProjects && (
          <button onClick={openAdd} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" strokeWidth={2.5} /> New Project
          </button>
        )}
      </div>

      {/* Tabs + search */}
      <div className="flex items-center gap-3">
        <div className="flex gap-0.5 bg-ios-fill p-1 rounded-ios">
          <button onClick={() => setActiveTab('active')}
            className={`px-4 py-1.5 rounded-ios-sm text-footnote font-semibold transition-all ${activeTab==='active' ? 'bg-white text-ios-primary shadow-ios-sm' : 'text-ios-secondary'}`}>
            Active {activeCount > 0 && <span className="ml-1 text-ios-blue">{activeCount}</span>}
          </button>
          <button onClick={() => setActiveTab('archived')}
            className={`px-4 py-1.5 rounded-ios-sm text-footnote font-semibold transition-all ${activeTab==='archived' ? 'bg-white text-ios-primary shadow-ios-sm' : 'text-ios-secondary'}`}>
            Archived {archivedCount > 0 && <span className="ml-1 text-ios-tertiary">{archivedCount}</span>}
          </button>
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-tertiary"/>
          <input className="input pl-10" placeholder="Search projects..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
      </div>

      {/* Projects grouped by client */}
      {filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <FolderOpen className="w-8 h-8 text-ios-label4 mx-auto mb-3" />
          <p className="text-headline font-semibold text-ios-secondary mb-4">{activeTab === 'active' ? 'No active projects' : 'No archived projects'}</p>
          {activeTab === 'active' && canManageProjects && <button onClick={openAdd} className="btn-primary">New Project</button>}
        </div>
      ) : (() => {
        // Group by client
        const grouped = {};
        filtered.forEach(p => {
          const key = p.client_id || '__none__';
          const label = p.clients?.name || '⚠️ No client';
          if (!grouped[key]) grouped[key] = { label, projects: [] };
          grouped[key].projects.push(p);
        });
        return (
          <div className="space-y-4">
            {Object.entries(grouped).map(([clientId, group]) => (
              <div key={clientId} className="card overflow-hidden">
                <div className="px-4 py-2.5 bg-ios-bg border-b border-ios-separator/30 flex items-center gap-2">
                  <span className="text-footnote font-bold text-ios-secondary uppercase tracking-wide">{group.label}</span>
                  <span className="text-caption2 text-ios-tertiary">({group.projects.length})</span>
                  {clientId !== '__none__' && (
                    <a href={`/dashboard/tasks?client=${clientId}&mode=list`}
                      className="ml-auto text-caption1 text-ios-blue font-semibold hover:underline">
                      View tasks →
                    </a>
                  )}
                </div>
                {group.projects.map(p => (
                  <div key={p.id} className={`list-row transition-colors ${canManageProjects ? 'hover:bg-ios-bg cursor-pointer' : ''}`} onClick={() => openEdit(p)}>
                    <div className="w-3 h-3 rounded-full shrink-0 mr-3" style={{background:p.color}}/>
                    <div className="flex-1 min-w-0">
                      <p className="text-subhead font-semibold text-ios-primary">{p.name}</p>
                      {p.clients?.name && <p className="text-caption1 text-ios-secondary">{p.clients.name}</p>}
                      <div className="flex gap-3 flex-wrap">
                        {p.billing_day && <p className="text-footnote text-ios-tertiary">Day {p.billing_day}</p>}
                        {p.monthly_amount && isAdmin && <p className="text-footnote text-ios-green font-semibold">{fmtCurrency(p.monthly_amount)}/mo</p>}
                        {stats[p.id] > 0 && <p className="text-footnote text-ios-secondary">{fmtDuration(stats[p.id])} tracked</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                      <a href={`/dashboard/tasks?project=${p.id}&mode=list`} onClick={e => e.stopPropagation()}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-ios bg-ios-fill text-ios-secondary text-caption1 font-semibold hover:bg-ios-fill2">
                        View tasks →
                      </a>
                      {isAdmin && (
                        <button onClick={e => openInvoices(p, e)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-ios bg-green-50 text-ios-green text-caption1 font-semibold hover:bg-green-100">
                          <Euro className="w-3 h-3"/>Invoice
                        </button>
                      )}
                      {canManageProjects && (
                        <button onClick={e => toggleArchive(p, e)}
                          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-ios text-caption1 font-semibold ${p.status==='active' ? 'bg-ios-fill text-ios-secondary hover:bg-ios-fill2' : 'bg-blue-50 text-ios-blue hover:bg-blue-100'}`}>
                          <Archive className="w-3 h-3"/>
                          {p.status==='active' ? 'Archive' : 'Restore'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        );
      })()}

      {/* Project Modal */}
      {modal && (
        <Modal title={selected ? 'Edit Project' : 'New Project'} onClose={()=>setModal(false)}>
          <div className="space-y-4">
            {/* Client selector with inline create */}
            <div>
              <label className="input-label">Client * <span className="text-ios-red">(required)</span></label>
              {!showNewClient ? (
                <div className="space-y-2">
                  <div className="relative">
                    <div className="relative">
                      <input className={`input pr-9 ${!form.client_id ? 'border-ios-red/50' : ''}`}
                        placeholder="Search client..."
                        value={form.client_id ? clients.find(c=>c.id===form.client_id)?.name || '' : clientSearch}
                        onChange={e => { setClientSearch(e.target.value); setForm({...form, client_id: ''}); }}
                        onFocus={() => setClientSearch('')}
                      />
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-tertiary pointer-events-none"/>
                    </div>
                    {(!form.client_id && (clientSearch || true)) && (
                      <div className="absolute z-20 w-full bg-white rounded-ios shadow-ios-modal border border-ios-separator/30 max-h-48 overflow-y-auto mt-1">
                        {clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase())).map(c => (
                          <button key={c.id} onClick={() => { setForm({...form, client_id: c.id}); setClientSearch(''); }}
                            className="flex items-center w-full px-3 py-2.5 hover:bg-ios-fill text-left text-subhead">
                            {c.name}
                          </button>
                        ))}
                        {clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase())).length === 0 && (
                          <p className="px-3 py-2 text-footnote text-ios-tertiary">No clients found</p>
                        )}
                      </div>
                    )}
                  </div>
                  <button onClick={() => setShowNewClient(true)}
                    className="flex items-center gap-1.5 text-footnote text-ios-blue hover:bg-blue-50 px-2 py-1.5 rounded-ios font-semibold w-full">
                    <Plus className="w-3.5 h-3.5" /> Create new client instead
                  </button>
                </div>
              ) : (
                <div className="bg-blue-50 rounded-ios p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-footnote font-semibold text-ios-blue">New Client</p>
                    <button onClick={() => setShowNewClient(false)} className="text-ios-tertiary hover:text-ios-primary text-caption1">Cancel</button>
                  </div>
                  <input className="input" placeholder="Client name *" value={clientForm.name} onChange={e=>setClientForm({...clientForm, name:e.target.value})} autoFocus />
                  <input className="input" placeholder="Company (optional)" value={clientForm.company} onChange={e=>setClientForm({...clientForm, company:e.target.value})} />
                  <div className="flex gap-2">
                    {['direct','whitelabel','colaborator'].map(t => (
                      <button key={t} onClick={() => setClientForm({...clientForm, client_type:t})}
                        className={`flex-1 py-1.5 rounded-ios text-caption1 font-semibold transition-all ${clientForm.client_type===t ? 'bg-ios-blue text-white' : 'bg-white text-ios-secondary'}`}>
                        {t === 'direct' ? 'Direct' : t === 'whitelabel' ? 'White-label' : 'Collaborator'}
                      </button>
                    ))}
                  </div>
                  <button onClick={createClientInline} disabled={!clientForm.name.trim() || savingClient}
                    className="btn-primary w-full py-2 text-footnote">
                    {savingClient ? 'Creating...' : 'Create & Select Client'}
                  </button>
                </div>
              )}
            </div>

            <div><label className="input-label">Project Name *</label><input className="input" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Social Media Management" /></div>
            <div><label className="input-label">Description</label><textarea className="input" rows={2} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></div>

            {isAdmin && <div className="bg-green-50 rounded-ios-lg p-3 space-y-3">
              <p className="text-caption1 font-semibold text-ios-green uppercase tracking-wide">Billing Settings</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="input-label">Billing Day</label>
                  <div className="relative">
                    <select className="input appearance-none pr-9" value={form.billing_day} onChange={e=>setForm({...form,billing_day:e.target.value})}>
                      <option value="">— Select —</option>
                      {DAYS.map(d=><option key={d} value={d}>Day {d}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-tertiary pointer-events-none"/>
                  </div>
                </div>
                <div>
                  <label className="input-label">Monthly Amount (€)</label>
                  <input className="input" type="number" placeholder="500" value={form.monthly_amount} onChange={e=>setForm({...form,monthly_amount:e.target.value})}/>
                </div>
              </div>
            </div>}

            <div>
              <label className="input-label">Color</label>
              <div className="flex gap-2 flex-wrap">{COLORS.map(c=><button key={c} onClick={()=>setForm({...form,color:c})} style={{background:c}} className={`w-8 h-8 rounded-full transition-all ${form.color===c ? 'ring-2 ring-offset-2 ring-ios-blue scale-110' : ''}`}/>)}</div>
            </div>

            {selected && (
              <div>
                <label className="input-label">Status</label>
                <div className="flex gap-2">
                  {[['active','Active'],['archived','Archived']].map(([k,v])=>(
                    <button key={k} onClick={()=>setForm({...form,status:k})} className={`flex-1 py-2 rounded-ios text-footnote font-semibold transition-all ${form.status===k ? 'bg-ios-blue text-white' : 'bg-ios-fill text-ios-secondary'}`}>{v}</button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              {selected && <button className="btn-danger" onClick={()=>del(selected.id)}>Delete</button>}
              <button className="btn-secondary flex-1" onClick={()=>setModal(false)}>Cancel</button>
              <button className="btn-primary flex-1" onClick={save} disabled={loading||!form.name||!form.client_id}>
                {loading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Invoices Modal */}
      {invoiceModal && selected && (
        <Modal title={`Invoices — ${selected.name}`} onClose={()=>setInvoiceModal(false)} size="lg">
          <div className="space-y-5">
            {selected.monthly_amount && (
              <div className="bg-blue-50 rounded-ios p-3 text-footnote text-ios-blue">
                Monthly: <strong>{fmtCurrency(selected.monthly_amount)}</strong>
                {selected.billing_day && ` · Billing day ${selected.billing_day}`}
              </div>
            )}
            <div className="bg-green-50 rounded-ios-lg p-4">
              <p className="text-subhead font-semibold text-ios-green mb-3">Add Invoice</p>
              <div className="grid grid-cols-3 gap-2">
                <div><label className="input-label">Month</label>
                  <div className="relative"><select className="input appearance-none pr-8" value={invForm.month} onChange={e=>setInvForm({...invForm,month:e.target.value})}>
                    {MONTHS_FULL.map((m,i)=><option key={i} value={i+1}>{m}</option>)}
                  </select><ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ios-tertiary pointer-events-none"/></div>
                </div>
                <div><label className="input-label">Year</label>
                  <div className="relative"><select className="input appearance-none pr-8" value={invForm.year} onChange={e=>setInvForm({...invForm,year:e.target.value})}>
                    {years.map(y=><option key={y} value={y}>{y}</option>)}
                  </select><ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ios-tertiary pointer-events-none"/></div>
                </div>
                <div><label className="input-label">Amount (€)</label>
                  <input className="input" type="number" placeholder={selected.monthly_amount||'300'} value={invForm.amount} onChange={e=>setInvForm({...invForm,amount:e.target.value})}/>
                </div>
              </div>
              {selected.monthly_amount && !invForm.amount && (
                <button onClick={()=>setInvForm({...invForm,amount:selected.monthly_amount})} className="text-footnote text-ios-blue mt-2 hover:underline">
                  Use monthly amount ({fmtCurrency(selected.monthly_amount)})
                </button>
              )}
              <button onClick={addInvoice} disabled={loading||!invForm.amount} className="btn-primary w-full mt-3">Add Invoice</button>
            </div>
            <div>
              <p className="text-subhead font-semibold mb-2">History ({invoices.length})</p>
              {invoices.length===0 ? <p className="text-footnote text-ios-tertiary text-center py-4">No invoices yet</p> : (
                <div className="space-y-1.5">
                  {invoices.map(inv=>(
                    <div key={inv.id} className="flex items-center justify-between p-3 bg-ios-bg rounded-ios">
                      <p className="text-subhead font-semibold">{MONTHS_FULL[inv.month-1]} {inv.year}</p>
                      <div className="flex items-center gap-3">
                        <p className="text-subhead font-bold text-ios-green">{fmtCurrency(inv.amount)}</p>
                        <button onClick={()=>delInvoice(inv.id)} className="p-1.5 hover:bg-red-50 rounded-ios text-ios-tertiary hover:text-ios-red"><Trash2 className="w-3.5 h-3.5"/></button>
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
