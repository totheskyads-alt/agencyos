'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useTimer } from '@/lib/timerContext';
import { fmtClock, fmtDuration, fmtTime, getElapsed, parseUTC } from '@/lib/utils';
import { Square, Pause, Play, Edit2, Trash2, Plus, X, RotateCcw } from 'lucide-react';
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
  const { activeTimer, elapsed, isPaused, startTimer, stopTimer, pauseTimer } = useTimer();
  const [projects, setProjects] = useState([]);
  const [entries, setEntries] = useState([]);
  const [user, setUser] = useState(null);
  const [editingEntry, setEditingEntry] = useState(null);
  const [editForm, setEditForm] = useState({ duration_minutes:'', description:'', project_id:'' });
  const [showPast, setShowPast] = useState(false);
  const [pastForm, setPastForm] = useState({ project_id:'', description:'', date: new Date().toISOString().slice(0,10), start_time:'', duration_minutes:'' });
  const [savingPast, setSavingPast] = useState(false);
  const [pastProjSearch, setPastProjSearch] = useState('');
  const [showStart, setShowStart] = useState(false);
  const [startForm, setStartForm] = useState({ project_id: '', description: '' });
  const [startProjSearch, setStartProjSearch] = useState('');
  const [startingTimer, setStartingTimer] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => { setUser(user); loadData(user); });
  }, []);

  useEffect(() => { if (user) loadData(user); }, [activeTimer]);

  async function loadData(u) {
    if (!u) return;
    const [{ data: proj }, { data: ent }] = await Promise.all([
      supabase.from('projects').select('id,name,color,clients(name)').eq('status','active').order('name'),
      supabase.from('time_entries').select('*, projects(name,color,clients(name)), tasks(title)')
        .eq('user_id', u.id).not('end_time','is',null).order('created_at',{ascending:false}).limit(60),
    ]);
    setProjects(proj||[]);
    setEntries(ent||[]);
  }

  async function handleStop() {
    await stopTimer();
    if (user) setTimeout(() => loadData(user), 600);
  }



  function restartFromEntry(entry) {
    // Open start popup pre-filled — safer than auto-starting
    const projName = projects.find(p => p.id === entry.project_id)?.name || '';
    setStartForm({
      project_id: entry.project_id || '',
      description: entry.description || entry.tasks?.title || '',
    });
    setStartProjSearch(projName);
    setShowStart(true);
  }

  async function handleStartTimer() {
    if (!startForm.project_id || startingTimer) return;
    setStartingTimer(true);
    try {
      const result = await startTimer({
        projectId: startForm.project_id,
        description: startForm.description || null,
      });
      if (result) {
        setShowStart(false);
        setStartForm({ project_id: '', description: '' });
        setStartProjSearch('');
        setTimeout(() => loadData(user), 1000);
      }
    } catch (err) {
      console.error('Start error:', err);
    } finally {
      setStartingTimer(false);
    }
  }

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
    // Use local time to avoid timezone shifting the date
    const timeStr = pastForm.start_time || '09:00';
    const localStr = `${pastForm.date}T${timeStr}:00`;
    const startTime = new Date(localStr + (localStr.includes('Z') ? '' : '')).toISOString();
    // Force the date to stay correct: create in local time
    const d = new Date(pastForm.date + 'T' + timeStr + ':00');
    const startTime2 = new Date(d.getTime()).toISOString();
    const endTime = new Date(d.getTime() + secs * 1000).toISOString();
    await supabase.from('time_entries').insert({
      user_id: user.id, project_id: pastForm.project_id,
      description: pastForm.description || null,
      start_time: startTime2, end_time: endTime, duration_seconds: secs,
    });
    setShowPast(false);
    setPastForm({ project_id:'', description:'', date: new Date().toISOString().slice(0,10), start_time:'', duration_minutes:'' });
    setSavingPast(false); loadData(user);
  }

  const grouped = entries.reduce((acc, e) => {
    const key = fmtDateGroup(e.created_at);
    if (!acc[key]) acc[key] = [];
    acc[key].push(e);
    return acc;
  }, {});

  const todayTotal = (grouped['Today']||[]).reduce((a,e) => a+(e.duration_seconds||0), 0);
  const effectiveElapsed = elapsed; // context already applies pause offset

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-title2 font-bold text-ios-primary">Timer</h1>
          <p className="text-subhead text-ios-secondary">Track your working time</p>
        </div>
        <button onClick={() => setShowPast(true)} className="btn-secondary flex items-center gap-2 text-footnote">
          <Plus className="w-3.5 h-3.5" /> Add past time
        </button>
      </div>

      {/* Active timer */}
      {activeTimer ? (
        <div className="card overflow-hidden">
          <div className={`p-6 text-center text-white ${isPaused ? 'bg-ios-orange' : 'bg-ios-blue'}`}>
            <p className="text-caption1 font-medium opacity-75 mb-1">{activeTimer.projects?.name}</p>
            {(activeTimer.tasks?.title||activeTimer.description) && (
              <p className="text-footnote opacity-60 mb-3">{activeTimer.tasks?.title||activeTimer.description}</p>
            )}
            <div className="font-mono text-[52px] font-bold tracking-tight" style={{lineHeight:1}}>
              {fmtClock(effectiveElapsed)}
            </div>
            {isPaused && <p className="text-caption1 opacity-80 mt-2 font-semibold">⏸ Paused</p>}
            {!isPaused && <p className="text-caption1 opacity-60 mt-2">Started {fmtTime(activeTimer.start_time)}</p>}
          </div>
          <div className="p-4 grid grid-cols-2 gap-3">
            <button onClick={pauseTimer}
              className={`py-3 rounded-ios-lg font-semibold text-subhead flex items-center justify-center gap-2 transition-colors ${isPaused ? 'bg-blue-50 border border-blue-100 text-ios-blue' : 'bg-orange-50 border border-orange-100 text-ios-orange'}`}>
              {isPaused ? <><Play className="w-4 h-4" fill="currentColor" />Resume</> : <><Pause className="w-4 h-4" fill="currentColor" />Pause</>}
            </button>
            <button onClick={handleStop}
              className="py-3 rounded-ios-lg bg-red-50 border border-red-100 text-ios-red font-semibold text-subhead flex items-center justify-center gap-2 hover:bg-red-100 transition-colors">
              <Square className="w-4 h-4" fill="currentColor" /> Stop
            </button>
          </div>
        </div>
      ) : (
        <div className="card p-6 text-center">
          <div className="w-16 h-16 bg-ios-fill rounded-full flex items-center justify-center mx-auto mb-3">
            <Play className="w-7 h-7 text-ios-tertiary" />
          </div>
          <p className="text-subhead font-semibold text-ios-secondary">No active timer</p>
          <p className="text-footnote text-ios-tertiary mt-1">Use the <strong>Start Timer</strong> button (bottom right)</p>
        </div>
      )}

      {/* Stats */}
      {todayTotal > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="card p-4 text-center">
            <p className="text-title3 font-bold text-ios-blue">{fmtDuration(todayTotal)}</p>
            <p className="text-caption1 text-ios-secondary">Today</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-title3 font-bold text-ios-purple">{fmtDuration(entries.reduce((a,e)=>a+(e.duration_seconds||0),0))}</p>
            <p className="text-caption1 text-ios-secondary">Recent total</p>
          </div>
        </div>
      )}

      {/* History */}
      {Object.entries(grouped).map(([day, dayEntries]) => {
        const dayTotal = dayEntries.reduce((a,e) => a+(e.duration_seconds||0), 0);
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
                          {editForm.duration_minutes && <p className="text-caption2 text-ios-secondary mt-0.5">= {fmtDuration(Math.round(parseFloat(editForm.duration_minutes||0)*60))}</p>}
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
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: e.projects?.color||'#007AFF' }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-subhead font-medium text-ios-primary truncate">{e.projects?.name||'No project'}</p>
                        <p className="text-caption1 text-ios-secondary">
                          {e.tasks?.title||e.description||'—'} · {fmtTime(e.start_time)}–{fmtTime(e.end_time)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-footnote font-semibold text-ios-secondary">{fmtDuration(e.duration_seconds||0)}</span>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {/* Restart button */}
                          <button onClick={() => restartFromEntry(e)}
                            className="p-1.5 rounded-ios hover:bg-green-50 text-ios-tertiary hover:text-ios-green transition-colors"
                            title="Restart this timer">
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
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
        </div>
      )}

      {/* Start Timer Popup */}
      {showStart && (
        <Modal title="Start Timer" onClose={() => setShowStart(false)}>
          <div className="space-y-4">
            <div>
              <label className="input-label">Project *</label>
              <div className="relative">
                <input className="input" placeholder="Search project..."
                  value={startForm.project_id ? (projects.find(p=>p.id===startForm.project_id)?.name || startProjSearch) : startProjSearch}
                  onChange={e => { setStartProjSearch(e.target.value); setStartForm(f=>({...f, project_id:''})); }}
                  onFocus={() => { if (startForm.project_id) { setStartProjSearch(''); setStartForm(f=>({...f,project_id:''})); }}}
                  autoFocus
                />
                {!startForm.project_id && (
                  <div className="absolute z-30 w-full bg-white rounded-ios shadow-ios-modal border border-ios-separator/30 max-h-48 overflow-y-auto mt-1">
                    {projects.filter(p => p.name.toLowerCase().includes(startProjSearch.toLowerCase())).map(p => (
                      <button key={p.id} onClick={() => { setStartForm(f=>({...f,project_id:p.id})); setStartProjSearch(p.name); }}
                        className="flex items-center w-full px-3 py-2.5 hover:bg-ios-fill text-left gap-2">
                        <div className="w-2 h-2 rounded-full" style={{background:p.color||'#007AFF'}} />
                        <div>
                          <p className="text-subhead font-medium">{p.name}</p>
                          {p.clients?.name && <p className="text-caption1 text-ios-secondary">{p.clients.name}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="input-label">Description (optional)</label>
              <input className="input" value={startForm.description}
                onChange={e => setStartForm(f=>({...f,description:e.target.value}))}
                placeholder="What are you working on?"
                onKeyDown={e => { if (e.key==='Enter' && startForm.project_id) handleStartTimer(); }}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button className="btn-secondary flex-1" onClick={() => setShowStart(false)}>Cancel</button>
              <button className="btn-primary flex-1 flex items-center justify-center gap-2"
                onClick={handleStartTimer} disabled={!startForm.project_id || startingTimer}>
                {startingTimer ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/> : <><Play className="w-4 h-4" fill="white"/>Start</>}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add past time Modal */}
      {showPast && (
        <Modal title="Add past time entry" onClose={() => setShowPast(false)}>
          <div className="space-y-4">
            <div>
              <label className="input-label">Project *</label>
              <div className="relative">
                <input className="input" placeholder="Search project..."
                  value={pastForm.project_id ? (projects.find(p=>p.id===pastForm.project_id)?.name||'') : pastProjSearch}
                  onChange={e => { setPastProjSearch(e.target.value); setPastForm({...pastForm, project_id: ''}); }}
                  onFocus={() => { if (pastForm.project_id) { setPastProjSearch(''); setPastForm({...pastForm, project_id: ''}); } }}
                />
                {!pastForm.project_id && (
                  <div className="absolute z-30 w-full bg-white rounded-ios shadow-ios-modal border border-ios-separator/30 max-h-40 overflow-y-auto mt-1">
                    {projects.filter(p => p.name.toLowerCase().includes(pastProjSearch.toLowerCase())).map(p => (
                      <button key={p.id} onClick={() => { setPastForm({...pastForm, project_id: p.id}); setPastProjSearch(''); }}
                        className="flex items-center w-full px-3 py-2.5 hover:bg-ios-fill text-left gap-2">
                        <div className="w-2 h-2 rounded-full" style={{background: p.color||'#007AFF'}} />
                        <span className="text-subhead">{p.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="input-label">Description</label>
              <input className="input" placeholder="What did you work on?" value={pastForm.description} onChange={e => setPastForm({...pastForm, description: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="input-label">Date</label>
                <input className="input" type="date" value={pastForm.date} onChange={e => setPastForm({...pastForm, date: e.target.value})} />
              </div>
              <div><label className="input-label">Start time (optional)</label>
                <input className="input" type="time" value={pastForm.start_time} onChange={e => setPastForm({...pastForm, start_time: e.target.value})} />
              </div>
            </div>
            <div>
              <label className="input-label">Duration (minutes) *</label>
              <input className="input" type="number" placeholder="e.g. 90 = 1h 30m" value={pastForm.duration_minutes} onChange={e => setPastForm({...pastForm, duration_minutes: e.target.value})} />
              {pastForm.duration_minutes && <p className="text-caption1 text-ios-secondary mt-1">= {fmtDuration(Math.round(parseFloat(pastForm.duration_minutes||0)*60))}</p>}
            </div>
            <div className="flex gap-3 pt-2">
              <button className="btn-secondary flex-1" onClick={() => setShowPast(false)}>Cancel</button>
              <button className="btn-primary flex-1" onClick={addPast} disabled={!pastForm.project_id||!pastForm.duration_minutes||savingPast}>
                {savingPast ? 'Saving...' : 'Add Entry'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
