'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { fmtClock, fmtDuration, fmtTime, getElapsed, parseUTC } from '@/lib/utils';
import { Play, Square, ChevronDown } from 'lucide-react';

export default function TimerPage() {
  const [active, setActive] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [form, setForm] = useState({ project_id: '', task_id: '', description: '' });
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      loadData(user);
    });
    return () => clearInterval(intervalRef.current);
  }, []);

  // ✅ Timezone-safe timer — uses parseUTC from utils
  useEffect(() => {
    clearInterval(intervalRef.current);
    if (!active?.start_time) return;
    const tick = () => setElapsed(getElapsed(active.start_time));
    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => clearInterval(intervalRef.current);
  }, [active]);

  async function loadData(u) {
    if (!u) return;
    const [{ data: proj }, { data: ent }, { data: act }] = await Promise.all([
      supabase.from('projects').select('id, name, color, clients(name)').eq('status', 'active').order('name'),
      supabase.from('time_entries')
        .select('*, projects(name,color), tasks(title)')
        .eq('user_id', u.id).not('end_time', 'is', null)
        .order('created_at', { ascending: false }).limit(30),
      supabase.from('time_entries')
        .select('*, projects(name,color), tasks(title)')
        .eq('user_id', u.id).is('end_time', null).maybeSingle(),
    ]);
    setProjects(proj || []);
    setEntries(ent || []);
    if (act) {
      setActive(act);
      setForm({ project_id: act.project_id || '', task_id: act.task_id || '', description: act.description || '' });
    }
  }

  async function loadTasks(projectId) {
    if (!projectId) return setTasks([]);
    const { data } = await supabase.from('tasks').select('id, title').eq('project_id', projectId).neq('status', 'done');
    setTasks(data || []);
  }

  async function startTimer() {
    if (!user || active || loading) return;
    setLoading(true);
    const { data } = await supabase.from('time_entries').insert({
      user_id: user.id,
      project_id: form.project_id || null,
      task_id: form.task_id || null,
      description: form.description || null,
      start_time: new Date().toISOString(), // Always UTC from browser
    }).select('*, projects(name,color), tasks(title)').single();
    setActive(data);
    setLoading(false);
  }

  async function stopTimer() {
    if (!active || loading) return;
    setLoading(true);
    const endTime = new Date().toISOString();
    const duration = getElapsed(active.start_time);
    await supabase.from('time_entries').update({
      end_time: endTime,
      duration_seconds: duration,
    }).eq('id', active.id);
    setActive(null);
    setElapsed(0);
    setForm({ project_id: '', task_id: '', description: '' });
    await loadData(user);
    setLoading(false);
  }

  // Group entries by day
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  const grouped = entries.reduce((acc, e) => {
    const day = parseUTC(e.created_at)?.toDateString() || '';
    const label = day === today ? 'Azi' : day === yesterday ? 'Ieri' : parseUTC(e.created_at)?.toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'short' });
    if (!acc[label]) acc[label] = [];
    acc[label].push(e);
    return acc;
  }, {});

  const todayTotal = (grouped['Azi'] || []).reduce((a, e) => a + (e.duration_seconds || 0), 0);

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-title2 font-bold text-ios-primary">Timer</h1>
        <p className="text-subhead text-ios-secondary mt-0.5">Înregistrează timpul de lucru</p>
      </div>

      {/* Timer Card */}
      <div className="card p-6 text-center">
        {/* Clock display */}
        <div className={`font-mono font-bold mb-6 transition-all ${
          active ? 'text-[56px] text-ios-blue' : 'text-[56px] text-ios-label4'
        }`} style={{ letterSpacing: '-0.02em', lineHeight: 1 }}>
          {fmtClock(elapsed)}
        </div>

        {/* Active timer info */}
        {active && (
          <div className="mb-5 p-3 bg-blue-50 rounded-ios">
            <p className="text-subhead font-semibold text-ios-blue">
              {active.projects?.name || 'Fără proiect'}
            </p>
            {(active.tasks?.title || active.description) && (
              <p className="text-footnote text-ios-secondary mt-0.5">
                {active.tasks?.title || active.description}
              </p>
            )}
          </div>
        )}

        {/* Form (only when not active) */}
        {!active && (
          <div className="space-y-3 mb-5 text-left">
            <div>
              <label className="input-label">Proiect</label>
              <div className="relative">
                <select className="input appearance-none pr-9"
                  value={form.project_id}
                  onChange={e => { setForm({ ...form, project_id: e.target.value, task_id: '' }); loadTasks(e.target.value); }}>
                  <option value="">— Selectează proiect —</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.clients?.name ? ` · ${p.clients.name}` : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-tertiary pointer-events-none" />
              </div>
            </div>

            {tasks.length > 0 && (
              <div>
                <label className="input-label">Task</label>
                <div className="relative">
                  <select className="input appearance-none pr-9"
                    value={form.task_id} onChange={e => setForm({ ...form, task_id: e.target.value })}>
                    <option value="">— Fără task specific —</option>
                    {tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-tertiary pointer-events-none" />
                </div>
              </div>
            )}

            <div>
              <label className="input-label">Descriere</label>
              <input className="input" placeholder="La ce lucrezi?" value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
        )}

        {/* Start/Stop button */}
        <button
          onClick={active ? stopTimer : startTimer}
          disabled={loading}
          className={`w-full py-4 rounded-ios-lg text-headline font-bold flex items-center justify-center gap-3 transition-all active:scale-95 ${
            active
              ? 'bg-ios-red text-white shadow-ios'
              : 'bg-ios-blue text-white shadow-ios'
          } disabled:opacity-50`}>
          {loading ? (
            <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : active ? (
            <><Square className="w-5 h-5" fill="white" /> Oprește timerul</>
          ) : (
            <><Play className="w-5 h-5" fill="white" /> Pornește timerul</>
          )}
        </button>

        {active && (
          <p className="text-footnote text-ios-tertiary mt-3">
            Început la {fmtTime(active.start_time)}
          </p>
        )}
      </div>

      {/* Today summary */}
      {todayTotal > 0 && (
        <div className="flex items-center justify-between px-1">
          <p className="text-subhead font-semibold text-ios-secondary">Total azi</p>
          <p className="text-subhead font-bold text-ios-primary">{fmtDuration(todayTotal)}</p>
        </div>
      )}

      {/* History */}
      {Object.entries(grouped).map(([day, dayEntries]) => {
        const dayTotal = dayEntries.reduce((a, e) => a + (e.duration_seconds || 0), 0);
        return (
          <div key={day} className="card">
            <div className="flex items-center justify-between px-4 py-3 border-b border-ios-separator/50">
              <p className="text-subhead font-semibold text-ios-primary">{day}</p>
              <p className="text-footnote font-semibold text-ios-secondary">{fmtDuration(dayTotal)}</p>
            </div>
            {dayEntries.map(e => (
              <div key={e.id} className="list-row">
                <div className="w-2 h-2 rounded-full shrink-0 mr-3" style={{ background: e.projects?.color || '#007AFF' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-subhead font-medium text-ios-primary truncate">
                    {e.projects?.name || 'Fără proiect'}
                  </p>
                  <p className="text-footnote text-ios-secondary truncate">
                    {e.tasks?.title || e.description || '—'} · {fmtTime(e.start_time)} – {fmtTime(e.end_time)}
                  </p>
                </div>
                <span className="text-footnote font-semibold text-ios-secondary ml-2 shrink-0">
                  {fmtDuration(e.duration_seconds || 0)}
                </span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
