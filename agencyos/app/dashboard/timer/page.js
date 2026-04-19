'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useTimer } from '@/lib/timerContext';
import { fmtClock, fmtDuration, fmtTime, getElapsed, parseUTC } from '@/lib/utils';
import { Square, Edit2, Trash2, Plus, X, Check, Clock } from 'lucide-react';
import Modal from '@/components/Modal';

function fmtDateGroup(dateStr) {
  const d = parseUTC(dateStr);
  if (!d) return 'Unknown';
  const today = new Date(); today.setHours(0,0,0,0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate()-1);
  const ed = new Date(d); ed.setHours(0,0,0,0);
  if (ed.getTime() === today.getTime()) return 'Today';
  if (ed.getTime() === yesterday.getTime()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday:'long', day:'numeric', month:'short' });
}

export default function TimerPage() {
  const { activeTimer, elapsed, stopTimer } = useTimer();
  const [projects, setProjects] = useState([]);
  const [entries, setEntries] = useState([]);
  const [user, setUser] = useState(null);
  const [editingEntry, setEditingEntry] = useState(null);
  const [editForm, setEditForm] = useState({ duration_minutes:'', description:'', project_id:'' });
  const [showPast, setShowPast] = useState(false);
  const [pastForm, setPastForm] = useState({
    project_id:'', description:'',
    date: new Date().toISOString().slice(0,10),
    start_time:'', duration_minutes:'',
  });
  const [savingPast, setSavingPast] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => { setUser(user); loadData(user); });
  }, []);

  useEffect(() => { if (user) loadData(user); }, [activeTimer]);

  async function loadData(u) {
    if (!u) return;
    const [{ data: proj }, { data: ent }] = await Promise.all([
      supabase.from('projects').select('id,name,color,clients(name)').eq('status','active').order('name'),
      supabase.from('time_entries')
        .select('*, projects(name,color,clients(name)), tasks(title)')
        .eq('user_id', u.id).not('end_time','is',null)
        .order('created_at', { ascending: false }).limit(60),
    ]);
    setProjects(proj || []);
    setEntries(ent || []);
  }

  async function handleStop() { await stopTimer(); if (user) setTimeout(() => loadData(user), 600); }

  async function saveEdit(entry) {
    if (!editForm.duration_minutes) return;
    const secs = Math.round(parseFloat(editForm.duration_minutes) * 60);
    const start = parseUTC(entry.start_time || entry.created_at);
    const newEnd = new Date(start.getTime() + secs * 1000).toISOString();
    await supabase.from('time_entries').update({
      duration_seconds: secs, end_time: newEnd,
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

  async function addPast() {
    if (!pastForm.project_id || !pastForm.duration_minutes || !user) return;
    setSavingPast(true);
    const secs = Math.round(parseFloat(pastForm.duration_minutes) * 60);
    const startTime = new Date(`${pastForm.date}T${pastForm.start_time || '09:00'}:00`).toISOString();
    const endTime = new Date(new Date(startTime).getTime() + secs * 1000).toISOString();
    await supabase.from('time_entries').insert({
      user_id: user.id, project_id: pastForm.project_id,
      description: pastForm.description || null,
      start_time: startTime, end_time: endTime, duration_seconds: secs,
    });
    setShowPast(false);
    setPastForm({ project_id:'', description:'', date: new Date().toISOString().slice(0,10), start_time:'', duration_minutes:'' });
    setSavingPast(false);
    loadData(user);
  }

  const grouped = entries.reduce((acc, e) => {
    const key = fmtDateGroup(e.created_at);
    if (!acc[key]) acc[key] = [];
    acc[key].push(e);
    return acc;
  }, {});

  const todayTotal = (grouped['Today'] || []).reduce((a,e) => a + (e.duration_seconds||0), 0);
  const weekTotal = entries.reduce((a,e) => a + (e.duration_seconds||0), 0);

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-title2 font-bold text-ios-primary">Timer</h1>
          <p className="text-subhead text-ios-secondary">Track your working time</p>
        </div>
        <button onClick={() => setShowPast(true)}
          className="btn-secondary flex items-center gap-2 text-footnote">
          <Plus className="w-3.5 h-3.5" /> Add past time
        </button>
      </div>

      {/* Active timer card */}
      {activeTimer ? (
        <div className="card overflow-hidden">
          <div className="bg-ios-blue p-6 text-center text-white">
            <p className="text-caption1 font-medium opacity-75 mb-1">{activeTimer.projects?.name}</p>
            {(activeTimer.tasks?.title || activeTimer.description) && (
              <p className="text-footnote opacity-60 mb-3">{activeTimer.tasks?.title || activeTimer.description}</p>
            )}
            <div className="font-mono text-[52px] font-bold tracking-tight" style={{ lineHeight: 1 }}>
              {fmtClock(elapsed)}
            </div>
            <p className="text-caption1 opacity-60 mt-2">Started at {fmtTime(activeTimer.start_time)}</p>
          </div>
          <div className="p-4">
            <button onClick={handleStop}
              className="w-full py-3.5 rounded-ios-lg bg-red-50 border border-red-100 text-ios-red font-semibold text-subhead flex items-center justify-center gap-2 hover:bg-red-100 transition-colors">
              <Square className="w-4 h-4" fill="currentColor" /> Stop Timer
            </button>
            <p className="text-caption1 text-ios-tertiary text-center mt-2">Timer visible on all pages via the floating button</p>
          </div>
        </div>
      ) : (
        <div className="card p-6 text-center">
          <div className="w-16 h-16 bg-ios-fill rounded-full flex items-center justify-center mx-auto mb-3">
            <Clock className="w-7 h-7 text-ios-tertiary" />
          </div>
          <p className="text-subhead font-semibold text-ios-secondary">No active timer</p>
          <p className="text-footnote text-ios-tertiary mt-1">Use the floating <strong>Start Timer</strong> button (bottom right)</p>
        </div>
      )}

      {/* Stats row */}
      {(todayTotal > 0 || weekTotal > 0) && (
        <div className="grid grid-cols-2 gap-3">
          <div className="card p-4 text-center">
            <p className="text-title3 font-bold text-ios-blue">{fmtDuration(todayTotal)}</p>
            <p className="text-caption1 text-ios-secondary">Today</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-title3 font-bold text-ios-purple">{fmtDuration(weekTotal)}</p>
            <p className="text-caption1 text-ios-secondary">Recent entries</p>
          </div>
        </div>
      )}

      {/* History */}
      {Object.entries(grouped).map(([day, dayEntries]) => {
        const dayTotal = dayEntries.reduce((a,e) => a + (e.duration_seconds||0), 0);
        return (
          <div key={day} className="card">
            <div className="flex items-center justify-between px-4 py-3 border-b border-ios-separator/30">
              <p className="text-subhead font-semibold text-ios-primary">{day}</p>
              <p className="text-footnote font-semibold text-ios-secondary">{fmtDuration(dayTotal)}</p>
            </div>
            {dayEntries.map(e => {
              const isEditing = editingEntry === e.id;
              return (
                <div key={e.id} className="border-b border-ios-separator/20 last:border-0">
                  {isEditing ? (
                    <div className="px-4 py-3 space-y-2 bg-blue-50/50">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="input-label">Project</label>
                          <select className="input py-1.5 text-footnote" value={editForm.project_id}
                            onChange={ev => setEditForm({...editForm, project_id: ev.target.value})}>
                            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="input-label">Duration (min)</label>
                          <input className="input py-1.5 text-footnote" type="number" value={editForm.duration_minutes}
                            onChange={ev => setEditForm({...editForm, duration_minutes: ev.target.value})} />
                          {editForm.duration_minutes && (
                            <p className="text-caption2 text-ios-secondary mt-0.5">= {fmtDuration(Math.round(parseFloat(editForm.duration_minutes||0)*60))}</p>
                          )}
                        </div>
                        <div className="col-span-2">
                          <label className="input-label">Description</label>
                          <input className="input py-1.5 text-footnote" value={editForm.description}
                            onChange={ev => setEditForm({...editForm, description: ev.target.value})} />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button className="btn-secondary flex-1 py-1.5 text-footnote" onClick={() => setEditingEntry(null)}>Cancel</button>
                        <button className="btn-primary flex-1 py-1.5 text-footnote" onClick={() => saveEdit(e)}>Save</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 px-4 py-3 group hover:bg-ios-bg/50 transition-colors">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: e.projects?.color || '#007AFF' }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-subhead font-medium text-ios-primary truncate">{e.projects?.name || 'No project'}</p>
                        <p className="text-caption1 text-ios-secondary">
                          {e.tasks?.title || e.description || '—'} · {fmtTime(e.start_time)}–{fmtTime(e.end_time)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-footnote font-semibold text-ios-secondary">{fmtDuration(e.duration_seconds||0)}</span>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => { setEditingEntry(e.id); setEditForm({ duration_minutes: Math.round((e.duration_seconds||0)/60).toString(), description: e.description||'', project_id: e.project_id||'' }); }}
                            className="p-1.5 rounded-ios hover:bg-ios-fill text-ios-tertiary hover:text-ios-blue">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => deleteEntry(e.id)}
                            className="p-1.5 rounded-ios hover:bg-red-50 text-ios-tertiary hover:text-ios-red">
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

      {entries.length === 0 && !activeTimer && (
        <div className="card p-10 text-center">
          <p className="text-subhead text-ios-secondary">No time entries yet</p>
          <p className="text-footnote text-ios-tertiary mt-1">Start tracking time from any task or the floating button</p>
        </div>
      )}

      {/* Add past time — Modal */}
      {showPast && (
        <Modal title="Add past time entry" onClose={() => setShowPast(false)}>
          <div className="space-y-4">
            <div>
              <label className="input-label">Project *</label>
              <select className="input" value={pastForm.project_id} onChange={e => setPastForm({...pastForm, project_id: e.target.value})}>
                <option value="">— Select project —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="input-label">Description</label>
              <input className="input" placeholder="What did you work on?" value={pastForm.description} onChange={e => setPastForm({...pastForm, description: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="input-label">Date</label>
                <input className="input" type="date" value={pastForm.date} onChange={e => setPastForm({...pastForm, date: e.target.value})} />
              </div>
              <div>
                <label className="input-label">Start time (optional)</label>
                <input className="input" type="time" value={pastForm.start_time} onChange={e => setPastForm({...pastForm, start_time: e.target.value})} />
              </div>
            </div>
            <div>
              <label className="input-label">Duration (minutes) *</label>
              <input className="input" type="number" placeholder="e.g. 90 = 1h 30m" value={pastForm.duration_minutes} onChange={e => setPastForm({...pastForm, duration_minutes: e.target.value})} />
              {pastForm.duration_minutes && (
                <p className="text-caption1 text-ios-secondary mt-1">= {fmtDuration(Math.round(parseFloat(pastForm.duration_minutes||0)*60))}</p>
              )}
            </div>
            <div className="flex gap-3 pt-2">
              <button className="btn-secondary flex-1" onClick={() => setShowPast(false)}>Cancel</button>
              <button className="btn-primary flex-1" onClick={addPast} disabled={!pastForm.project_id || !pastForm.duration_minutes || savingPast}>
                {savingPast ? 'Saving...' : 'Add Entry'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
