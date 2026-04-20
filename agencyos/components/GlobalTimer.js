'use client';
import { useState, useRef, useEffect } from 'react';
import { useTimer } from '@/lib/timerContext';
import { supabase } from '@/lib/supabase';
import { fmtClock, fmtDuration, getElapsed } from '@/lib/utils';
import { Play, Square, Pause, X, Check, ChevronUp, ChevronDown } from 'lucide-react';

export default function GlobalTimer() {
  const { activeTimer, elapsed, stoppedEntry, isPaused, startTimer, stopTimer, pauseTimer, dismissOverview } = useTimer();
  const [projects, setProjects] = useState([]);
  const [showStart, setShowStart] = useState(false);
  const [selProject, setSelProject] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [editDuration, setEditDuration] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [projectsLoaded, setProjectsLoaded] = useState(false);

  useEffect(() => {
    if (stoppedEntry) {
      setEditDuration(Math.round((stoppedEntry.duration_seconds || 0) / 60).toString());
      setEditDesc(stoppedEntry.tasks?.title || stoppedEntry.description || '');
    }
  }, [stoppedEntry]);

  async function loadProjects() {
    if (projectsLoaded) return;
    const { data } = await supabase.from('projects').select('id,name,color,clients(name)').eq('status', 'active').order('name');
    setProjects(data || []);
    setProjectsLoaded(true);
  }

  async function handleStart() {
    if (!selProject || loading) return;
    setLoading(true);
    await startTimer({ projectId: selProject, description: description || null });
    setShowStart(false); setSelProject(''); setDescription('');
    setLoading(false);
  }

  async function handleStop() {
    if (loading) return;
    setLoading(true);
    await stopTimer();
    setLoading(false);
  }

  async function saveEdit() {
    if (!stoppedEntry) return;
    const mins = parseFloat(editDuration) || 0;
    const secs = Math.round(mins * 60);
    const start = new Date(stoppedEntry.start_time);
    const newEnd = new Date(start.getTime() + secs * 1000).toISOString();
    await supabase.from('time_entries').update({
      duration_seconds: secs, end_time: newEnd, description: editDesc || null,
    }).eq('id', stoppedEntry.id);
    dismissOverview();
  }

  // ── Stop overview — centered modal ────────────────────────────────────────
  if (stoppedEntry) {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center pb-6 px-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-md bg-white rounded-2xl shadow-2xl border border-ios-separator/30 overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
          <div className="bg-ios-green/10 border-b border-ios-green/20 px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-ios-green rounded-full" />
              <p className="text-subhead font-semibold text-ios-green">Timer stopped — review entry</p>
            </div>
            <button onClick={dismissOverview} className="text-ios-tertiary hover:text-ios-primary p-1">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-3 p-3 bg-ios-bg rounded-ios">
              <div className="w-3 h-3 rounded-full shrink-0" style={{ background: stoppedEntry.projects?.color || '#007AFF' }} />
              <div>
                <p className="text-subhead font-semibold">{stoppedEntry.projects?.name || '—'}</p>
                {stoppedEntry.tasks?.title && <p className="text-caption1 text-ios-secondary">↳ {stoppedEntry.tasks.title}</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="input-label">Duration (minutes)</label>
                <div className="flex items-center gap-2">
                  <input className="input text-center font-mono text-headline font-bold" type="number" min="0"
                    value={editDuration} onChange={e => setEditDuration(e.target.value)} />
                </div>
                {editDuration && <p className="text-caption1 text-ios-secondary mt-1 text-center">= {fmtDuration(Math.round(parseFloat(editDuration || 0) * 60))}</p>}
              </div>
              <div>
                <label className="input-label">Recorded</label>
                <p className="text-headline font-bold text-ios-primary mt-2">{fmtDuration(stoppedEntry.duration_seconds || 0)}</p>
              </div>
            </div>
            <div>
              <label className="input-label">Description</label>
              <input className="input" value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="What did you work on?" />
            </div>
            <div className="flex gap-3">
              <button onClick={async () => {
                  await supabase.from('time_entries').delete().eq('id', stoppedEntry.id);
                  dismissOverview();
                }}
                className="flex-1 py-2 rounded-ios text-footnote font-semibold text-white bg-ios-red hover:bg-red-600 transition-colors">
                Discard
              </button>
              <button onClick={saveEdit} className="btn-primary flex-1 flex items-center justify-center gap-1.5">
                <Check className="w-4 h-4" /> Save Entry
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Active timer — floating pill ──────────────────────────────────────────
  if (activeTimer) {
    return (
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 lg:left-auto lg:translate-x-0 lg:right-6">
        <div className={`flex items-center gap-3 text-white px-4 py-3 rounded-2xl shadow-2xl transition-colors ${isPaused ? 'bg-ios-orange' : 'bg-ios-blue'}`}>
          <div className={`w-2 h-2 bg-white rounded-full shrink-0 ${isPaused ? '' : 'animate-pulse'}`} />
          <div className="min-w-0 max-w-[140px]">
            <p className="text-caption1 font-medium opacity-80 truncate">{activeTimer.projects?.name}</p>
            {(activeTimer.tasks?.title || activeTimer.description) && (
              <p className="text-caption2 opacity-60 truncate">{activeTimer.tasks?.title || activeTimer.description}</p>
            )}
          </div>
          <span className="font-mono text-title3 font-bold tracking-tight">{fmtClock(elapsed)}</span>
          <button onClick={pauseTimer}
            className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 px-2.5 py-1.5 rounded-xl text-footnote font-semibold transition-colors">
            {isPaused ? <><Play className="w-3.5 h-3.5" fill="white" />Resume</> : <><Pause className="w-3.5 h-3.5" fill="white" />Pause</>}
          </button>
          <button onClick={handleStop} disabled={loading}
            className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 px-2.5 py-1.5 rounded-xl text-footnote font-semibold transition-colors disabled:opacity-50">
            <Square className="w-3.5 h-3.5" fill="white" /> Stop
          </button>
        </div>
      </div>
    );
  }

  // ── Start popup ───────────────────────────────────────────────────────────
  if (showStart) {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center pb-6 px-4 bg-black/20 backdrop-blur-sm"
        onClick={e => { if (e.target === e.currentTarget) setShowStart(false); }}>
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-ios-separator/20 overflow-hidden">
          <div className="px-5 pt-4 pb-2 flex items-center justify-between border-b border-ios-separator/30">
            <p className="text-headline font-bold text-ios-primary">Start Timer</p>
            <button onClick={() => setShowStart(false)} className="p-1 rounded-ios hover:bg-ios-fill text-ios-tertiary">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-5 space-y-3">
            <div>
              <label className="input-label">Project * (required)</label>
              <select className="input" value={selProject} onChange={e => setSelProject(e.target.value)} autoFocus>
                <option value="">— Select project —</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}{p.clients?.name ? ` · ${p.clients.name}` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="input-label">Description (optional)</label>
              <input className="input" placeholder="What are you working on?"
                value={description} onChange={e => setDescription(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && selProject && handleStart()} />
            </div>
            <div className="flex gap-3 pt-1">
              <button className="btn-secondary flex-1" onClick={() => setShowStart(false)}>Cancel</button>
              <button className="btn-primary flex-1 flex items-center justify-center gap-2" onClick={handleStart} disabled={!selProject || loading}>
                {loading ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <><Play className="w-4 h-4" fill="white" /> Start</>}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Idle — floating button ────────────────────────────────────────────────
  return (
    <div className="fixed bottom-6 right-6 z-50">
      <button onClick={() => { loadProjects(); setShowStart(true); }}
        className="flex items-center gap-2.5 bg-ios-blue text-white px-5 py-3 rounded-2xl shadow-2xl hover:opacity-95 active:scale-95 transition-all font-semibold text-subhead">
        <Play className="w-4 h-4" fill="white" /> Start Timer
      </button>
    </div>
  );
}
