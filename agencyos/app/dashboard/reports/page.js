'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { fmtDuration, fmtCurrency, parseUTC } from '@/lib/utils';
import { Download, TrendingUp, Euro, Clock, ChevronDown } from 'lucide-react';

const MONTHS = ['Ian','Feb','Mar','Apr','Mai','Iun','Iul','Aug','Sep','Oct','Nov','Dec'];

function LineChart({ data, color = '#007AFF' }) {
  if (!data || data.length < 2) return (
    <div className="flex items-center justify-center h-32 text-ios-tertiary text-footnote">
      Date insuficiente — adaugă facturi la proiecte
    </div>
  );
  const values = data.map(d => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const W = 400, H = 100, PAD = 24;
  const points = data.map((d, i) => ({
    x: PAD + (i / (data.length - 1)) * (W - PAD * 2),
    y: PAD + ((max - d.value) / range) * (H - PAD * 2),
    ...d,
  }));
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = `${pathD} L ${points[points.length-1].x} ${H} L ${points[0].x} ${H} Z`;
  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H + 24}`} className="w-full" style={{ minWidth: 260 }}>
        {[0, 0.5, 1].map(t => (
          <line key={t} x1={PAD} x2={W-PAD} y1={PAD + t*(H-PAD*2)} y2={PAD + t*(H-PAD*2)} stroke="#F2F2F7" strokeWidth="1" />
        ))}
        <path d={areaD} fill={color} fillOpacity="0.1" />
        <path d={pathD} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="4" fill="white" stroke={color} strokeWidth="2" />
            <text x={p.x} y={p.y - 8} textAnchor="middle" fontSize="9" fill={color} fontWeight="700">
              {p.displayValue || ''}
            </text>
            <text x={p.x} y={H + 18} textAnchor="middle" fontSize="9" fill="#AEAEB2">{p.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function BarChart({ data, color = '#007AFF' }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-1 h-28 w-full">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          {d.value > 0 && <span className="text-caption2 text-ios-secondary font-medium">{d.topLabel}</span>}
          <div className="w-full rounded-t-ios-sm" style={{ height: `${Math.max((d.value/max)*80, d.value > 0 ? 4 : 0)}px`, background: color }} />
          <span className="text-caption2 text-ios-tertiary">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

const RANGES = [
  { key: '3months', label: '3 luni' },
  { key: '6months', label: '6 luni' },
  { key: '12months', label: '12 luni' },
  { key: 'custom',  label: 'Custom' },
];

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
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('overview');

  useEffect(() => { loadMeta(); }, []);
  useEffect(() => { if (range !== 'custom') loadData(); }, [range, selProject, selClient, selMember]);

  async function loadMeta() {
    const [{ data: proj }, { data: cli }, { data: mem }] = await Promise.all([
      supabase.from('projects').select('id, name, color, client_id, clients(name)').order('name'),
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
      .select('*, profiles(full_name,email), projects(id,name,color,client_id,clients(name))')
      .not('end_time', 'is', null).gte('created_at', from).lte('created_at', to).order('created_at', { ascending: true });
    if (selProject) q = q.eq('project_id', selProject);
    if (selMember) q = q.eq('user_id', selMember);

    let iq = supabase.from('invoices').select('*, projects(id,name,color,client_id,clients(name))').order('year').order('month');
    if (selProject) iq = iq.eq('project_id', selProject);

    const [{ data: ent }, { data: inv }] = await Promise.all([q, iq]);
    setEntries(ent || []); setInvoices(inv || []);
    setLoading(false);
  }

  function getMonths() {
    const { from } = getRange();
    const start = new Date(from);
    const now = new Date();
    const months = [];
    let cur = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cur <= now) {
      months.push({ year: cur.getFullYear(), month: cur.getMonth() + 1, label: `${MONTHS[cur.getMonth()]} '${cur.getFullYear().toString().slice(2)}` });
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
    return months.map(m => {
      const ent = entries.filter(e => { const d = parseUTC(e.created_at); return d && d.getMonth()+1 === m.month && d.getFullYear() === m.year; });
      const inv = invoices.filter(i => i.month === m.month && i.year === m.year);
      const secs = ent.reduce((a, e) => a + (e.duration_seconds || 0), 0);
      const hours = secs / 3600;
      const invoiced = inv.reduce((a, i) => a + (i.amount || 0), 0);
      const cph = hours > 0 && invoiced > 0 ? invoiced / hours : 0;
      return { ...m, secs, hours, invoiced, cph, entryCount: ent.length };
    });
  }

  function getProjectSummary() {
    const map = {};
    entries.forEach(e => {
      const pid = e.project_id; if (!pid) return;
      if (!map[pid]) map[pid] = { name: e.projects?.name||'—', color: e.projects?.color||'#007AFF', client: e.projects?.clients?.name||'—', secs: 0, invoiced: 0 };
      map[pid].secs += (e.duration_seconds || 0);
    });
    invoices.forEach(i => {
      const pid = i.project_id;
      if (!map[pid]) map[pid] = { name: i.projects?.name||'—', color: i.projects?.color||'#007AFF', client: i.projects?.clients?.name||'—', secs: 0, invoiced: 0 };
      map[pid].invoiced += (i.amount || 0);
    });
    return Object.entries(map).map(([id, d]) => ({
      id, ...d, hours: d.secs / 3600,
      cph: d.invoiced > 0 && d.secs > 0 ? d.invoiced / (d.secs / 3600) : null,
    })).sort((a, b) => (b.cph||0) - (a.cph||0));
  }

  const monthlyData = getMonths();
  const projectSummary = getProjectSummary();
  const totalSecs = entries.reduce((a, e) => a + (e.duration_seconds || 0), 0);
  const totalInvoiced = invoices.reduce((a, i) => a + (i.amount || 0), 0);
  const avgCph = totalSecs > 0 && totalInvoiced > 0 ? totalInvoiced / (totalSecs / 3600) : 0;

  function exportExcel() {
    import('xlsx').then(XLSX => {
      const rows = monthlyData.map(m => ({
        'Lună': m.label, 'Ore': m.hours.toFixed(2),
        'Facturat (€)': m.invoiced, '€/oră': m.cph ? m.cph.toFixed(2) : '',
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Raport');
      XLSX.writeFile(wb, `agencyos_raport.xlsx`);
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-title2 font-bold text-ios-primary">Rapoarte</h1>
          <p className="text-subhead text-ios-secondary">Profitabilitate & evoluție</p>
        </div>
        <button onClick={exportExcel} className="btn-secondary flex items-center gap-2">
          <Download className="w-4 h-4" /> Excel
        </button>
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
            { val: selClient, set: v => { setSelClient(v); setSelProject(''); }, opts: clients, placeholder: 'Toți clienții' },
            { val: selProject, set: setSelProject, opts: projects.filter(p => !selClient || p.client_id === selClient), placeholder: 'Toate proiectele' },
            { val: selMember, set: setSelMember, opts: members.map(m => ({ id: m.id, name: m.full_name || m.email })), placeholder: 'Toată echipa' },
          ].map(({ val, set, opts, placeholder }, i) => (
            <div key={i} className="relative">
              <select className="input appearance-none pr-8 py-2 text-footnote w-44" value={val} onChange={e => set(e.target.value)}>
                <option value="">{placeholder}</option>
                {opts.map(o => <option key={o.id} value={o.id}>{o.name || o.full_name}</option>)}
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
              { label: 'Total facturat', value: totalInvoiced > 0 ? fmtCurrency(totalInvoiced) : '—', icon: Euro, color: 'text-ios-green bg-green-50' },
              { label: '€/oră mediu', value: avgCph > 0 ? `€${avgCph.toFixed(0)}/h` : '—', icon: TrendingUp, color: 'text-ios-orange bg-orange-50' },
              { label: 'Proiecte active', value: projectSummary.length, icon: TrendingUp, color: 'text-ios-purple bg-purple-50' },
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
            {[['overview','Rezumat'],['evolution','Evoluție'],['details','Detalii']].map(([k,v]) => (
              <button key={k} onClick={() => setTab(k)}
                className={`flex-1 py-2 rounded-ios-sm text-footnote font-semibold transition-all ${tab === k ? 'bg-white text-ios-primary shadow-ios-sm' : 'text-ios-secondary'}`}>{v}</button>
            ))}
          </div>

          {tab === 'overview' && (
            <div className="space-y-4">
              <div className="card p-4">
                <p className="text-headline font-semibold mb-4">€/oră per proiect</p>
                {projectSummary.length === 0 ? (
                  <p className="text-center text-ios-tertiary text-subhead py-6">Nicio dată în perioada selectată</p>
                ) : projectSummary.map(p => (
                  <div key={p.id} className="flex items-center justify-between py-3 border-b border-ios-separator/30 last:border-0">
                    <div className="flex items-center gap-2.5">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.color }} />
                      <div>
                        <p className="text-subhead font-semibold text-ios-primary">{p.name}</p>
                        <p className="text-caption1 text-ios-secondary">{p.client} · {p.hours.toFixed(1)}h</p>
                      </div>
                    </div>
                    <div className="text-right">
                      {p.cph ? <p className="text-subhead font-bold text-ios-green">€{p.cph.toFixed(0)}/h</p> : <p className="text-footnote text-ios-tertiary">Fără factură</p>}
                      {p.invoiced > 0 && <p className="text-caption1 text-ios-secondary">{fmtCurrency(p.invoiced)}</p>}
                    </div>
                  </div>
                ))}
              </div>

              <div className="card p-4">
                <p className="text-headline font-semibold mb-4">Ore lucrate pe luni</p>
                <BarChart data={monthlyData.map(m => ({ label: m.label.split(' ')[0], value: m.hours, topLabel: m.hours > 0 ? `${m.hours.toFixed(0)}h` : '' }))} color="#007AFF" />
              </div>
            </div>
          )}

          {tab === 'evolution' && (
            <div className="space-y-4">
              <div className="card p-4">
                <p className="text-headline font-semibold mb-1">Evoluție €/oră</p>
                <p className="text-footnote text-ios-secondary mb-4">Valoarea unei ore de lucru în fiecare lună</p>
                <LineChart color="#34C759"
                  data={monthlyData.filter(m => m.cph > 0).map(m => ({ label: m.label.split(' ')[0], value: parseFloat(m.cph.toFixed(1)), displayValue: `€${m.cph.toFixed(0)}` }))} />
              </div>
              <div className="card p-4">
                <p className="text-headline font-semibold mb-1">Evoluție facturat (€)</p>
                <p className="text-footnote text-ios-secondary mb-4">Total facturi per lună</p>
                <LineChart color="#FF9500"
                  data={monthlyData.filter(m => m.invoiced > 0).map(m => ({ label: m.label.split(' ')[0], value: m.invoiced, displayValue: `€${m.invoiced}` }))} />
              </div>
              <div className="card p-4">
                <p className="text-headline font-semibold mb-1">Evoluție ore lucrate</p>
                <p className="text-footnote text-ios-secondary mb-4">Total ore per lună</p>
                <LineChart color="#007AFF"
                  data={monthlyData.filter(m => m.hours > 0).map(m => ({ label: m.label.split(' ')[0], value: parseFloat(m.hours.toFixed(1)), displayValue: `${m.hours.toFixed(0)}h` }))} />
              </div>
            </div>
          )}

          {tab === 'details' && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-ios-separator/50">
                <p className="text-headline font-semibold">Detalii lunare</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-ios-bg">
                    <tr>
                      {['Lună','Ore lucrate','Facturat','€/oră','Înregistrări'].map(h => (
                        <th key={h} className="px-4 py-3 text-caption1 font-semibold text-ios-secondary uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyData.map((m, i) => (
                      <tr key={i} className="border-t border-ios-separator/30 hover:bg-ios-bg">
                        <td className="px-4 py-3 text-subhead font-semibold">{m.label}</td>
                        <td className="px-4 py-3 text-subhead">{m.hours > 0 ? `${m.hours.toFixed(1)}h` : <span className="text-ios-tertiary">—</span>}</td>
                        <td className="px-4 py-3 text-subhead font-semibold text-ios-green">{m.invoiced > 0 ? fmtCurrency(m.invoiced) : <span className="text-ios-tertiary font-normal">—</span>}</td>
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
