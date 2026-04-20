'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRole } from '@/lib/useRole';
import { fmtDuration, fmtCurrency, parseUTC } from '@/lib/utils';
import { Clock, Euro, TrendingUp, TrendingDown, Users, BarChart3, Lock } from 'lucide-react';

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const RANGES = [
  { key: 'today',   label: 'Today' },
  { key: '7days',   label: '7 days' },
  { key: '30days',  label: '30 days' },
  { key: '3months', label: '3 months' },
  { key: '1year',   label: 'This year' },
  { key: 'custom',  label: 'Custom' },
];

const CLIENT_TYPES = {
  direct:      { label: 'Direct',       color: '#007AFF' },
  whitelabel:  { label: 'White-label',  color: '#AF52DE' },
  colaborator: { label: 'Collaborator', color: '#FF9500' },
};

function MiniBar({ value, max, color }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="h-1.5 bg-ios-fill rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color || '#007AFF' }} />
    </div>
  );
}

function StatCard({ label, value, sub, icon: Icon, color }) {
  return (
    <div className="card p-4">
      <div className={`w-9 h-9 rounded-ios flex items-center justify-center mb-3 ${color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-title3 font-bold text-ios-primary">{value}</p>
      <p className="text-footnote text-ios-secondary">{label}</p>
      {sub && <p className="text-caption1 text-ios-tertiary mt-0.5">{sub}</p>}
    </div>
  );
}

export default function ReportsPage() {
  const { can, isManager } = useRole();
  const [range, setRange] = useState('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [activeSection, setActiveSection] = useState('time');
  const [entries, setEntries] = useState([]);
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [members, setMembers] = useState([]);
  const [billing, setBilling] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterMember, setFilterMember] = useState('');
  const [filterProject, setFilterProject] = useState('');

  useEffect(() => { loadMeta(); }, []);
  useEffect(() => { if (range !== 'custom' || customFrom) loadData(); }, [range, filterMember, filterProject, customFrom, customTo]);

  async function loadMeta() {
    const [{ data: proj }, { data: cli }, { data: mem }] = await Promise.all([
      supabase.from('projects').select('id,name,color,client_id,monthly_amount,billing_day,clients(name,client_type)').order('name'),
      supabase.from('clients').select('id,name,client_type').order('name'),
      supabase.from('profiles').select('id,full_name,email').order('full_name'),
    ]);
    setProjects(proj || []);
    setClients(cli || []);
    setMembers(mem || []);
  }

  function getDateFrom() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    switch (range) {
      case 'today':   return today.toISOString();
      case '7days':   return new Date(now.getTime() - 6 * 86400000).toISOString();
      case '30days':  return new Date(now.getTime() - 29 * 86400000).toISOString();
      case '3months': return new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString();
      case '1year':   return new Date(now.getFullYear(), 0, 1).toISOString();
      case 'custom':  return customFrom ? new Date(customFrom).toISOString() : new Date(now.getTime() - 29 * 86400000).toISOString();
      default:        return new Date(now.getTime() - 29 * 86400000).toISOString();
    }
  }

  async function loadData() {
    setLoading(true);
    const from = getDateFrom();
    let q = supabase.from('time_entries')
      .select('*, profiles(full_name,email), projects(id,name,color,client_id,monthly_amount,clients(name,client_type))')
      .not('end_time', 'is', null).gte('created_at', from).order('created_at');
    if (filterMember) q = q.eq('user_id', filterMember);
    if (filterProject) q = q.eq('project_id', filterProject);

    const [{ data: ent }, { data: bil }, { data: exp }] = await Promise.all([
      q,
      supabase.from('billing').select('*, clients(name,client_type)').order('year').order('month'),
      supabase.from('expenses').select('*').order('year').order('month'),
    ]);
    setEntries(ent || []);
    setBilling(bil || []);
    setExpenses(exp || []);
    setLoading(false);
  }

  // ── Computed values ──────────────────────────────────────────────────────
  const totalSecs = entries.reduce((a, e) => a + (e.duration_seconds || 0), 0);
  const from = getDateFrom();
  const filteredBilling = billing.filter(b => b.status === 'paid' && b.created_at && parseUTC(b.created_at) >= parseUTC(from));
  const totalPaid = filteredBilling.reduce((a, b) => a + (b.amount || 0), 0);
  const filteredExpenses = expenses.filter(e => e.date && new Date(e.date) >= parseUTC(from));
  const totalExpenses = filteredExpenses.reduce((a, e) => a + (e.amount || 0), 0);
  const netProfit = totalPaid - totalExpenses;
  const avgCph = totalSecs > 0 && totalPaid > 0 ? totalPaid / (totalSecs / 3600) : 0;

  // By project
  const byProject = {};
  entries.forEach(e => {
    const pid = e.project_id; if (!pid) return;
    if (!byProject[pid]) byProject[pid] = { project: e.projects, secs: 0, entries: 0 };
    byProject[pid].secs += (e.duration_seconds || 0);
    byProject[pid].entries++;
  });
  const projectList = Object.values(byProject).sort((a, b) => b.secs - a.secs);
  const maxSecs = Math.max(...projectList.map(p => p.secs), 1);

  // By member
  const byMember = {};
  entries.forEach(e => {
    const uid = e.user_id; if (!uid) return;
    if (!byMember[uid]) byMember[uid] = { profile: e.profiles, secs: 0 };
    byMember[uid].secs += (e.duration_seconds || 0);
  });
  const memberList = Object.values(byMember).sort((a, b) => b.secs - a.secs);
  const maxMemberSecs = Math.max(...memberList.map(m => m.secs), 1);

  // By client type
  const byType = {};
  entries.forEach(e => {
    const t = e.projects?.clients?.client_type || 'direct';
    if (!byType[t]) byType[t] = { secs: 0, projects: new Set() };
    byType[t].secs += (e.duration_seconds || 0);
    if (e.project_id) byType[t].projects.add(e.project_id);
  });

  // Monthly breakdown (last 6 months)
  const now = new Date();
  const months6 = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1, label: MONTHS_SHORT[d.getMonth()] };
  });
  const monthlyData = months6.map(m => {
    const secs = entries.filter(e => {
      const d = parseUTC(e.created_at);
      return d && d.getMonth() + 1 === m.month && d.getFullYear() === m.year;
    }).reduce((a, e) => a + (e.duration_seconds || 0), 0);
    const paid = billing.filter(b => b.status === 'paid' && b.month === m.month && b.year === m.year).reduce((a, b) => a + (b.amount || 0), 0);
    const exp = expenses.filter(e => e.month === m.month && e.year === m.year).reduce((a, e) => a + (e.amount || 0), 0);
    const cph = secs > 0 && paid > 0 ? paid / (secs / 3600) : 0;
    return { ...m, secs, paid, exp, cph };
  });

  const SECTIONS = [
    { key: 'time',     label: '⏱ Time',     show: true },
    { key: 'costph',   label: '€/hour',     show: isManager },
    { key: 'billing',  label: '💰 Billing',  show: can('canViewBilling') },
    { key: 'monthly',  label: '📅 Monthly',  show: isManager },
  ];

  if (!isManager) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Lock className="w-12 h-12 text-ios-label4" />
        <p className="text-title3 font-bold text-ios-primary">Reports — Manager & Admin only</p>
        <p className="text-subhead text-ios-secondary">Ask your Admin for access.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-title2 font-bold text-ios-primary">Reports</h1>
          <p className="text-subhead text-ios-secondary">Analytics & insights</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1.5 bg-ios-fill p-1 rounded-ios">
          {RANGES.map(r => (
            <button key={r.key} onClick={() => setRange(r.key)}
              className={`px-3 py-1.5 rounded-ios-sm text-footnote font-semibold transition-all whitespace-nowrap ${range === r.key ? 'bg-white text-ios-primary shadow-ios-sm' : 'text-ios-secondary'}`}>
              {r.label}
            </button>
          ))}
        </div>
        <select className="input py-2 text-footnote w-36" value={filterMember} onChange={e => setFilterMember(e.target.value)}>
          <option value="">All members</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
        </select>
        <select className="input py-2 text-footnote w-36" value={filterProject} onChange={e => setFilterProject(e.target.value)}>
          <option value="">All projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {/* Custom date range */}
      {range === 'custom' && (
        <div className="flex items-center gap-3 flex-wrap bg-blue-50 p-3 rounded-ios">
          <div className="flex items-center gap-2">
            <label className="text-footnote font-semibold text-ios-secondary">From</label>
            <input type="date" className="input py-1.5 text-footnote w-40" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-footnote font-semibold text-ios-secondary">To</label>
            <input type="date" className="input py-1.5 text-footnote w-40" value={customTo} onChange={e => setCustomTo(e.target.value)} />
          </div>
        </div>
      )}

      {/* Section tabs */}
      <div className="flex gap-0.5 bg-ios-fill p-1 rounded-ios overflow-x-auto">
        {SECTIONS.filter(s => s.show).map(s => (
          <button key={s.key} onClick={() => setActiveSection(s.key)}
            className={`flex-1 py-2 rounded-ios-sm text-footnote font-semibold whitespace-nowrap transition-all ${activeSection === s.key ? 'bg-white text-ios-primary shadow-ios-sm' : 'text-ios-secondary'}`}>
            {s.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-[3px] border-ios-blue border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* ── TIME SECTION ── */}
          {activeSection === 'time' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard label="Total hours" value={fmtDuration(totalSecs)} icon={Clock} color="text-ios-blue bg-blue-50" />
                <StatCard label="Projects tracked" value={projectList.length} icon={BarChart3} color="text-ios-orange bg-orange-50" />
                <StatCard label="Members tracked" value={memberList.length} icon={Users} color="text-ios-purple bg-purple-50" />
                <StatCard label="Avg per day" value={fmtDuration(totalSecs / Math.max(range==='7days'?7:range==='30days'?30:range==='3months'?90:365,1))} icon={Clock} color="text-ios-green bg-green-50" />
              </div>

              {/* By project */}
              <div className="card p-4">
                <p className="text-headline font-semibold mb-4">Time by project</p>
                {projectList.length === 0 ? <p className="text-footnote text-ios-tertiary text-center py-4">No data</p> : (
                  <div className="space-y-3">
                    {projectList.map(({ project, secs }) => (
                      <div key={project?.id}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ background: project?.color || '#007AFF' }} />
                            <span className="text-subhead font-medium">{project?.name}</span>
                            {project?.clients?.name && <span className="text-caption1 text-ios-secondary">· {project.clients.name}</span>}
                          </div>
                          <span className="text-footnote font-semibold text-ios-secondary">{fmtDuration(secs)}</span>
                        </div>
                        <MiniBar value={secs} max={maxSecs} color={project?.color} />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* By member */}
              {memberList.length > 1 && (
                <div className="card p-4">
                  <p className="text-headline font-semibold mb-4">Time by member</p>
                  <div className="space-y-3">
                    {memberList.map(({ profile, secs }) => {
                      const initials = (profile?.full_name || profile?.email || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);
                      return (
                        <div key={profile?.id || Math.random()}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 bg-ios-blue rounded-full flex items-center justify-center text-white text-[9px] font-bold">{initials}</div>
                              <span className="text-subhead font-medium">{profile?.full_name || profile?.email}</span>
                            </div>
                            <span className="text-footnote font-semibold text-ios-secondary">{fmtDuration(secs)}</span>
                          </div>
                          <MiniBar value={secs} max={maxMemberSecs} color="#007AFF" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* By client type */}
              <div className="grid lg:grid-cols-3 gap-3">
                {Object.entries(CLIENT_TYPES).map(([typeKey, typeInfo]) => {
                  const d = byType[typeKey] || { secs: 0, projects: new Set() };
                  return (
                    <div key={typeKey} className="card p-4">
                      <div className="w-2.5 h-2.5 rounded-full mb-2" style={{ background: typeInfo.color }} />
                      <p className="text-subhead font-semibold text-ios-primary">{typeInfo.label}</p>
                      <p className="text-title3 font-bold mt-1">{fmtDuration(d.secs)}</p>
                      <p className="text-caption1 text-ios-tertiary">{d.projects.size} projects</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── €/HOUR SECTION ── */}
          {activeSection === 'costph' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="Avg €/hour (overall)" value={avgCph > 0 ? `€${avgCph.toFixed(0)}/h` : '—'} icon={TrendingUp} color="text-ios-green bg-green-50"
                  sub={avgCph > 0 ? `${fmtCurrency(totalPaid)} ÷ ${fmtDuration(totalSecs)}` : 'No billing data'} />
                <StatCard label="Total hours billed" value={fmtDuration(totalSecs)} icon={Clock} color="text-ios-blue bg-blue-50" />
              </div>

              {/* €/h per project */}
              <div className="card overflow-hidden">
                <div className="px-4 py-3 border-b border-ios-separator/30">
                  <p className="text-headline font-semibold">€/hour by project</p>
                  <p className="text-footnote text-ios-secondary">Based on monthly contract value ÷ hours tracked</p>
                </div>
                <table className="w-full text-left">
                  <thead className="bg-ios-bg">
                    <tr>
                      {['Project','Client','Hours','Monthly Rate','€/hour'].map(h => (
                        <th key={h} className="px-4 py-3 text-caption1 font-semibold text-ios-secondary uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {projectList.map(({ project, secs }) => {
                      const monthly = project?.monthly_amount || 0;
                      const hours = secs / 3600;
                      const cph = hours > 0 && monthly > 0 ? monthly / hours : null;
                      return (
                        <tr key={project?.id} className="border-t border-ios-separator/20 hover:bg-ios-bg">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full" style={{ background: project?.color || '#007AFF' }} />
                              <span className="text-subhead font-semibold">{project?.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-footnote text-ios-secondary">{project?.clients?.name || '—'}</td>
                          <td className="px-4 py-3 text-subhead font-medium">{fmtDuration(secs)}</td>
                          <td className="px-4 py-3 text-footnote">{monthly > 0 ? fmtCurrency(monthly) : <span className="text-ios-tertiary">Not set</span>}</td>
                          <td className="px-4 py-3">
                            {cph ? (
                              <span className={`badge ${cph >= 80 ? 'badge-green' : cph >= 40 ? 'badge-orange' : 'badge-red'}`}>
                                €{cph.toFixed(0)}/h
                              </span>
                            ) : <span className="text-ios-tertiary text-footnote">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* €/h per client type */}
              <div className="card p-4">
                <p className="text-headline font-semibold mb-4">€/hour by client type</p>
                <div className="grid lg:grid-cols-3 gap-3">
                  {Object.entries(CLIENT_TYPES).map(([typeKey, typeInfo]) => {
                    const d = byType[typeKey] || { secs: 0 };
                    const typeBilled = filteredBilling.filter(b => (b.clients?.client_type || 'direct') === typeKey).reduce((a, b) => a + (b.amount || 0), 0);
                    const cph = d.secs > 0 && typeBilled > 0 ? typeBilled / (d.secs / 3600) : 0;
                    return (
                      <div key={typeKey} className="bg-ios-bg rounded-ios p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ background: typeInfo.color }} />
                          <span className="text-footnote font-semibold">{typeInfo.label}</span>
                        </div>
                        <p className="text-title3 font-bold">{cph > 0 ? `€${cph.toFixed(0)}/h` : '—'}</p>
                        <p className="text-caption1 text-ios-tertiary">{fmtDuration(d.secs)} tracked</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── BILLING SECTION ── */}
          {activeSection === 'billing' && can('canViewBilling') && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                <StatCard label="Collected" value={fmtCurrency(totalPaid)} icon={Euro} color="text-ios-green bg-green-50" />
                <StatCard label="Expenses" value={fmtCurrency(totalExpenses)} icon={TrendingDown} color="text-ios-red bg-red-50" />
                <StatCard label="Net profit" value={fmtCurrency(netProfit)} icon={TrendingUp}
                  color={netProfit >= 0 ? 'text-ios-green bg-green-50' : 'text-ios-red bg-red-50'} />
              </div>

              {/* Billing by client type */}
              <div className="grid lg:grid-cols-3 gap-3">
                {Object.entries(CLIENT_TYPES).map(([typeKey, typeInfo]) => {
                  const typePaid = filteredBilling.filter(b => (b.clients?.client_type || 'direct') === typeKey).reduce((a, b) => a + (b.amount || 0), 0);
                  const count = filteredBilling.filter(b => (b.clients?.client_type || 'direct') === typeKey).length;
                  return (
                    <div key={typeKey} className="card p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: typeInfo.color }} />
                        <span className="text-footnote font-semibold text-ios-secondary">{typeInfo.label}</span>
                      </div>
                      <p className="text-title3 font-bold text-ios-green">{fmtCurrency(typePaid)}</p>
                      <p className="text-caption1 text-ios-tertiary">{count} invoices paid</p>
                    </div>
                  );
                })}
              </div>

              {/* Invoices table */}
              <div className="card overflow-hidden">
                <div className="px-4 py-3 border-b border-ios-separator/30">
                  <p className="text-headline font-semibold">Paid invoices in period</p>
                </div>
                {filteredBilling.length === 0 ? (
                  <p className="text-center text-ios-tertiary text-subhead py-8">No paid invoices in this period</p>
                ) : (
                  <table className="w-full text-left">
                    <thead className="bg-ios-bg">
                      <tr>
                        {['Client','Type','Month','Amount'].map(h => (
                          <th key={h} className="px-4 py-3 text-caption1 font-semibold text-ios-secondary uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBilling.map(b => (
                        <tr key={b.id} className="border-t border-ios-separator/20 hover:bg-ios-bg">
                          <td className="px-4 py-3 text-subhead font-medium">{b.clients?.name || '—'}</td>
                          <td className="px-4 py-3">
                            {b.clients?.client_type && (
                              <span className="text-caption2 font-semibold px-2 py-0.5 rounded-full text-white"
                                style={{ background: CLIENT_TYPES[b.clients.client_type]?.color || '#888' }}>
                                {CLIENT_TYPES[b.clients.client_type]?.label || b.clients.client_type}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-footnote text-ios-secondary">{MONTHS_SHORT[(b.month||1)-1]} {b.year}</td>
                          <td className="px-4 py-3 text-subhead font-bold text-ios-green">{fmtCurrency(b.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* ── MONTHLY SECTION ── */}
          {activeSection === 'monthly' && (
            <div className="space-y-4">
              <div className="card overflow-hidden">
                <div className="px-4 py-3 border-b border-ios-separator/30">
                  <p className="text-headline font-semibold">Last 6 months overview</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-ios-bg">
                      <tr>
                        {['Month','Hours','Collected','Expenses','Net','€/hour'].map(h => (
                          <th key={h} className="px-4 py-3 text-caption1 font-semibold text-ios-secondary uppercase tracking-wide whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyData.map((m, i) => {
                        const net = m.paid - m.exp;
                        return (
                          <tr key={i} className="border-t border-ios-separator/20 hover:bg-ios-bg">
                            <td className="px-4 py-3 text-subhead font-bold">{m.label} {m.year !== now.getFullYear() ? m.year : ''}</td>
                            <td className="px-4 py-3 text-subhead">{m.secs > 0 ? fmtDuration(m.secs) : <span className="text-ios-tertiary">—</span>}</td>
                            <td className="px-4 py-3 text-subhead font-semibold text-ios-green">{m.paid > 0 ? fmtCurrency(m.paid) : <span className="text-ios-tertiary font-normal">—</span>}</td>
                            <td className="px-4 py-3 text-subhead text-ios-red">{m.exp > 0 ? fmtCurrency(m.exp) : <span className="text-ios-tertiary">—</span>}</td>
                            <td className="px-4 py-3">
                              {(m.paid > 0 || m.exp > 0) ? (
                                <span className={`text-subhead font-bold ${net >= 0 ? 'text-ios-green' : 'text-ios-red'}`}>{fmtCurrency(net)}</span>
                              ) : <span className="text-ios-tertiary">—</span>}
                            </td>
                            <td className="px-4 py-3">
                              {m.cph > 0 ? (
                                <span className={`badge ${m.cph >= 80 ? 'badge-green' : m.cph >= 40 ? 'badge-orange' : 'badge-red'}`}>€{m.cph.toFixed(0)}/h</span>
                              ) : <span className="text-ios-tertiary text-footnote">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Visual bars */}
              <div className="grid lg:grid-cols-2 gap-4">
                <div className="card p-4">
                  <p className="text-headline font-semibold mb-4">Hours per month</p>
                  <div className="flex items-end gap-2 h-28">
                    {monthlyData.map((m, i) => {
                      const max = Math.max(...monthlyData.map(d => d.secs), 1);
                      const h = Math.max((m.secs / max) * 96, m.secs > 0 ? 4 : 0);
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                          <div className="w-full bg-blue-100 rounded-t-ios transition-all" style={{ height: h }} title={fmtDuration(m.secs)} />
                          <span className="text-[9px] text-ios-tertiary">{m.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {can('canViewBilling') && (
                  <div className="card p-4">
                    <p className="text-headline font-semibold mb-4">Revenue per month</p>
                    <div className="flex items-end gap-2 h-28">
                      {monthlyData.map((m, i) => {
                        const max = Math.max(...monthlyData.map(d => d.paid), 1);
                        const h = Math.max((m.paid / max) * 96, m.paid > 0 ? 4 : 0);
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center gap-1">
                            <div className="w-full bg-green-100 rounded-t-ios transition-all" style={{ height: h }} title={fmtCurrency(m.paid)} />
                            <span className="text-[9px] text-ios-tertiary">{m.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
