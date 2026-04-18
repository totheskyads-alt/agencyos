'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { fmtDuration, fmtCurrency, fmtDate, parseUTC } from '@/lib/utils';
import { Download, Settings2, TrendingUp, Euro, Clock, ChevronDown, Check } from 'lucide-react';

const MONTHS = ['Ian','Feb','Mar','Apr','Mai','Iun','Iul','Aug','Sep','Oct','Nov','Dec'];

// All available columns
const ALL_COLUMNS = [
  { key: 'client',        label: 'Client',           default: true },
  { key: 'project',       label: 'Proiect',          default: true },
  { key: 'hours',         label: 'Ore lucrate',      default: true },
  { key: 'billed',        label: 'Facturat (€)',     default: true },
  { key: 'cph',           label: '€/oră',            default: true },
  { key: 'entries',       label: 'Nr. înregistrări', default: false },
  { key: 'billing_day',   label: 'Zi facturare',     default: false },
  { key: 'monthly_amt',   label: 'Sumă lunară',      default: false },
  { key: 'last_activity', label: 'Ultima activitate',default: false },
  { key: 'margin',        label: 'Marjă profit',     default: false },
];

const RANGES = [
  { key: '3months',  label: '3 luni' },
  { key: '6months',  label: '6 luni' },
  { key: '12months', label: '12 luni' },
  { key: 'custom',   label: 'Custom' },
];

function LineChart({ data, color = '#007AFF' }) {
  if (!data || data.filter(d => d.value > 0).length < 2) return (
    <div className="flex items-center justify-center h-24 text-ios-tertiary text-footnote">
      Date insuficiente pentru grafic
    </div>
  );
  const values = data.map(d => d.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values.filter(v => v > 0), 0);
  const range = max - min || 1;
  const W = 400, H = 90, PAD = 20;
  const pts = data.map((d, i) => ({
    x: PAD + (i / (data.length - 1)) * (W - PAD * 2),
    y: d.value > 0 ? PAD + ((max - d.value) / range) * (H - PAD * 2) : H,
    ...d,
  }));
  const pathD = pts.filter(p => p.value > 0).map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H + 20}`} className="w-full" style={{ minWidth: 240 }}>
        {[0, 0.5, 1].map(t => <line key={t} x1={PAD} x2={W-PAD} y1={PAD+t*(H-PAD*2)} y2={PAD+t*(H-PAD*2)} stroke="#F2F2F7" strokeWidth="1" />)}
        <path d={pathD} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p, i) => p.value > 0 && (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="4" fill="white" stroke={color} strokeWidth="2" />
            <text x={p.x} y={p.y - 8} textAnchor="middle" fontSize="9" fill={color} fontWeight="700">{p.displayValue}</text>
            <text x={p.x} y={H + 14} textAnchor="middle" fontSize="9" fill="#AEAEB2">{p.label}</text>
          </g>
        ))}
      </svg>
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
  const [range, setRange] = useState('6months');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [entries, setEntries] = useState([]);
  const [billing, setBilling] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('table');
  const [showColPicker, setShowColPicker] = useState(false);
  const [activeCols, setActiveCols] = useState(ALL_COLUMNS.filter(c => c.default).map(c => c.key));

  useEffect(() => { loadMeta(); }, []);
  useEffect(() => { if (range !== 'custom') loadData(); }, [range, selProject, selClient, selMember]);

  async function loadMeta() {
    const [{ data: proj }, { data: cli }, { data: mem }] = await Promise.all([
      supabase.from('projects').select('id, name, color, client_id, billing_day, monthly_amount, clients(name)').order('name'),
      supabase.from('clients').select('id, name').order('name'),
      supabase.from('profiles').select('id, full_name, email').order('full_name'),
    ]);
    setProjects(proj || []); setClients(cli || []); setMembers(mem || []);
  }

  function getRange() {
    const now = new Date();
    if (range === 'custom') return { from: customFrom + 'T00:00:00Z', to: customTo + 'T23:59:59Z' };
    const n = range === '3months' ? 3 : range === '6months' ? 6 : 12;
    return { from: new Date(now.getFullYear(), now.getMonth() - n + 1, 1).toISOString(), to: now.toISOString() };
  }

  async function loadData() {
    setLoading(true);
    const { from, to } = getRange();

    let q = supabase.from('time_entries')
      .select('*, profiles(full_name,email), projects(id,name,color,client_id,billing_day,monthly_amount,clients(name))')
      .not('end_time', 'is', null).gte('created_at', from).lte('created_at', to)
      .order('created_at', { ascending: true });
    if (selProject) q = q.eq('project_id', selProject);
    if (selMember) q = q.eq('user_id', selMember);

    let bq = supabase.from('billing').select('*, clients(name)').order('year').order('month');
    if (selClient) bq = bq.eq('client_id', selClient);

    const [{ data: ent }, { data: bil }] = await Promise.all([q, bq]);
    setEntries(ent || []); setBilling(bil || []);
    setLoading(false);
  }

  function getMonths() {
    const { from } = getRange();
    const now = new Date();
    const months = [];
    let cur = new Date(new Date(from).getFullYear(), new Date(from).getMonth(), 1);
    while (cur <= now) {
      months.push({ year: cur.getFullYear(), month: cur.getMonth() + 1, label: `${MONTHS[cur.getMonth()]} '${cur.getFullYear().toString().slice(2)}` });
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
    return months.map(m => {
      const ent = entries.filter(e => { const d = parseUTC(e.created_at); return d && d.getMonth()+1 === m.month && d.getFullYear() === m.year; });
      const bil = billing.filter(b => b.month === m.month && b.year === m.year && b.status === 'paid');
      const secs = ent.reduce((a, e) => a + (e.duration_seconds || 0), 0);
      const hours = secs / 3600;
      const billed = bil.reduce((a, b) => a + (b.amount || 0), 0);
      const cph = hours > 0 && billed > 0 ? billed / hours : 0;
      return { ...m, secs, hours, billed, cph, entryCount: ent.length };
    });
  }

  // Build per-project table data
  function getTableData() {
    const map = {};

    entries.forEach(e => {
      const pid = e.project_id; if (!pid) return;
      if (!map[pid]) map[pid] = {
        id: pid,
        project: e.projects?.name || '—',
        client: e.projects?.clients?.name || '—',
        client_id: e.projects?.client_id,
        color: e.projects?.color || '#007AFF',
        billing_day: e.projects?.billing_day,
        monthly_amt: e.projects?.monthly_amount,
        secs: 0, entries: 0, lastActivity: null,
      };
      map[pid].secs += (e.duration_seconds || 0);
      map[pid].entries++;
      if (!map[pid].lastActivity || e.created_at > map[pid].lastActivity) map[pid].lastActivity = e.created_at;
    });

    // Add billing data per client
    billing.forEach(b => {
      Object.values(map).forEach(p => {
        if (p.client_id === b.client_id) {
          p.billed = (p.billed || 0) + (b.status === 'paid' ? (b.amount || 0) : 0);
          p.billed_total = (p.billed_total || 0) + (b.amount || 0);
        }
      });
    });

    return Object.values(map).map(p => ({
      ...p,
      hours: p.secs / 3600,
      cph: p.billed && p.secs > 0 ? p.billed / (p.secs / 3600) : null,
      margin: p.monthly_amt && p.billed && p.secs > 0
        ? Math.round(((p.billed - (p.secs / 3600) * 25) / p.billed) * 100)
        : null,
    })).sort((a, b) => b.hours - a.hours);
  }

  const monthlyData = getMonths();
  const tableData = getTableData();
  const totalSecs = entries.reduce((a, e) => a + (e.duration_seconds || 0), 0);
  const totalBilled = billing.filter(b => b.status === 'paid').reduce((a, b) => a + (b.amount || 0), 0);
  const avgCph = totalSecs > 0 && totalBilled > 0 ? totalBilled / (totalSecs / 3600) : 0;

  function toggleCol(key) {
    setActiveCols(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }

  function exportExcel() {
    import('xlsx').then(XLSX => {
      const rows = tableData.map(p => {
        const row = {};
        if (activeCols.includes('client')) row['Client'] = p.client;
        if (activeCols.includes('project')) row['Proiect'] = p.project;
        if (activeCols.includes('hours')) row['Ore lucrate'] = p.hours.toFixed(2);
        if (activeCols.includes('billed')) row['Facturat (€)'] = p.billed || 0;
        if (activeCols.includes('cph')) row['€/oră'] = p.cph ? p.cph.toFixed(2) : '—';
        if (activeCols.includes('entries')) row['Nr. înregistrări'] = p.entries;
        if (activeCols.includes('billing_day')) row['Zi facturare'] = p.billing_day ? `Ziua ${p.billing_day}` : '—';
        if (activeCols.includes('monthly_amt')) row['Sumă lunară'] = p.monthly_amt || '—';
        if (activeCols.includes('last_activity')) row['Ultima activitate'] = p.lastActivity ? fmtDate(p.lastActivity) : '—';
        return row;
      });
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Raport');

      // Add monthly sheet
      const monthRows = monthlyData.map(m => ({ 'Lună': m.label, 'Ore': m.hours.toFixed(2), 'Facturat (€)': m.billed, '€/oră': m.cph ? m.cph.toFixed(2) : '' }));
      const ws2 = XLSX.utils.json_to_sheet(monthRows);
      XLSX.utils.book_append_sheet(wb, ws2, 'Lunar');
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
          <div className="relative">
            <button onClick={() => setShowColPicker(!showColPicker)}
              className="btn-secondary flex items-center gap-2">
              <Settings2 className="w-4 h-4" /> Coloane
            </button>
            {showColPicker && (
              <div className="absolute right-0 top-full mt-2 bg-white rounded-ios-lg shadow-ios-modal border border-ios-separator/30 p-3 z-50 w-56">
                <p className="text-footnote font-semibold text-ios-secondary mb-2 uppercase tracking-wide">Coloane vizibile</p>
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
        <div className="flex gap-1.5 flex-wrap">
          {RANGES.map(r => (
            <button key={r.key} onClick={() => setRange(r.key)}
              className={`px-3 py-1.5 rounded-ios text-footnote font-semibold transition-all ${range === r.key ? 'bg-ios-blue text-white' : 'bg-ios-fill text-ios-secondary'}`}>
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
          {[
            { val: selClient, set: v => { setSelClient(v); setSelProject(''); }, opts: clients.map(c => ({ id: c.id, name: c.name })), placeholder: 'Toți clienții' },
            { val: selProject, set: setSelProject, opts: projects.filter(p => !selClient || p.client_id === selClient).map(p => ({ id: p.id, name: p.name })), placeholder: 'Toate proiectele' },
            { val: selMember, set: setSelMember, opts: members.map(m => ({ id: m.id, name: m.full_name || m.email })), placeholder: 'Toată echipa' },
          ].map(({ val, set, opts, placeholder }, i) => (
            <div key={i} className="relative">
              <select className="input appearance-none pr-8 py-2 text-footnote w-44" value={val} onChange={e => set(e.target.value)}>
                <option value="">{placeholder}</option>
                {opts.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ios-tertiary pointer-events-none" />
            </div>
          ))}
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
              { label: 'Proiecte', value: tableData.length, icon: TrendingUp, color: 'text-ios-purple bg-purple-50' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="card p-4">
                <div className={`w-9 h-9 rounded-ios flex items-center justify-center mb-3 ${color}`}><Icon className="w-4 h-4" /></div>
                <p className="text-title3 font-bold text-ios-primary">{value}</p>
                <p className="text-footnote text-ios-secondary">{label}</p>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex gap-0.5 bg-ios-fill p-1 rounded-ios">
            {[['table','Tabel proiecte'],['evolution','Evoluție'],['monthly','Lunar']].map(([k,v]) => (
              <button key={k} onClick={() => setTab(k)}
                className={`flex-1 py-2 rounded-ios-sm text-footnote font-semibold transition-all ${tab === k ? 'bg-white text-ios-primary shadow-ios-sm' : 'text-ios-secondary'}`}>{v}</button>
            ))}
          </div>

          {/* Table view */}
          {tab === 'table' && (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-ios-bg border-b border-ios-separator/30">
                    <tr>
                      {activeCols.map(key => (
                        <th key={key} className="px-4 py-3 text-caption1 font-semibold text-ios-secondary uppercase tracking-wide whitespace-nowrap">
                          {colMap[key]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tableData.length === 0 ? (
                      <tr><td colSpan={activeCols.length} className="px-4 py-8 text-center text-ios-tertiary text-subhead">Nicio dată în perioada selectată</td></tr>
                    ) : tableData.map(p => (
                      <tr key={p.id} className="border-t border-ios-separator/20 hover:bg-ios-bg">
                        {activeCols.includes('client') && (
                          <td className="px-4 py-3 text-subhead font-medium text-ios-primary">{p.client}</td>
                        )}
                        {activeCols.includes('project') && (
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
                              <span className="text-subhead font-semibold text-ios-primary">{p.project}</span>
                            </div>
                          </td>
                        )}
                        {activeCols.includes('hours') && (
                          <td className="px-4 py-3 text-subhead text-ios-primary font-semibold">{p.hours.toFixed(1)}h</td>
                        )}
                        {activeCols.includes('billed') && (
                          <td className="px-4 py-3 text-subhead font-bold text-ios-green">
                            {p.billed ? fmtCurrency(p.billed) : <span className="text-ios-tertiary font-normal">—</span>}
                          </td>
                        )}
                        {activeCols.includes('cph') && (
                          <td className="px-4 py-3">
                            {p.cph ? (
                              <span className={`badge ${p.cph >= 100 ? 'badge-green' : p.cph >= 50 ? 'badge-orange' : 'badge-red'}`}>
                                €{p.cph.toFixed(0)}/h
                              </span>
                            ) : <span className="text-ios-tertiary text-footnote">—</span>}
                          </td>
                        )}
                        {activeCols.includes('entries') && (
                          <td className="px-4 py-3 text-footnote text-ios-secondary">{p.entries}</td>
                        )}
                        {activeCols.includes('billing_day') && (
                          <td className="px-4 py-3 text-footnote text-ios-secondary">
                            {p.billing_day ? `Ziua ${p.billing_day}` : <span className="text-ios-tertiary">—</span>}
                          </td>
                        )}
                        {activeCols.includes('monthly_amt') && (
                          <td className="px-4 py-3 text-footnote text-ios-secondary">
                            {p.monthly_amt ? fmtCurrency(p.monthly_amt) : <span className="text-ios-tertiary">—</span>}
                          </td>
                        )}
                        {activeCols.includes('last_activity') && (
                          <td className="px-4 py-3 text-footnote text-ios-secondary">
                            {p.lastActivity ? fmtDate(p.lastActivity) : '—'}
                          </td>
                        )}
                        {activeCols.includes('margin') && (
                          <td className="px-4 py-3">
                            {p.margin !== null ? (
                              <span className={`badge ${p.margin >= 50 ? 'badge-green' : p.margin >= 20 ? 'badge-orange' : 'badge-red'}`}>
                                {p.margin}%
                              </span>
                            ) : <span className="text-ios-tertiary text-footnote">—</span>}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Evolution charts */}
          {tab === 'evolution' && (
            <div className="space-y-4">
              <div className="card p-4">
                <p className="text-headline font-semibold mb-1">Evoluție €/oră</p>
                <p className="text-footnote text-ios-secondary mb-4">Valoarea unei ore de lucru per lună</p>
                <LineChart color="#34C759"
                  data={monthlyData.map(m => ({ label: m.label.split(' ')[0], value: parseFloat(m.cph.toFixed(1)), displayValue: m.cph > 0 ? `€${m.cph.toFixed(0)}` : '' }))} />
              </div>
              <div className="card p-4">
                <p className="text-headline font-semibold mb-1">Evoluție încasat (€)</p>
                <p className="text-footnote text-ios-secondary mb-4">Facturi plătite per lună</p>
                <LineChart color="#FF9500"
                  data={monthlyData.map(m => ({ label: m.label.split(' ')[0], value: m.billed, displayValue: m.billed > 0 ? `€${m.billed}` : '' }))} />
              </div>
              <div className="card p-4">
                <p className="text-headline font-semibold mb-1">Evoluție ore lucrate</p>
                <p className="text-footnote text-ios-secondary mb-4">Total ore per lună</p>
                <LineChart color="#007AFF"
                  data={monthlyData.map(m => ({ label: m.label.split(' ')[0], value: parseFloat(m.hours.toFixed(1)), displayValue: m.hours > 0 ? `${m.hours.toFixed(0)}h` : '' }))} />
              </div>
            </div>
          )}

          {/* Monthly detail */}
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
