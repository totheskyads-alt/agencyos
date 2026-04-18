'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { fmtDuration, fmtCurrency, fmtDate, parseUTC } from '@/lib/utils';
import { Download, BarChart3, TrendingUp, Users, Clock } from 'lucide-react';

const RANGES = [
  { key: 'today',      label: 'Azi' },
  { key: 'week',       label: 'Săptămâna' },
  { key: 'month',      label: 'Luna' },
  { key: 'last_month', label: 'Luna trecută' },
  { key: 'custom',     label: 'Custom' },
];

function getRange(key) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (key) {
    case 'today': return { from: today.toISOString(), to: new Date().toISOString() };
    case 'week':  { const d = new Date(today); d.setDate(today.getDate() - 6); return { from: d.toISOString(), to: new Date().toISOString() }; }
    case 'month': return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), to: new Date().toISOString() };
    case 'last_month': {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      return { from: s.toISOString(), to: e.toISOString() };
    }
    default: return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), to: new Date().toISOString() };
  }
}

function Bar({ value, max, color = 'bg-ios-blue' }) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return <div className="h-2 bg-ios-fill rounded-full overflow-hidden"><div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} /></div>;
}

export default function ReportsPage() {
  const [entries, setEntries] = useState([]);
  const [projects, setProjects] = useState([]);
  const [members, setMembers] = useState([]);
  const [clients, setClients] = useState([]);
  const [range, setRange] = useState('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [filterMember, setFilterMember] = useState('');
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('overview');

  useEffect(() => {
    supabase.from('projects').select('id, name, color, clients(name, monthly_budget, hourly_rate)').then(({ data }) => setProjects(data || []));
    supabase.from('profiles').select('id, full_name, email').then(({ data }) => setMembers(data || []));
    supabase.from('clients').select('id, name, monthly_budget, hourly_rate').then(({ data }) => setClients(data || []));
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    const { from, to } = range === 'custom' ? { from: customFrom + 'T00:00:00Z', to: customTo + 'T23:59:59Z' } : getRange(range);
    let q = supabase.from('time_entries')
      .select('*, profiles(full_name, email), projects(name, color, client_id, hourly_rate, clients(name, monthly_budget, hourly_rate)), tasks(title, task_type)')
      .not('end_time', 'is', null).gte('created_at', from).lte('created_at', to)
      .order('created_at', { ascending: false });
    if (filterProject) q = q.eq('project_id', filterProject);
    if (filterMember) q = q.eq('user_id', filterMember);
    const { data } = await q;
    setEntries(data || []);
    setLoading(false);
  }

  useEffect(() => { if (range !== 'custom') fetchData(); }, [range, filterProject, filterMember]);

  function exportExcel() {
    import('xlsx').then(XLSX => {
      const rows = entries.map(e => ({
        'Data': fmtDate(e.created_at),
        'Utilizator': e.profiles?.full_name || e.profiles?.email || '—',
        'Client': e.projects?.clients?.name || '—',
        'Proiect': e.projects?.name || '—',
        'Task': e.tasks?.title || '—',
        'Tip task': e.tasks?.task_type || '—',
        'Descriere': e.description || '—',
        'Durată (ore)': ((e.duration_seconds || 0) / 3600).toFixed(2),
        'Cost (€)': e.projects?.hourly_rate ? ((e.duration_seconds / 3600) * e.projects.hourly_rate).toFixed(2) : '—',
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Raport');
      XLSX.writeFile(wb, `agencyos_report_${range}.xlsx`);
    });
  }

  const totalSecs = entries.reduce((a, e) => a + (e.duration_seconds || 0), 0);
  const totalCost = entries.reduce((a, e) => {
    const rate = e.projects?.hourly_rate || e.projects?.clients?.hourly_rate || 0;
    return a + (e.duration_seconds / 3600) * rate;
  }, 0);

  // By project
  const byProject = {};
  entries.forEach(e => {
    const k = e.projects?.name || 'Fără proiect';
    if (!byProject[k]) byProject[k] = { secs: 0, color: e.projects?.color || '#007AFF' };
    byProject[k].secs += (e.duration_seconds || 0);
  });

  // By member
  const byMember = {};
  entries.forEach(e => {
    const k = e.profiles?.full_name || e.profiles?.email || 'Necunoscut';
    if (!byMember[k]) byMember[k] = 0;
    byMember[k] += (e.duration_seconds || 0);
  });

  // By client
  const byClient = {};
  entries.forEach(e => {
    const k = e.projects?.clients?.name || 'Fără client';
    if (!byClient[k]) byClient[k] = { secs: 0, budget: e.projects?.clients?.monthly_budget || 0, rate: e.projects?.clients?.hourly_rate || e.projects?.hourly_rate || 0 };
    byClient[k].secs += (e.duration_seconds || 0);
  });

  // By task type
  const byType = {};
  entries.forEach(e => {
    const k = e.tasks?.task_type || 'general';
    byType[k] = (byType[k] || 0) + (e.duration_seconds || 0);
  });

  const maxProj = Math.max(...Object.values(byProject).map(v => v.secs), 1);
  const maxMember = Math.max(...Object.values(byMember), 1);
  const maxClient = Math.max(...Object.values(byClient).map(v => v.secs), 1);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-title2 font-bold text-ios-primary">Rapoarte</h1>
          <p className="text-subhead text-ios-secondary">{entries.length} înregistrări</p>
        </div>
        {entries.length > 0 && (
          <button onClick={exportExcel} className="btn-secondary flex items-center gap-2">
            <Download className="w-4 h-4" /> Export Excel
          </button>
        )}
      </div>

      {/* Range selector */}
      <div className="card p-1 flex gap-0.5 overflow-x-auto">
        {RANGES.map(r => (
          <button key={r.key} onClick={() => setRange(r.key)}
            className={`px-3 py-1.5 rounded-ios text-footnote font-semibold whitespace-nowrap transition-all ${
              range === r.key ? 'bg-ios-blue text-white shadow-ios-sm' : 'text-ios-secondary hover:bg-ios-fill'
            }`}>{r.label}</button>
        ))}
      </div>

      {range === 'custom' && (
        <div className="card p-4 flex gap-3 flex-wrap">
          <div className="flex-1">
            <label className="input-label">De la</label>
            <input type="date" className="input" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
          </div>
          <div className="flex-1">
            <label className="input-label">Până la</label>
            <input type="date" className="input" value={customTo} onChange={e => setCustomTo(e.target.value)} />
          </div>
          <div className="flex items-end">
            <button onClick={fetchData} className="btn-primary">Aplică</button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <select className="input w-auto py-2 text-footnote" value={filterProject} onChange={e => setFilterProject(e.target.value)}>
          <option value="">Toate proiectele</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="input w-auto py-2 text-footnote" value={filterMember} onChange={e => setFilterMember(e.target.value)}>
          <option value="">Toată echipa</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
        </select>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total ore',     value: fmtDuration(totalSecs), icon: Clock,    color: 'text-ios-blue bg-blue-50' },
          { label: 'Înregistrări',  value: entries.length,          icon: BarChart3, color: 'text-ios-purple bg-purple-50' },
          { label: 'Cost estimat',  value: fmtCurrency(totalCost),  icon: TrendingUp, color: 'text-ios-green bg-green-50' },
          { label: 'Membri activi', value: Object.keys(byMember).length, icon: Users, color: 'text-ios-orange bg-orange-50' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card p-4">
            <div className={`w-9 h-9 rounded-ios flex items-center justify-center mb-3 ${color}`}>
              <Icon className="w-4 h-4" />
            </div>
            <p className="text-title3 font-bold text-ios-primary">{loading ? '...' : value}</p>
            <p className="text-footnote text-ios-secondary">{label}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-[3px] border-ios-blue border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          {/* By client (with profitability) */}
          <div className="card p-4">
            <p className="text-headline font-semibold text-ios-primary mb-4">Pe clienți</p>
            <div className="space-y-4">
              {Object.entries(byClient).sort((a,b) => b[1].secs - a[1].secs).map(([name, d]) => {
                const cost = (d.secs / 3600) * d.rate;
                const profit = d.budget > 0 ? d.budget - cost : null;
                const margin = profit !== null && d.budget > 0 ? Math.round((profit / d.budget) * 100) : null;
                return (
                  <div key={name}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-subhead font-semibold text-ios-primary">{name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-footnote text-ios-secondary">{fmtDuration(d.secs)}</span>
                        {margin !== null && (
                          <span className={`badge ${margin >= 50 ? 'badge-green' : margin >= 20 ? 'badge-orange' : 'badge-red'}`}>
                            {margin}%
                          </span>
                        )}
                      </div>
                    </div>
                    <Bar value={d.secs} max={maxClient} color="bg-ios-orange" />
                    {profit !== null && (
                      <p className="text-caption1 text-ios-secondary mt-1">
                        Cost: {fmtCurrency(cost)} · Profit: <span className={profit >= 0 ? 'text-ios-green' : 'text-ios-red'}>{fmtCurrency(profit)}</span>
                      </p>
                    )}
                  </div>
                );
              })}
              {Object.keys(byClient).length === 0 && <p className="text-subhead text-ios-tertiary text-center py-4">Nicio dată</p>}
            </div>
          </div>

          {/* By project */}
          <div className="card p-4">
            <p className="text-headline font-semibold text-ios-primary mb-4">Pe proiecte</p>
            <div className="space-y-3">
              {Object.entries(byProject).sort((a,b) => b[1].secs - a[1].secs).map(([name, d]) => (
                <div key={name}>
                  <div className="flex justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                      <span className="text-subhead font-medium text-ios-primary">{name}</span>
                    </div>
                    <span className="text-footnote text-ios-secondary">{fmtDuration(d.secs)}</span>
                  </div>
                  <Bar value={d.secs} max={maxProj} />
                </div>
              ))}
              {Object.keys(byProject).length === 0 && <p className="text-subhead text-ios-tertiary text-center py-4">Nicio dată</p>}
            </div>
          </div>

          {/* By member */}
          <div className="card p-4">
            <p className="text-headline font-semibold text-ios-primary mb-4">Pe membri</p>
            <div className="space-y-3">
              {Object.entries(byMember).sort((a,b) => b[1] - a[1]).map(([name, secs]) => (
                <div key={name}>
                  <div className="flex justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-ios-blue rounded-full flex items-center justify-center text-white text-caption2 font-bold">{name[0]}</div>
                      <span className="text-subhead font-medium text-ios-primary">{name}</span>
                    </div>
                    <span className="text-footnote text-ios-secondary">{fmtDuration(secs)}</span>
                  </div>
                  <Bar value={secs} max={maxMember} color="bg-ios-purple" />
                </div>
              ))}
              {Object.keys(byMember).length === 0 && <p className="text-subhead text-ios-tertiary text-center py-4">Nicio dată</p>}
            </div>
          </div>

          {/* Detailed table */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-ios-separator/50">
              <p className="text-headline font-semibold text-ios-primary">Detalii</p>
            </div>
            {entries.length === 0 ? (
              <div className="p-8 text-center text-ios-tertiary text-subhead">Nicio înregistrare</div>
            ) : (
              <div className="overflow-x-auto max-h-80">
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-ios-bg">
                    <tr>
                      {['Data','Utilizator','Proiect','Durată'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-caption1 font-semibold text-ios-secondary uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map(e => (
                      <tr key={e.id} className="border-t border-ios-separator/30 hover:bg-ios-bg">
                        <td className="px-4 py-2.5 text-footnote text-ios-secondary">{fmtDate(e.created_at)}</td>
                        <td className="px-4 py-2.5 text-footnote font-medium text-ios-primary">{e.profiles?.full_name?.split(' ')[0] || '—'}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full" style={{ background: e.projects?.color || '#007AFF' }} />
                            <span className="text-footnote">{e.projects?.name || '—'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-footnote font-semibold text-ios-blue">{fmtDuration(e.duration_seconds)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
