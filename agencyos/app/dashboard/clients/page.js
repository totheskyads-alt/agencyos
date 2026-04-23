'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/Modal';
import { useRole } from '@/lib/useRole';
import { getProjectAccess, visibleClientIdsFromProjects } from '@/lib/projectAccess';
import { fmtDuration, fmtCurrency } from '@/lib/utils';
import { Plus, Search, ChevronRight, Mail, Phone } from 'lucide-react';

const CLIENT_TYPES = {
  direct:      { label: 'Direct',      color: 'badge-blue',   bg: 'bg-blue-50 text-ios-blue' },
  whitelabel:  { label: 'White-label', color: 'badge-purple', bg: 'bg-purple-50 text-ios-purple' },
  colaborator: { label: 'Collaborator',color: 'badge-orange', bg: 'bg-orange-50 text-ios-orange' },
};

const empty = { name: '', company: '', email: '', phone: '', notes: '', client_type: 'direct' };

export default function ClientsPage() {
  const [clients, setClients] = useState([]);
  const [clientStats, setClientStats] = useState({});
  const [clientRevenue, setClientRevenue] = useState({});
  const [access, setAccess] = useState(null);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [modal, setModal] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(empty);
  const [loading, setLoading] = useState(false);
  const { can } = useRole();
  const canManageClients = can('canManageClients');

  useEffect(() => { load(); }, []);

  async function load() {
    const accessInfo = await getProjectAccess();
    setAccess(accessInfo);

    let visibleProjectIds = accessInfo.projectIds;
    let visibleClientIds = null;
    if (accessInfo.isRestricted) {
      if (visibleProjectIds.length === 0) {
        setClients([]);
        setClientStats({});
        setClientRevenue({});
        return;
      }
      const { data: visibleProjects } = await supabase
        .from('projects')
        .select('id, client_id')
        .in('id', visibleProjectIds);
      visibleClientIds = visibleClientIdsFromProjects(visibleProjects || []);
    }

    let clientQuery = supabase.from('clients').select('*').order('name');
    if (accessInfo.isRestricted) {
      if (visibleClientIds.length === 0) {
        setClients([]);
        setClientStats({});
        setClientRevenue({});
        return;
      }
      clientQuery = clientQuery.in('id', visibleClientIds);
    }
    const { data } = await clientQuery;
    setClients(data || []);

    // Time stats this month
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    let entriesQuery = supabase.from('time_entries')
      .select('duration_seconds, created_at, projects(client_id)')
      .not('end_time','is',null).gte('created_at', monthStart);
    if (accessInfo.isRestricted) entriesQuery = entriesQuery.in('project_id', visibleProjectIds);
    const { data: entries } = await entriesQuery;
    const stats = {};
    (entries||[]).forEach(e => {
      const cid = e.projects?.client_id; if (!cid) return;
      if (!stats[cid]) stats[cid] = 0;
      stats[cid] += (e.duration_seconds||0);
    });
    setClientStats(stats);

    // Revenue from billing (paid invoices this year)
    const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString();
    let billingQuery = supabase.from('billing')
      .select('client_id, amount').eq('status','paid').gte('created_at', yearStart);
    if (accessInfo.isRestricted) billingQuery = billingQuery.in('client_id', visibleClientIds);
    const { data: bills } = await billingQuery;
    const rev = {};
    (bills||[]).forEach(b => { rev[b.client_id] = (rev[b.client_id]||0) + (b.amount||0); });
    setClientRevenue(rev);
  }

  function openAdd() { if (!canManageClients) return; setForm(empty); setSelected(null); setModal(true); }
  function openEdit(c) {
    if (!canManageClients) return;
    setForm({ name: c.name, company: c.company||'', email: c.email||'', phone: c.phone||'', notes: c.notes||'', client_type: c.client_type||'direct' });
    setSelected(c); setModal(true);
  }

  async function save() {
    setLoading(true);
    if (selected) await supabase.from('clients').update(form).eq('id', selected.id);
    else await supabase.from('clients').insert(form);
    setModal(false); setLoading(false); load();
  }

  async function del(id) {
    if (!confirm('Delete this client?')) return;
    await supabase.from('clients').delete().eq('id', id);
    setModal(false); load();
  }

  const filtered = clients.filter(c => {
    if (filterType && (c.client_type||'direct') !== filterType) return false;
    if (search && !c.name?.toLowerCase().includes(search.toLowerCase()) && !c.company?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const byType = { direct:[], whitelabel:[], colaborator:[] };
  filtered.forEach(c => { const t = c.client_type||'direct'; if (byType[t]) byType[t].push(c); });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-title2 font-bold text-ios-primary">Clients</h1>
          <p className="text-subhead text-ios-secondary">{clients.length} clients</p>
        </div>
        {canManageClients && (
          <button onClick={openAdd} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" strokeWidth={2.5} /> New Client
          </button>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-tertiary" />
          <input className="input pl-10" placeholder="Search clients..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1.5">
          {[['','All'], ...Object.entries(CLIENT_TYPES).map(([k,v]) => [k,v.label])].map(([k,v]) => (
            <button key={k} onClick={() => setFilterType(k)}
              className={`px-3 py-2 rounded-ios text-footnote font-semibold transition-all whitespace-nowrap ${filterType===k ? 'bg-ios-blue text-white' : 'bg-ios-fill text-ios-secondary'}`}>
              {v}
            </button>
          ))}
        </div>
      </div>

      {Object.entries(CLIENT_TYPES).map(([typeKey, typeInfo]) => {
        const items = filterType ? (filterType===typeKey ? filtered : []) : byType[typeKey];
        if (items.length === 0) return null;
        return (
          <div key={typeKey}>
            <div className="flex items-center gap-2 mb-2 px-1">
              <span className={`badge ${typeInfo.color}`}>{typeInfo.label}</span>
              <span className="text-caption1 text-ios-tertiary">{items.length}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map(c => (
                <div key={c.id} className={`card p-4 transition-shadow ${canManageClients ? 'hover:shadow-ios-lg cursor-pointer' : ''}`} onClick={() => openEdit(c)}>
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
                    {clientStats[c.id] > 0 && <span className="badge badge-blue">{fmtDuration(clientStats[c.id])} this month</span>}
                    {clientRevenue[c.id] > 0 && <span className="badge badge-green">{fmtCurrency(clientRevenue[c.id])} this year</span>}
                  </div>
                  {(c.email || c.phone) && (
                    <div className="mt-2 pt-2 border-t border-ios-separator/50 flex gap-3">
                      {c.email && <div className="flex items-center gap-1 text-caption1 text-ios-secondary truncate"><Mail className="w-3 h-3 shrink-0" />{c.email}</div>}
                    </div>
                  )}
                  <div className="mt-3 pt-2 border-t border-ios-separator/30 flex gap-2" onClick={e => e.stopPropagation()}>
                    <a href={`/dashboard/projects?client=${c.id}`}
                      className="flex-1 text-center py-1.5 rounded-ios bg-ios-fill text-caption1 font-semibold text-ios-secondary hover:bg-ios-fill2 transition-colors">
                      Projects →
                    </a>
                    <a href={`/dashboard/tasks?client=${c.id}&mode=list`}
                      className="flex-1 text-center py-1.5 rounded-ios bg-blue-50 text-caption1 font-semibold text-ios-blue hover:bg-blue-100 transition-colors">
                      Tasks →
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {filtered.length === 0 && (
        <div className="card p-12 text-center">
          <p className="text-headline font-semibold text-ios-secondary mb-4">{access?.isRestricted ? 'No clients from assigned projects yet' : 'No clients yet'}</p>
          {canManageClients && <button onClick={openAdd} className="btn-primary">Add Client</button>}
        </div>
      )}

      {modal && (
        <Modal title={selected ? 'Edit Client' : 'New Client'} onClose={() => setModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="input-label">Client Type</label>
              <div className="flex gap-2">
                {Object.entries(CLIENT_TYPES).map(([k,v]) => (
                  <button key={k} onClick={() => setForm({...form, client_type: k})}
                    className={`flex-1 py-2 rounded-ios text-footnote font-semibold transition-all ${form.client_type===k ? 'bg-ios-blue text-white' : 'bg-ios-fill text-ios-secondary'}`}>
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="input-label">Name *</label><input className="input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
              <div className="col-span-2"><label className="input-label">Company</label><input className="input" value={form.company} onChange={e => setForm({...form, company: e.target.value})} /></div>
              <div><label className="input-label">Email</label><input className="input" type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} /></div>
              <div><label className="input-label">Phone</label><input className="input" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} /></div>
              <div className="col-span-2"><label className="input-label">Notes</label><textarea className="input" rows={2} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} /></div>
            </div>
            <div className="flex gap-3 pt-2">
              {selected && <button className="btn-danger" onClick={() => del(selected.id)}>Delete</button>}
              <button className="btn-secondary flex-1" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn-primary flex-1" onClick={save} disabled={loading || !form.name}>{loading ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
