'use client';
import { useState, useRef } from 'react';
import { useTimer } from '@/lib/timerContext';
import { supabase } from '@/lib/supabase';
import { fmtClock, fmtDuration, getElapsed } from '@/lib/utils';
import { Play, Square, X, Check, ChevronDown } from 'lucide-react';

export default function GlobalTimer() {
  const { activeTimer, elapsed, stoppedEntry, startTimer, stopTimer, dismissOverview } = useTimer();
  const [projects, setProjects] = useState([]);
  const [showStart, setShowStart] = useState(false);
  const [selProject, setSelProject] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [editDuration, setEditDuration] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const dropRef = useRef(null);
  const [projectsLoaded, setProjectsLoaded] = useState(false);

  async function loadProjects() {
    if (projectsLoaded) return;
    const { data } = await supabase.from('projects').select('id,name,color,clients(name)').eq('status','active').order('name');
    setProjects(data||[]);
    setProjectsLoaded(true);
  }

  function openStart() {
    loadProjects();
    setShowStart(true);
  }

  async function handleStart() {
    if (!selProject || loading) return;
    setLoading(true);
    await startTimer({ projectId: selProject, description: description||null });
    setShowStart(false); setSelProject(''); setDescription('');
    setLoading(false);
  }

  async function handleStop() {
    if (loading) return;
    setLoading(true);
    await stopTimer();
    setLoading(false);
  }

  // When stoppedEntry appears, pre-fill edit form
  useState(() => {
    if (stoppedEntry) {
      setEditDuration(Math.round((stoppedEntry.duration_seconds||0)/60).toString());
      setEditDesc(stoppedEntry.tasks?.title||stoppedEntry.description||'');
    }
  }, [stoppedEntry]);

  async function saveEdit() {
    if (!stoppedEntry) return;
    const mins = parseFloat(editDuration)||0;
    const secs = Math.round(mins*60);
    const { parseUTC } = await import('@/lib/utils');
    const start = parseUTC(stoppedEntry.start_time);
    const newEnd = new Date(start.getTime() + secs*1000).toISOString();
    await supabase.from('time_entries').update({ duration_seconds: secs, end_time: newEnd, description: editDesc||null }).eq('id', stoppedEntry.id);
    dismissOverview();
  }

  // Stop overview
  if (stoppedEntry) {
    const dur = stoppedEntry.duration_seconds||0;
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 lg:left-60">
        <div className="bg-white border-t-2 border-ios-green shadow-ios-modal px-4 py-4">
          <div className="max-w-lg mx-auto">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 bg-ios-green rounded-full" />
                <p className="text-subhead font-semibold text-ios-primary">Timer stopped — review & edit</p>
              </div>
              <button onClick={dismissOverview} className="text-ios-tertiary hover:text-ios-primary"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <p className="input-label">Project</p>
                <p className="text-subhead font-semibold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full inline-block" style={{ background: stoppedEntry.projects?.color||'#007AFF' }} />
                  {stoppedEntry.projects?.name||'—'}
                </p>
                {stoppedEntry.tasks?.title && <p className="text-footnote text-ios-secondary mt-0.5">↳ {stoppedEntry.tasks.title}</p>}
              </div>
              <div>
                <p className="input-label">Recorded: {fmtDuration(dur)}</p>
                <div className="flex items-center gap-2">
                  <input className="input py-1.5 text-footnote w-20" type="number" min="0"
                    value={editDuration} onChange={e => setEditDuration(e.target.value)}
                    placeholder={Math.round(dur/60).toString()} />
                  <span className="text-footnote text-ios-secondary">min{editDuration && ` = ${fmtDuration(Math.round(parseFloat(editDuration||0)*60))}`}</span>
                </div>
              </div>
              <div className="col-span-2">
                <p className="input-label">Description</p>
                <input className="input py-1.5 text-footnote" value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="What did you work on?" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={dismissOverview} className="btn-secondary flex-1 py-2 text-footnote">Discard changes</button>
              <button onClick={saveEdit} className="btn-primary flex-1 py-2 text-footnote flex items-center justify-center gap-1.5">
                <Check className="w-3.5 h-3.5" /> Save Entry
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 lg:left-60">
      {activeTimer ? (
        <div className="bg-ios-blue text-white px-4 py-2.5 flex items-center justify-between shadow-ios-modal">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse shrink-0" />
            <div className="min-w-0">
              <p className="text-footnote font-semibold truncate">
                {activeTimer.projects?.name||'No project'}
                {(activeTimer.tasks?.title||activeTimer.description) &&
                  <span className="opacity-75"> · {activeTimer.tasks?.title||activeTimer.description}</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0 ml-3">
            <span className="font-mono text-title3 font-bold">{fmtClock(elapsed)}</span>
            <button onClick={handleStop} disabled={loading}
              className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-ios text-footnote font-semibold transition-colors disabled:opacity-50">
              <Square className="w-3.5 h-3.5" fill="white" /> Stop
            </button>
          </div>
        </div>
      ) : showStart ? (
        <div ref={dropRef} className="bg-white border-t border-ios-separator shadow-ios-modal p-4">
          <div className="max-w-lg mx-auto space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-subhead font-semibold text-ios-primary">Start Timer</p>
              <button onClick={() => setShowStart(false)} className="text-ios-tertiary"><X className="w-4 h-4" /></button>
            </div>
            <div>
              <label className="input-label">Project * (required)</label>
              <div className="relative">
                <select className="input appearance-none pr-9" value={selProject} onChange={e => setSelProject(e.target.value)} autoFocus>
                  <option value="">— Select project —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}{p.clients?.name ? ` · ${p.clients.name}` : ''}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-tertiary pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="input-label">Description (optional)</label>
              <input className="input" placeholder="What are you working on?" value={description} onChange={e => setDescription(e.target.value)}
                onKeyDown={e => e.key==='Enter' && selProject && handleStart()} />
            </div>
            <div className="flex gap-2">
              <button className="btn-secondary flex-1" onClick={() => setShowStart(false)}>Cancel</button>
              <button className="btn-primary flex-1" onClick={handleStart} disabled={!selProject||loading}>
                {loading ? 'Starting...' : <><Play className="w-4 h-4 inline mr-1" fill="white"/>Start</>}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white border-t border-ios-separator/50 px-4 py-2 flex items-center justify-end shadow-sm">
          <button onClick={openStart}
            className="flex items-center gap-2 px-4 py-2 bg-ios-blue text-white rounded-ios text-footnote font-semibold hover:opacity-90 shadow-ios-sm">
            <Play className="w-3.5 h-3.5" fill="white" /> Start Timer
          </button>
        </div>
      )}
    </div>
  );
}
