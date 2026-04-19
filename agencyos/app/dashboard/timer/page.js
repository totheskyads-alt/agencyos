'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { fmtClock, fmtDuration, fmtTime, getElapsed, parseUTC } from '@/lib/utils';
import { Play, Square, ChevronDown, Edit2, Trash2, Plus, Check, X, Clock } from 'lucide-react';

function fmtDateGroup(dateStr) {
  const d = parseUTC(dateStr);
  const today = new Date(); today.setHours(0,0,0,0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const entryDate = new Date(d); entryDate.setHours(0,0,0,0);
  if (entryDate.getTime() === today.getTime()) return 'Today';
  if (entryDate.getTime() === yesterday.getTime()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday:'long', day:'numeric', month:'short' });
}

export default function TimerPage() {
  const [active, setActive] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [projects, setProjects] = useState([]);
  const [selProject, setSelProject] = useState('');
  const [description, setDescription] = useState('');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [editingEntry, setEditingEntry] = useState(null);
  const [showAddPast, setShowAddPast] = useState(false);
  const [editForm, setEditForm] = useState({ duration_minutes: '', description: '', project_id: '' });
  const [pastForm, setPastForm] = useState({
    project_id: '', description: '', date: new Date().toISOString().slice(0,10),
    start_time: '', duration_minutes: '',
  });
  const intervalRef = useRef(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => { setUser(user); loadData(user); });
    return () => clearInterval(intervalRef.current);
  }, []);

  useEffect(() => {
    clearInterval(intervalRef.current);
    if (!active?.start_time) { setElapsed(0); return; }
    const tick = () => setElapsed(getElapsed(active.start_time));
    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => clearInterval(intervalRef.current);
  }, [active]);

  async function loadData(u) {
    if (!u) return;
    const [{ data: proj }, { data: ent }, { data: act }] = await Promise.all([
      supabase.from('projects').select('id,name,color,clients(name)').eq('status','active').order('name'),
      supabase.from('time_entries').select('*, projects(name,color,clients(name)), tasks(title)')
        .eq('user_id', u.id).not('end_time','is',null).order('created_at',{ascending:false}).limit(50),
      supabase.from('time_entries').select('*, projects(name,color), tasks(title)')
        .eq('user_id', u.id).is('end_time',null).maybeSingle(),
    ]);
    setProjects(proj || []);
    setEntries(ent || []);
    if (act) { setActive(act); setSelProject(act.project_id||''); setDescription(act.description||''); }
    else setActive(null);
  }

  async function start() {
    if (!selProject || !user || loading) return;
    setLoading(true);
    if (active) {
      await supabase.from('time_entries').update({ end_time: new Date().toISOString(), duration_seconds: getElapsed(active.start_time) }).eq('id', active.id);
    }
    const { data } = await supabase.from('time_entries').insert({
      user_id: user.id, project_id: selProject,
      description: description || null, start_time: new Date().toISOString(),
    }).select('*, projects(name,color), tasks(title)').single();
    setActive(data);
    setLoading(false); loadData(user);
  }

  async function stop() {
    if (!active || loading) return;
    setLoading(true);
    await supabase.from('time_entries').update({ end_time: new Date().toISOString(), duration_seconds: getElapsed(active.start_time) }).eq('id', active.id);
    setActive(null); setElapsed(0); setSelProject(''); setDescription('');
    setLoading(false); loadData(user);
  }

  async function saveEditEntry(entry) {
    if (!editForm.duration_minutes) return;
    const mins = parseFloat(editForm.duration_minutes);
    const secs = Math.round(mins * 60);
    const startUTC = parseUTC(entry.start_time || entry.created_at);
    const newEnd = new Date(startUTC.getTime() + secs * 1000);
    await supabase.from('time_entries').update({
      duration_seconds: secs,
      end_time: newEnd.toISOString(),
      description: editForm.description || entry.description,
      project_id: editForm.project_id || entry.project_id,
    }).eq('id', entry.id);
    setEditingEntry(null); loadData(user);
  }

  async function deleteEntry(id) {
    if (!confirm('Delete this time entry?')) return;
    await supabase.from('time_entries').delete().eq('id', id);
    loadData(user);
  }

  async function addPastEntry() {
    if (!pastForm.project_id || !pastForm.duration_minutes || !user) return;
    const mins = parseFloat(pastForm.duration_minutes);
    const secs = Math.round(mins * 60);
    let startTime;
    if (pastForm.start_time) {
      startTime = new Date(`${pastForm.date}T${pastForm.start_time}:00`).toISOString();
    } else {
      startTime = new Date(`${pastForm.date}T09:00:00`).toISOString();
    }
    const endTime = new Date(new Date(startTime).getTime() + secs * 1000).toISOString();
    await supabase.from('time_entries').insert({
      user_id: user.id, project_id: pastForm.project_id,
      description: pastForm.description || null,
      start_time: startTime, end_time: endTime, duration_seconds: secs,
    });
    setShowAddPast(false); setPastForm({ project_id:'', description:'', date: new Date().toISOString().slice(0,10), start_time:'', duration_minutes:'' });
    loadData(user);
  }

  // Group entries by day
  const grouped = entries.reduce((acc, e) => {
    const key = fmtDateGroup(e.created_at);
    if (!acc[key]) acc[key] = [];
    acc[key].push(e);
    return acc;
  }, {});

  const todayTotal = (grouped['Today'] || []).reduce((a,e) => a + (e.duration_seconds||0), 0);

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-title2 font-bold text-ios-primary">Timer</h1>
          <p className="text-subhead text-ios-secondary">Track your working time</p>
        </div>
        <button onClick={() => setShowAddPast(true)} className="btn-secondary flex items-center gap-2 text-footnote">
          <Plus className="w-3.5 h-3.5" /> Add past time
        </button>
      </div>

      {/* Timer card */}
      <div className="card p-6 text-center">
        <div className={`font-mono font-bold mb-5 transition-all ${active ? 'text-[56px] text-ios-blue' : 'text-[56px] text-ios-label4'}`}
          style={{ letterSpacing: '-0.02em', lineHeight: 1 }}>
          {fmtClock(elapsed)}
        </div>

        {active ? (
          <div className="mb-5 p-3 bg-blue-50 rounded-ios text-center">
            <p className="text-subhead font-semibold text-ios-blue">{active.projects?.name}</p>
            {(active.tasks?.title || active.description) && <p className="text-footnote text-ios-secondary mt-0.5">{active.tasks?.title || active.description}</p>}
          </div>
        ) : (
          <div className="space-y-3 mb-5 text-left">
            <div>
              <label className="input-label">Project *</label>
              <div className="relative">
                <select className="input appearance-none pr-9" value={selProject} onChange={e => setSelProject(e.target.value)}>
                  <option value="">— Select project (required) —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}{p.clients?.name ? ` · ${p.clients.name}` : ''}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-tertiary pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="input-label">Description (optional)</label>
              <input className="input" placeholder="What are you working on?" value={description} onChange={e => setDescription(e.target.value)} />
            </div>
          </div>
        )}

        <button onClick={active ? stop : start} disabled={loading || (!active && !selProject)}
          className={`w-full py-4 rounded-ios-lg text-headline font-bold flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-40 ${active ? 'bg-ios-red text-white' : 'bg-ios-blue text-white'}`}>
          {loading ? <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> :
            active ? <><Square className="w-5 h-5" fill="white" />Stop Timer</> : <><Play className="w-5 h-5" fill="white" />Start Timer</>}
        </button>
        {active && <p className="text-footnote text-ios-tertiary mt-3">Started at {fmtTime(active.start_time)}</p>}
      </div>

      {/* Today total */}
      {todayTotal > 0 && (
        <div className="flex items-center justify-between px-1">
          <p className="text-subhead font-semibold text-ios-secondary">Today total</p>
          <p className="text-subhead font-bold text-ios-primary">{fmtDuration(todayTotal)}</p>
        </div>
      )}

      {/* Add past time form */}
      {showAddPast && (
        <div className="card p-4 border-2 border-ios-blue/30">
          <div className="flex items-center justify-between mb-3">
            <p className="text-headline font-semibold text-ios-primary">Add past time entry</p>
            <button onClick={() => setShowAddPast(false)}><X className="w-4 h-4 text-ios-tertiary" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="input-label">Project *</label>
              <select className="input" value={pastForm.project_id} onChange={e => setPastForm({...pastForm, project_id: e.target.value})}>
                <option value="">— Select project —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="input-label">Description</label>
              <input className="input" placeholder="What did you work on?" value={pastForm.description} onChange={e => setPastForm({...pastForm, description: e.target.value})} />
            </div>
            <div>
              <label className="input-label">Date</label>
              <input className="input" type="date" value={pastForm.date} onChange={e => setPastForm({...pastForm, date: e.target.value})} />
            </div>
            <div>
              <label className="input-label">Start time (optional)</label>
              <input className="input" type="time" value={pastForm.start_time} onChange={e => setPastForm({...pastForm, start_time: e.target.value})} />
            </div>
            <div className="col-span-2">
              <label className="input-label">Duration (minutes) *</label>
              <input className="input" type="number" placeholder="e.g. 90 = 1h 30m" value={pastForm.duration_minutes} onChange={e => setPastForm({...pastForm, duration_minutes: e.target.value})} />
              {pastForm.duration_minutes && <p className="text-caption1 text-ios-secondary mt-1">= {fmtDuration(Math.round(parseFloat(pastForm.duration_minutes||0)*60))}</p>}
            </div>
          </div>
          <div className="flex gap-3 mt-3">
            <button className="btn-secondary flex-1" onClick={() => setShowAddPast(false)}>Cancel</button>
            <button className="btn-primary flex-1" onClick={addPastEntry} disabled={!pastForm.project_id || !pastForm.duration_minutes}>Add Entry</button>
          </div>
        </div>
      )}

      {/* History */}
      {Object.entries(grouped).map(([day, dayEntries]) => {
        const dayTotal = dayEntries.reduce((a,e) => a+(e.duration_seconds||0), 0);
        return (
          <div key={day} className="card">
            <div className="flex items-center justify-between px-4 py-3 border-b border-ios-separator/50">
              <p className="text-subhead font-semibold text-ios-primary">{day}</p>
              <p className="text-footnote font-semibold text-ios-secondary">{fmtDuration(dayTotal)}</p>
            </div>
            {dayEntries.map(e => {
              const isEditing = editingEntry === e.id;
              return (
                <div key={e.id} className="border-b border-ios-separator/20 last:border-0">
                  {isEditing ? (
                    <div className="px-4 py-3 space-y-2 bg-blue-50">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="input-label">Project</label>
                          <select className="input py-1.5 text-footnote" value={editForm.project_id} onChange={ev => setEditForm({...editForm, project_id: ev.target.value})}>
                            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="input-label">Duration (min)</label>
                          <input className="input py-1.5 text-footnote" type="number" value={editForm.duration_minutes}
                            onChange={ev => setEditForm({...editForm, duration_minutes: ev.target.value})} />
                        </div>
                        <div className="col-span-2">
                          <label className="input-label">Description</label>
                          <input className="input py-1.5 text-footnote" value={editForm.description} onChange={ev => setEditForm({...editForm, description: ev.target.value})} />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button className="btn-secondary flex-1 py-1.5 text-footnote" onClick={() => setEditingEntry(null)}>Cancel</button>
                        <button className="btn-primary flex-1 py-1.5 text-footnote" onClick={() => saveEditEntry(e)}>Save</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 px-4 py-3 group hover:bg-ios-bg">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: e.projects?.color||'#007AFF' }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-subhead font-medium text-ios-primary truncate">{e.projects?.name||'No project'}</p>
                        <p className="text-footnote text-ios-secondary">{e.tasks?.title||e.description||'—'} · {fmtTime(e.start_time)}–{fmtTime(e.end_time)}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-footnote font-semibold text-ios-secondary">{fmtDuration(e.duration_seconds||0)}</span>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => { setEditingEntry(e.id); setEditForm({ duration_minutes: Math.round((e.duration_seconds||0)/60).toString(), description: e.description||'', project_id: e.project_id||'' }); }}
                            className="p-1.5 rounded-ios hover:bg-ios-fill text-ios-tertiary hover:text-ios-blue">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => deleteEntry(e.id)} className="p-1.5 rounded-ios hover:bg-red-50 text-ios-tertiary hover:text-ios-red">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
