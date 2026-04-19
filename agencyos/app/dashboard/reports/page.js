'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { fmtDuration, fmtCurrency, fmtDate, parseUTC } from '@/lib/utils';
import { Download, Settings2, TrendingUp, Euro, Clock, ChevronDown, Check, X } from 'lucide-react';

const MONTHS = ['Ian','Feb','Mar','Apr','Mai','Iun','Iul','Aug','Sep','Oct','Nov','Dec'];

const ALL_COLUMNS = [
  { key: 'client',        label: 'Client',             default: true },
  { key: 'type',          label: 'Tip client',         default: true },
  { key: 'project',       label: 'Proiect',            default: true },
  { key: 'hours',         label: 'Ore lucrate',        default: true },
  { key: 'billed',        label: 'Facturat (€)',       default: true },
  { key: 'cph',           label: '€/oră',              default: true },
  { key: 'entries',       label: 'Nr. înregistrări',   default: false },
  { key: 'billing_day',   label: 'Zi facturare',       default: false },
  { key: 'monthly_amt',   label: 'Sumă lunară',        default: false },
  { key: 'last_activity', label: 'Ultima activitate',  default: false },
];

const CLIENT_TYPES = {
  direct:      { label: 'Direct',      color: 'badge-blue' },
  whitelabel:  { label: 'White-label', color: 'badge-purple' },
  colaborator: { label: 'Colaborator', color: 'badge-orange' },
};

const RANGES = [
  { key: '7days',   label: 'Ultimele 7 zile' },
  { key: '14days',  label: 'Ultimele 14 zile' },
  { key: '30days',  label: 'Ultimele 30 zile' },
  { key: '3months', label: 'Ultimele 3 luni' },
  { key: '1year',   label: 'Ultimul an' },
  { key: 'custom',  label: 'Custom' },
];

const STORAGE_KEY = 'agencyos_report_cols';

function LineChart({ data, color = '#007AFF', formatVal }) {
  const pts = data.filter(d => d.value > 0);
  if (pts.length < 2) return (
    <div className="flex items-center justify-center h-24 text-ios-tertiary text-footnote">
      Date insuficiente
    </div>
  );
  const values = data.map(d => d.value);
  const max = Math.max(...values, 1);
  const W = 400, H = 90, PAD = 20;
  const points = data.map((d, i) => ({
    x: PAD + (i / (data.length - 1)) * (W - PAD * 2),
    y: d.value > 0 ? PAD + ((max - d.value) / max) * (H - PAD * 2) : H,
    ...d,
  }));
  const pathD = points.filter(p => p.value > 0).map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H + 20}`} className="w-full" style={{ minWidth: 240 }}>
        {[0, 0.5, 1].map(t => <line key={t} x1={PAD} x2={W-PAD} y1={PAD+t*(H-PAD*2)} y2={PAD+t*(H-PAD*2)} stroke="#F2F2F7" strokeWidth="1" />)}
        <path d={pathD} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => p.value > 0 && (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="4" fill="white" stroke={color} strokeWidth="2" />
            <text x={p.x} y={p.y - 8} textAnchor="middle" fontSize="9" fill={color} fontWeight="700">
              {formatVal ? formatVal(p.value) : p.value}
            </text>
            <text x={p.x} y={H + 14} textAnchor="middle" fontSize="9" fill="#AEAEB2">{p.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function BarGroup({ data, keys, colors }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.flatMap(d => keys.map(k => d[k] || 0)), 1);
  const barW = Math.max(6, Math.floor(60 / keys.length));
  return (
    <div className="w-full overflow-x-auto">
      <div className="flex items-end gap-1 h-28 min-w-0" style={{ minWidth: data.length * 50 }}>
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
            <div className="flex items-end gap-0.5 h-20">
              {keys.map((k, ki) => (
                <div key={k} className="rounded-t-ios-sm transition-all" title={`${k}: ${d[k]}`}
                  style={{ width: barW, height: `${Math.max((d[k]||0)/max*72, (d[k]||0) > 0 ? 3 : 0)}px`, background: colors[ki] }} />
              ))}
            </div>
            <span className="text-caption2 text-ios-tertiary whitespace-nowrap">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [members, setMembers] = useState([]);
  const [selProject, setSelProject] = useState('');
  const [selClient, setSelClient] = useState('');
  const [selMember, setSelMember] = useState('');
  const [selType, setSelType] = useState('');
  const [range, setRange] = useState('30days');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [entries, setEntries] = useState([]);
  const [billing, setBilling] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('table');
  const [showColPicker, setShowColPicker] = useState(false);
  const colPickerRef = useRef(null);

  // Load saved columns from localStorage
  const [activeCols, setActiveCols] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : ALL_COLUMNS.filter(c => c.default).map(c => c.key);
    } catch { return ALL_COLUMNS.filter(c => c.default).map(c => c.key); }
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(activeCols)); } catch {}
  }, [activeCols]);

  useEffect(() => {
    const handler = (e) => { if (colPickerRef.current && !colPickerRef.current.contains(e.target)) setShowColPicker(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => { loadMeta(); }, []);
  useEffect(() => { if (range !== 'custom') loadData(); }, [range, selProject, selClient, selMember, selType]);

  async function loadMeta() {
    const [{ data: proj }, { data: cli }, { data: mem }] = await Promise.all([
      supabase.from('projects').select('id, name, color, client_id, billing_day, monthly_amount, clients(name, client_type)').order('name'),
      supabase.from('clients').select('id, name, client_type').order('name'),
      supabase.from('profiles').select('id, full_name, email').order('full_name'),
    ]);
    setProjects(proj || []); setClients(cli || []); setMembers(mem || []);
  }

  function getDateRange() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    switch (range) {
      case '7days':   return { from: new Date(today.getTime() - 6*86400000).toISOString(), to: now.toISOString() };
      case '14days':  return { from: new Date(today.getTime() - 13*86400000).toISOString(), to: now.toISOString() };
      case '30days':  return { from: new Date(today.getTime() - 29*86400000).toISOString(), to: now.toISOString() };
      case '3months': return { from: new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString(), to: now.toISOString() };
      case '1year':   return { from: new Date(now.getFullYear() - 1, now.getMonth(), 1).toISOString(), to: now.toISOString() };
      case 'custom':  return { from: customFrom + 'T00:00:00Z', to: customTo + 'T23:59:59Z' };
      default:        return { from: new Date(today.getTime() - 29*86400000).toISOString(), to: now.toISOString() };
    }
  }

  async function loadData() {
    setLoading(true);
    const { from, to } = getDateRange();
    let q = supabase.from('time_entries')
      .select('*, profiles(full_name,email), projects(id,name,color,client_id,billing_day,monthly_amount,clients(name,client_type))')
      .not('end_time', 'is', null).gte('created_at', from).lte('created_at', to)
      .order('created_at', { ascending: true });
    if (selProject) q = q.eq('project_id', selProject);
    if (selMember) q = q.eq('user_id', selMember);

    let bq = supabase.from('billing').select('*, clients(name, client_type)').order('year').order('month');
    if (selClient) bq = bq.eq('client_id', selClient);

    const [{ data: ent }, { data: bil }] = await Promise.all([q, bq]);

    let filtered = ent || [];
    if (selType) filtered = filtered.filter(e => e.projects?.clients?.client_type === selType);
    if (selClient) filtered = filtered.filter(e => e.projects?.client_id === selClient);

    setEntries(filtered); setBilling(bil || []);
    setLoading(false);
  }

  function getMonths() {
    const { from } = getDateRange();
    const now = new Date();
    const months = [];
    let cur = new Date(new Date(from).getFullYear(), new Date(from).getMonth(), 1);
    while (cur <= now) {
      months.push({ year: cur.getFullYear(), month: cur.getMonth() + 1, label: MONTHS[cur.getMonth()] });
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
    return months.map(m => {
      const ent = entries.filter(e => { const d = parseUTC(e.created_at); return d && d.getMonth()+1 === m.month && d.getFullYear() === m.year; });
      const bil = billing.filter(b => b.month === m.month && b.year === m.year && b.status === 'paid');
      const secs = ent.reduce((a, e) => a + (e.duration_seconds || 0), 0);
      const hours = secs / 3600;
      const billed = bil.reduce((a, b) => a + (b.amount || 0), 0);
      // €/oră from monthly_amount of projects (not just billed)
      const projMonthly = [...new Set(ent.map(e => e.project_id))].reduce((a, pid) => {
        const proj = ent.find(e => e.project_id === pid)?.projects;
        return a + (proj?.monthly_amount || 0);
      }, 0);
      const cph = hours > 0 ? (projMonthly > 0 ? projMonthly / hours : billed > 0 ? billed / hours : 0) : 0;
      return { ...m, secs, hours, billed, cph, entryCount: ent.length, projMonthly };
    });
  }

  function getTableData() {
    const map = {};
    entries.forEach(e => {
      const pid = e.project_id; if (!pid) return;
      if (!map[pid]) map[pid] = {
        id: pid, project: e.projects?.name || '—', client: e.projects?.clients?.name || '—',
        client_type: e.projects?.clients?.client_type || 'direct',
        client_id: e.projects?.client_id, color: e.projects?.color || '#007AFF',
        billing_day: e.projects?.billing_day, monthly_amt: e.projects?.monthly_amount,
        secs: 0, entries: 0, lastActivity: null, billed: 0,
      };
      map[pid].secs += (e.duration_seconds || 0);
      map[pid].entries++;
      if (!map[pid].lastActivity || e.created_at > map[pid].lastActivity) map[pid].lastActivity = e.created_at;
    });
    billing.filter(b => b.status === 'paid').forEach(b => {
      Object.values(map).forEach(p => { if (p.client_id === b.client_id) p.billed += (b.amount || 0); });
    });
    return Object.values(map).map(p => ({
      ...p, hours: p.secs / 3600,
      // €/oră: use monthly_amount if set, else use billed
      cph: p.secs > 0 ? ((p.monthly_amt || p.billed) / (p.secs / 3600)) : null,
    })).sort((a, b) => b.hours - a.hours);
  }

  // Group by client type
  function getByType() {
    const byType = { direct: [], whitelabel: [], colaborator: [] };
    getTableData().forEach(p => {
      const t = p.client_type || 'direct';
      if (byType[t]) byType[t].push(p);
    });
    return byType;
  }

  const monthlyData = getMonths();
  const tableData = getTableData();
  const byType = getByType();
  const totalSecs = entries.reduce((a, e) => a + (e.duration_seconds || 0), 0);
  const totalBilled = billing.filter(b => b.status === 'paid').reduce((a, b) => a + (b.amount || 0), 0);
  const totalMonthly = [...new Set(entries.map(e => e.project_id))].reduce((a, pid) => {
    const proj = entries.find(e => e.project_id === pid)?.projects;
    return a + (proj?.monthly_amount || 0);
  }, 0);
  const avgCph = totalSecs > 0 && (totalMonthly || totalBilled) > 0 ? (totalMonthly || totalBilled) / (totalSecs / 3600) : 0;

  function toggleCol(key) {
    setActiveCols(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }

  function exportExcel() {
    import('xlsx').then(XLSX => {
      const colMap = Object.fromEntries(ALL_COLUMNS.map(c => [c.key, c.label]));
      const rows = tableData.map(p => {
        const row = {};
        activeCols.forEach(key => {
          if (key === 'client') row['Client'] = p.client;
          else if (key === 'type') row['Tip'] = CLIENT_TYPES[p.client_type]?.label || p.client_type;
          else if (key === 'project') row['Proiect'] = p.project;
          else if (key === 'hours') row['Ore'] = p.hours.toFixed(2);
          else if (key === 'billed') row['Facturat (€)'] = p.billed;
          else if (key === 'cph') row['€/oră'] = p.cph ? p.cph.toFixed(2) : '';
          else if (key === 'entries') row['Înregistrări'] = p.entries;
          else if (key === 'billing_day') row['Zi facturare'] = p.billing_day ? `Ziua ${p.billing_day}` : '';
          else if (key === 'monthly_amt') row['Sumă lunară'] = p.monthly_amt || '';
          else if (key === 'last_activity') row['Ultima activitate'] = p.lastActivity ? fmtDate(p.lastActivity) : '';
        });
        return row;
      });
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Proiecte');
      const monthRows = monthlyData.map(m => ({ 'Lună': m.label, 'Ore': m.hours.toFixed(2), 'Facturat': m.billed, '€/oră': m.cph ? m.cph.toFixed(2) : '' }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(monthRows), 'Lunar');
      XLSX.writeFile(wb, `agencyos_raport.xlsx`);
    });
  }

  const colMap = Object.fromEntries(ALL_COLUMNS.map(c => [c.key, c.label]));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-title2 font-bold text-ios-primary">Rapoarte</h1>
          <p className="text-subhead text-ios-secondary">Analiză avansată</p>
        </div>
        <div className="flex gap-2">
          <div className="relative" ref={colPickerRef}>
            <button onClick={() => setShowColPicker(!showColPicker)} className="btn-secondary flex items-center gap-2">
              <Settings2 className="w-4 h-4" /> Coloane
            </button>
            {showColPicker && (
              <div className="absolute right-0 top-full mt-2 bg-white rounded-ios-lg shadow-ios-modal border border-ios-separator/30 p-3 z-50 w-56">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-footnote font-semibold text-ios-secondary uppercase tracking-wide">Coloane vizibile</p>
                  <button onClick={() => setShowColPicker(false)}><X className="w-4 h-4 text-ios-tertiary" /></button>
                </div>
                {ALL_COLUMNS.map(col => (
                  <button key={col.key} onClick={() => toggleCol(col.key)}
                    className="flex items-center justify-between w-full px-2 py-2 rounded-ios hover:bg-ios-fill text-left transition-colors">
                    <span className="text-subhead text-ios-primary">{col.label}</span>
                    {activeCols.includes(col.key) && <Check className="w-4 h-4 text-ios-blue" strokeWidth={2.5} />}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={exportExcel} className="btn-secondary flex items-center gap-2">
            <Download className="w-4 h-4" /> Excel
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 space-y-3">
        {/* Range pills */}
        <div className="flex gap-1.5 flex-wrap">
          {RANGES.map(r => (
            <button key={r.key} onClick={() => setRange(r.key)}
              className={`px-3 py-1.5 rounded-ios text-footnote font-semibold transition-all whitespace-nowrap ${range === r.key ? 'bg-ios-blue text-white' : 'bg-ios-fill text-ios-secondary hover:bg-ios-fill2'}`}>
              {r.label}
            </button>
          ))}
        </div>
        {range === 'custom' && (
          <div className="flex gap-3 flex-wrap">
            <div className="flex-1"><label className="input-label">De la</label><input type="date" className="input" value={customFrom} onChange={e => setCustomFrom(e.target.value)} /></div>
            <div className="flex-1"><label className="input-label">Până la</label><input type="date" className="input" value={customTo} onChange={e => setCustomTo(e.target.value)} /></div>
            <div className="flex items-end"><button onClick={loadData} className="btn-primary">Aplică</button></div>
          </div>
        )}
        <div className="flex gap-2 flex-wrap">
          {/* Type filter */}
          <div className="relative">
            <select className="input appearance-none pr-8 py-2 text-footnote w-44" value={selType} onChange={e => setSelType(e.target.value)}>
              <option value="">Toate tipurile</option>
              {Object.entries(CLIENT_TYPES).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ios-tertiary pointer-events-none" />
          </div>
          <div className="relative">
            <select className="input appearance-none pr-8 py-2 text-footnote w-44" value={selClient} onChange={e => { setSelClient(e.target.value); setSelProject(''); }}>
              <option value="">Toți clienții</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ios-tertiary pointer-events-none" />
          </div>
          <div className="relative">
            <select className="input appearance-none pr-8 py-2 text-footnote w-44" value={selProject} onChange={e => setSelProject(e.target.value)}>
              <option value="">Toate proiectele</option>
              {projects.filter(p => !selClient || p.client_id === selClient).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ios-tertiary pointer-events-none" />
          </div>
          <div className="relative">
            <select className="input appearance-none pr-8 py-2 text-footnote w-44" value={selMember} onChange={e => setSelMember(e.target.value)}>
              <option value="">Toată echipa</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ios-tertiary pointer-events-none" />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-[3px] border-ios-blue border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Total ore', value: fmtDuration(totalSecs), icon: Clock, color: 'text-ios-blue bg-blue-50' },
              { label: 'Încasat', value: totalBilled > 0 ? fmtCurrency(totalBilled) : '—', icon: Euro, color: 'text-ios-green bg-green-50' },
              { label: '€/oră mediu', value: avgCph > 0 ? `€${avgCph.toFixed(0)}/h` : '—', icon: TrendingUp, color: 'text-ios-orange bg-orange-50' },
              { label: 'Proiecte active', value: tableData.length, icon: TrendingUp, color: 'text-ios-purple bg-purple-50' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="card p-4">
                <div className={`w-9 h-9 rounded-ios flex items-center justify-center mb-3 ${color}`}><Icon className="w-4 h-4" /></div>
                <p className="text-title3 font-bold text-ios-primary">{value}</p>
                <p className="text-footnote text-ios-secondary">{label}</p>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex gap-0.5 bg-ios-fill p-1 rounded-ios overflow-x-auto">
            {[['table','Tabel'],['bytype','Pe tip client'],['evolution','Evoluție'],['monthly','Lunar']].map(([k,v]) => (
              <button key={k} onClick={() => setTab(k)}
                className={`flex-1 py-2 rounded-ios-sm text-footnote font-semibold transition-all whitespace-nowrap ${tab === k ? 'bg-white text-ios-primary shadow-ios-sm' : 'text-ios-secondary'}`}>{v}</button>
            ))}
          </div>

          {/* Table */}
          {tab === 'table' && (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-ios-bg border-b border-ios-separator/30">
                    <tr>
                      {activeCols.map(key => (
                        <th key={key} className="px-4 py-3 text-caption1 font-semibold text-ios-secondary uppercase tracking-wide whitespace-nowrap">{colMap[key]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tableData.length === 0 ? (
                      <tr><td colSpan={activeCols.length} className="px-4 py-8 text-center text-ios-tertiary text-subhead">Nicio dată în perioada selectată</td></tr>
                    ) : tableData.map(p => (
                      <tr key={p.id} className="border-t border-ios-separator/20 hover:bg-ios-bg">
                        {activeCols.includes('client') && <td className="px-4 py-3 text-subhead font-medium">{p.client}</td>}
                        {activeCols.includes('type') && (
                          <td className="px-4 py-3">
                            <span className={`badge ${CLIENT_TYPES[p.client_type]?.color || 'badge-gray'}`}>
                              {CLIENT_TYPES[p.client_type]?.label || p.client_type}
                            </span>
                          </td>
                        )}
                        {activeCols.includes('project') && (
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                              <span className="text-subhead font-semibold">{p.project}</span>
                            </div>
                          </td>
                        )}
                        {activeCols.includes('hours') && <td className="px-4 py-3 text-subhead font-semibold">{p.hours.toFixed(1)}h</td>}
                        {activeCols.includes('billed') && (
                          <td className="px-4 py-3 text-subhead font-bold text-ios-green">
                            {p.billed > 0 ? fmtCurrency(p.billed) : <span className="text-ios-tertiary font-normal">—</span>}
                          </td>
                        )}
                        {activeCols.includes('cph') && (
                          <td className="px-4 py-3">
                            {p.cph ? <span className={`badge ${p.cph >= 100 ? 'badge-green' : p.cph >= 50 ? 'badge-orange' : 'badge-red'}`}>€{p.cph.toFixed(0)}/h</span>
                              : <span className="text-ios-tertiary text-footnote">—</span>}
                          </td>
                        )}
                        {activeCols.includes('entries') && <td className="px-4 py-3 text-footnote text-ios-secondary">{p.entries}</td>}
                        {activeCols.includes('billing_day') && <td className="px-4 py-3 text-footnote text-ios-secondary">{p.billing_day ? `Ziua ${p.billing_day}` : '—'}</td>}
                        {activeCols.includes('monthly_amt') && <td className="px-4 py-3 text-footnote text-ios-secondary">{p.monthly_amt ? fmtCurrency(p.monthly_amt) : '—'}</td>}
                        {activeCols.includes('last_activity') && <td className="px-4 py-3 text-footnote text-ios-secondary">{p.lastActivity ? fmtDate(p.lastActivity) : '—'}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* By type */}
          {tab === 'bytype' && (
            <div className="space-y-4">
              {Object.entries(CLIENT_TYPES).map(([typeKey, typeInfo]) => {
                const items = byType[typeKey] || [];
                if (items.length === 0) return null;
                const typeSecs = items.reduce((a, p) => a + p.secs, 0);
                const typeBilled = items.reduce((a, p) => a + p.billed, 0);
                const typeMonthly = items.reduce((a, p) => a + (p.monthly_amt || 0), 0);
                const typeCph = typeSecs > 0 && (typeMonthly || typeBilled) > 0 ? (typeMonthly || typeBilled) / (typeSecs / 3600) : 0;
                return (
                  <div key={typeKey} className="card overflow-hidden">
                    <div className="px-4 py-3 border-b border-ios-separator/50 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`badge ${typeInfo.color}`}>{typeInfo.label}</span>
                        <span className="text-footnote text-ios-secondary">{items.length} proiecte</span>
                      </div>
                      <div className="flex gap-4 text-footnote text-ios-secondary">
                        <span>{fmtDuration(typeSecs)}</span>
                        {typeBilled > 0 && <span className="text-ios-green font-semibold">{fmtCurrency(typeBilled)}</span>}
                        {typeCph > 0 && <span className="text-ios-orange font-semibold">€{typeCph.toFixed(0)}/h</span>}
                      </div>
                    </div>
                    {items.map(p => (
                      <div key={p.id} className="list-row">
                        <div className="w-2 h-2 rounded-full mr-3" style={{ background: p.color }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-subhead font-semibold text-ios-primary">{p.project}</p>
                          <p className="text-caption1 text-ios-secondary">{p.client}</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-footnote text-ios-secondary">{p.hours.toFixed(1)}h</span>
                          {p.billed > 0 && <span className="text-footnote font-semibold text-ios-green">{fmtCurrency(p.billed)}</span>}
                          {p.cph && <span className={`badge ${p.cph >= 100 ? 'badge-green' : p.cph >= 50 ? 'badge-orange' : 'badge-red'}`}>€{p.cph.toFixed(0)}/h</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}

              {/* Comparison chart */}
              <div className="card p-4">
                <p className="text-headline font-semibold mb-4">Comparație tipuri — Ore lucrate</p>
                <div className="grid grid-cols-3 gap-3">
                  {Object.entries(CLIENT_TYPES).map(([typeKey, typeInfo]) => {
                    const items = byType[typeKey] || [];
                    const secs = items.reduce((a, p) => a + p.secs, 0);
                    const billed = items.reduce((a, p) => a + p.billed, 0);
                    const monthly = items.reduce((a, p) => a + (p.monthly_amt || 0), 0);
                    const cph = secs > 0 && (monthly || billed) ? (monthly || billed) / (secs / 3600) : 0;
                    return (
                      <div key={typeKey} className={`p-3 rounded-ios-lg border-2 ${items.length > 0 ? 'border-ios-separator/50 bg-ios-bg' : 'border-dashed border-ios-separator'}`}>
                        <span className={`badge ${typeInfo.color} mb-2`}>{typeInfo.label}</span>
                        <p className="text-headline font-bold text-ios-primary mt-2">{fmtDuration(secs)}</p>
                        {billed > 0 && <p className="text-footnote text-ios-green font-semibold">{fmtCurrency(billed)}</p>}
                        {cph > 0 && <p className="text-caption1 text-ios-orange">€{cph.toFixed(0)}/h</p>}
                        {items.length === 0 && <p className="text-footnote text-ios-tertiary">Niciun proiect</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Evolution */}
          {tab === 'evolution' && (
            <div className="space-y-4">
              <div className="card p-4">
                <p className="text-headline font-semibold mb-1">Evoluție €/oră</p>
                <p className="text-footnote text-ios-secondary mb-4">Calculat din suma lunară a proiectelor</p>
                <LineChart color="#34C759" formatVal={v => `€${v.toFixed(0)}`}
                  data={monthlyData.map(m => ({ label: m.label, value: parseFloat(m.cph.toFixed(1)) }))} />
              </div>
              <div className="card p-4">
                <p className="text-headline font-semibold mb-1">Evoluție încasat (€)</p>
                <p className="text-footnote text-ios-secondary mb-4">Facturi plătite per lună</p>
                <LineChart color="#FF9500" formatVal={v => `€${v}`}
                  data={monthlyData.map(m => ({ label: m.label, value: m.billed }))} />
              </div>
              <div className="card p-4">
                <p className="text-headline font-semibold mb-1">Evoluție ore lucrate</p>
                <LineChart color="#007AFF" formatVal={v => `${v}h`}
                  data={monthlyData.map(m => ({ label: m.label, value: parseFloat(m.hours.toFixed(1)) }))} />
              </div>
            </div>
          )}

          {/* Monthly */}
          {tab === 'monthly' && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-ios-separator/50">
                <p className="text-headline font-semibold">Detalii lunare</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-ios-bg">
                    <tr>
                      {['Lună','Ore lucrate','Încasat (€)','€/oră','Înregistrări'].map(h => (
                        <th key={h} className="px-4 py-3 text-caption1 font-semibold text-ios-secondary uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyData.map((m, i) => (
                      <tr key={i} className="border-t border-ios-separator/20 hover:bg-ios-bg">
                        <td className="px-4 py-3 text-subhead font-bold">{m.label}</td>
                        <td className="px-4 py-3 text-subhead">{m.hours > 0 ? `${m.hours.toFixed(1)}h` : <span className="text-ios-tertiary">—</span>}</td>
                        <td className="px-4 py-3 text-subhead font-bold text-ios-green">{m.billed > 0 ? fmtCurrency(m.billed) : <span className="text-ios-tertiary font-normal">—</span>}</td>
                        <td className="px-4 py-3">{m.cph > 0 ? <span className="badge badge-green">€{m.cph.toFixed(0)}/h</span> : <span className="text-ios-tertiary text-footnote">—</span>}</td>
                        <td className="px-4 py-3 text-footnote text-ios-secondary">{m.entryCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
