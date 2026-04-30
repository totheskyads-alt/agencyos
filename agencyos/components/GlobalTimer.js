'use client';
import { useState, useRef, useEffect } from 'react';
import { useTimer } from '@/lib/timerContext';
import { supabase } from '@/lib/supabase';
import { getProjectAccess } from '@/lib/projectAccess';
import { fmtClock, fmtDuration, parseUTC } from '@/lib/utils';
import { Play, Square, Pause, X, Check, GripHorizontal } from 'lucide-react';

const TIMER_POSITION_KEY = 'sm_timer_position_v1';

function clampPosition(position, element) {
  if (!position || !element || typeof window === 'undefined') return position;
  const margin = 16;
  const leftInset = window.innerWidth >= 1024 ? 256 + margin : margin;
  const rect = element.getBoundingClientRect();
  return {
    x: Math.min(Math.max(position.x, leftInset), Math.max(leftInset, window.innerWidth - rect.width - margin)),
    y: Math.min(Math.max(position.y, margin), Math.max(margin, window.innerHeight - rect.height - margin)),
  };
}

export default function GlobalTimer({ hidden = false }) {
  const { activeTimer, elapsed, stoppedEntry, isPaused, startTimer, stopTimer, pauseTimer, dismissOverview } = useTimer();
  const [projects, setProjects] = useState([]);
  const [showStart, setShowStart] = useState(false);
  const [selProject, setSelProject] = useState('');
  const [projSearch, setProjSearch] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [editDuration, setEditDuration] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [floatingPosition, setFloatingPosition] = useState(null);
  const floatingRef = useRef(null);
  const dragRef = useRef({ active: false, offsetX: 0, offsetY: 0 });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem(TIMER_POSITION_KEY);
      if (saved) setFloatingPosition(JSON.parse(saved));
    } catch {}
  }, []);

  useEffect(() => {
    if (!floatingPosition || typeof window === 'undefined') return;
    try { localStorage.setItem(TIMER_POSITION_KEY, JSON.stringify(floatingPosition)); } catch {}
  }, [floatingPosition]);

  useEffect(() => {
    if (!floatingPosition || !floatingRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      setFloatingPosition(prev => {
        if (!prev || !floatingRef.current) return prev;
        const next = clampPosition(prev, floatingRef.current);
        if (next.x === prev.x && next.y === prev.y) return prev;
        return next;
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [floatingPosition, activeTimer, showStart]);

  useEffect(() => {
    function handlePointerMove(event) {
      if (!dragRef.current.active || !floatingRef.current) return;
      const next = clampPosition({
        x: event.clientX - dragRef.current.offsetX,
        y: event.clientY - dragRef.current.offsetY,
      }, floatingRef.current);
      setFloatingPosition(next);
    }

    function handlePointerUp() {
      dragRef.current.active = false;
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, []);

  useEffect(() => {
    function handleResize() {
      if (!floatingPosition || !floatingRef.current) return;
      setFloatingPosition(prev => clampPosition(prev, floatingRef.current));
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [floatingPosition]);

  useEffect(() => {
    if (stoppedEntry) {
      setEditDuration(Math.round((stoppedEntry.duration_seconds || 0) / 60).toString());
      setEditDesc(stoppedEntry.tasks?.title || stoppedEntry.description || '');
    }
  }, [stoppedEntry]);

  async function loadProjects() {
    if (projectsLoaded) return;
    const accessInfo = await getProjectAccess();
    if (accessInfo.isRestricted && accessInfo.projectIds.length === 0) {
      setProjects([]);
      setProjectsLoaded(true);
      return;
    }
    let projectQuery = supabase.from('projects').select('id,name,color,clients(name)').eq('status', 'active').order('name');
    if (accessInfo.isRestricted) projectQuery = projectQuery.in('id', accessInfo.projectIds);
    const { data } = await projectQuery;
    setProjects(data || []);
    setProjectsLoaded(true);
  }

  async function handleStart() {
    if (!selProject || loading) return;
    setLoading(true);
    // Reset saved position so active timer starts at its default CSS position (not off-screen)
    setFloatingPosition(null);
    try { localStorage.removeItem(TIMER_POSITION_KEY); } catch {}
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
    const start = parseUTC(stoppedEntry.start_time);
    const newEnd = new Date(start.getTime() + secs * 1000).toISOString();
    await supabase.from('time_entries').update({
      duration_seconds: secs, end_time: newEnd, description: editDesc || null,
    }).eq('id', stoppedEntry.id);
    dismissOverview();
  }

  async function discardStoppedEntry() {
    if (stoppedEntry?.id) {
      await supabase.from('time_entries').delete().eq('id', stoppedEntry.id);
    }
    dismissOverview();
  }

  function beginDrag(event) {
    if (!floatingRef.current) return;
    if (event.cancelable) event.preventDefault();
    const target = event.target;
    if (target instanceof HTMLElement) {
      const isHandle = target.closest('[data-timer-drag-handle="true"]');
      if (!isHandle && target.closest('button')) return;
    }
    if (event.currentTarget?.setPointerCapture) {
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
    }
    const rect = floatingRef.current.getBoundingClientRect();
    dragRef.current = {
      active: true,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    if (!floatingPosition) {
      setFloatingPosition({ x: rect.left, y: rect.top });
    }
  }

  const floatingStyle = floatingPosition
    ? { left: `${floatingPosition.x}px`, top: `${floatingPosition.y}px`, right: 'auto', bottom: 'auto', transform: 'none' }
    : undefined;

  if (hidden && !showStart && !stoppedEntry) {
    return null;
  }

  // ── Stop overview — centered modal ────────────────────────────────────────
  if (stoppedEntry) {
    return (
      <div className="fixed inset-0 z-[60] flex items-end justify-center pb-6 px-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-md bg-white rounded-2xl shadow-2xl border border-ios-separator/30 overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
          <div className="bg-ios-green/10 border-b border-ios-green/20 px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-ios-green rounded-full" />
              <p className="text-subhead font-semibold text-ios-green">Timer stopped — review entry</p>
            </div>
            <button onClick={discardStoppedEntry} className="text-ios-tertiary hover:text-ios-primary p-1" title="Discard entry">
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
              <button onClick={discardStoppedEntry}
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
      <div ref={floatingRef} style={floatingStyle} className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 lg:left-auto lg:translate-x-0 lg:right-6">
        <div className={`flex items-center gap-3 text-white px-4 py-3 rounded-2xl shadow-2xl transition-colors ${isPaused ? 'bg-ios-orange' : 'bg-ios-blue'}`}>
          <button
            type="button"
            onPointerDown={beginDrag}
            data-timer-drag-handle="true"
            className="shrink-0 p-1.5 rounded-xl bg-white/15 hover:bg-white/20 cursor-grab active:cursor-grabbing touch-none select-none"
            title="Move timer"
          >
            <GripHorizontal className="w-4 h-4" />
          </button>
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
      <div className="fixed inset-0 z-[60] flex items-center justify-center px-4 bg-black/20 backdrop-blur-sm"
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
              <div className="relative">
                <input className="input" placeholder="Search project..."
                  value={selProject ? (projects.find(p=>p.id===selProject)?.name || '') : projSearch}
                  onChange={e => { setProjSearch(e.target.value); setSelProject(''); }}
                  onFocus={() => { if (selProject) { setProjSearch(''); setSelProject(''); } }}
                  autoFocus
                />
                {!selProject && (
                  <div className="absolute z-30 w-full bg-white rounded-ios shadow-ios-modal border border-ios-separator/30 max-h-48 overflow-y-auto mt-1">
                    {projects.filter(p => p.name.toLowerCase().includes(projSearch.toLowerCase()) || (p.clients?.name||'').toLowerCase().includes(projSearch.toLowerCase())).map(p => (
                      <button key={p.id} onClick={() => { setSelProject(p.id); setProjSearch(''); }}
                        className="flex items-center w-full px-3 py-2.5 hover:bg-ios-fill text-left gap-2">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{background: p.color||'#007AFF'}} />
                        <div>
                          <p className="text-subhead font-medium">{p.name}</p>
                          {p.clients?.name && <p className="text-caption1 text-ios-secondary">{p.clients.name}</p>}
                        </div>
                      </button>
                    ))}
                    {projects.filter(p => p.name.toLowerCase().includes(projSearch.toLowerCase())).length === 0 && (
                      <p className="px-3 py-2 text-footnote text-ios-tertiary">No projects found</p>
                    )}
                  </div>
                )}
              </div>
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
    <div ref={floatingRef} style={floatingStyle} className="fixed bottom-6 right-6 z-40">
      <button onClick={() => { loadProjects(); setShowStart(true); }}
        className="flex items-center gap-2.5 bg-ios-blue text-white px-5 py-3 rounded-2xl shadow-2xl hover:opacity-95 active:scale-95 transition-all font-semibold text-subhead">
        <Play className="w-4 h-4" fill="white" /> Start Timer
      </button>
      <button
        type="button"
        onPointerDown={beginDrag}
        data-timer-drag-handle="true"
        className="absolute -top-2 -left-2 w-7 h-7 rounded-full bg-white text-ios-secondary shadow-ios flex items-center justify-center cursor-grab active:cursor-grabbing touch-none select-none"
        title="Move timer button"
      >
        <GripHorizontal className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
