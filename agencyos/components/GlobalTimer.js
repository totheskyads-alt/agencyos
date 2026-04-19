'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { fmtClock, getElapsed } from '@/lib/utils';
import { Play, Square, Clock, ChevronDown, X } from 'lucide-react';

export default function GlobalTimer() {
  const [activeTimer, setActiveTimer] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [projects, setProjects] = useState([]);
  const [userId, setUserId] = useState(null);
  const [showStart, setShowStart] = useState(false);
  const [selProject, setSelProject] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef(null);
  const dropRef = useRef(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) { setUserId(user.id); loadTimer(user.id); }
    });
    supabase.from('projects').select('id,name,color,clients(name)').eq('status','active').order('name')
      .then(({ data }) => setProjects(data || []));

    // Listen for timer changes from other parts of the app
    const channel = supabase.channel('timer-updates').on('broadcast', { event: 'timer-change' }, () => {
      supabase.auth.getUser().then(({ data: { user } }) => user && loadTimer(user.id));
    }).subscribe();

    const h = e => { if (dropRef.current && !dropRef.current.contains(e.target)) setShowStart(false); };
    document.addEventListener('mousedown', h);
    return () => { supabase.removeChannel(channel); document.removeEventListener('mousedown', h); };
  }, []);

  useEffect(() => {
    clearInterval(intervalRef.current);
    if (!activeTimer?.start_time) { setElapsed(0); return; }
    const tick = () => setElapsed(getElapsed(activeTimer.start_time));
    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => clearInterval(intervalRef.current);
  }, [activeTimer]);

  async function loadTimer(uid) {
    const { data } = await supabase.from('time_entries')
      .select('*, projects(name,color), tasks(title)')
      .eq('user_id', uid).is('end_time', null).maybeSingle();
    setActiveTimer(data || null);
  }

  async function start() {
    if (!selProject || !userId || loading) return;
    setLoading(true);
    if (activeTimer) {
      await supabase.from('time_entries').update({
        end_time: new Date().toISOString(), duration_seconds: getElapsed(activeTimer.start_time),
      }).eq('id', activeTimer.id);
    }
    const { data } = await supabase.from('time_entries').insert({
      user_id: userId, project_id: selProject,
      description: description || null,
      start_time: new Date().toISOString(),
    }).select('*, projects(name,color), tasks(title)').single();
    setActiveTimer(data);
    setShowStart(false); setSelProject(''); setDescription('');
    setLoading(false);
  }

  async function stop() {
    if (!activeTimer || loading) return;
    setLoading(true);
    await supabase.from('time_entries').update({
      end_time: new Date().toISOString(), duration_seconds: getElapsed(activeTimer.start_time),
    }).eq('id', activeTimer.id);
    setActiveTimer(null); setElapsed(0);
    setLoading(false);
  }

  if (!userId) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 lg:left-60">
      {activeTimer ? (
        /* Active timer bar */
        <div className="bg-ios-blue text-white px-4 py-2.5 flex items-center justify-between shadow-ios-modal">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse shrink-0" />
            <div className="min-w-0">
              <p className="text-footnote font-semibold truncate">
                {activeTimer.projects?.name || 'No project'}
                {activeTimer.tasks?.title && <span className="opacity-75"> · {activeTimer.tasks.title}</span>}
                {activeTimer.description && !activeTimer.tasks?.title && <span className="opacity-75"> · {activeTimer.description}</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0 ml-3">
            <span className="font-mono text-title3 font-bold">{fmtClock(elapsed)}</span>
            <button onClick={stop} disabled={loading}
              className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-ios text-footnote font-semibold transition-colors">
              <Square className="w-3.5 h-3.5" fill="white" /> Stop
            </button>
          </div>
        </div>
      ) : showStart ? (
        /* Start timer dropdown */
        <div ref={dropRef} className="bg-white border-t border-ios-separator shadow-ios-modal p-4">
          <div className="max-w-lg mx-auto space-y-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-subhead font-semibold text-ios-primary">Start Timer</p>
              <button onClick={() => setShowStart(false)} className="text-ios-tertiary hover:text-ios-primary"><X className="w-4 h-4" /></button>
            </div>
            <div>
              <label className="input-label">Project *</label>
              <select className="input" value={selProject} onChange={e => setSelProject(e.target.value)} autoFocus>
                <option value="">— Select project (required) —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}{p.clients?.name ? ` · ${p.clients.name}` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="input-label">Description (optional)</label>
              <input className="input" placeholder="What are you working on?" value={description} onChange={e => setDescription(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && selProject && start()} />
            </div>
            <div className="flex gap-2">
              <button className="btn-secondary flex-1" onClick={() => setShowStart(false)}>Cancel</button>
              <button className="btn-primary flex-1" onClick={start} disabled={!selProject || loading}>
                {loading ? 'Starting...' : <><Play className="w-4 h-4 inline mr-1" fill="white" />Start Timer</>}
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Collapsed bar */
        <div className="bg-white border-t border-ios-separator/50 px-4 py-2 flex items-center justify-end">
          <button onClick={() => setShowStart(true)}
            className="flex items-center gap-2 px-4 py-2 bg-ios-blue text-white rounded-ios text-footnote font-semibold hover:opacity-90 transition-opacity shadow-ios-sm">
            <Play className="w-3.5 h-3.5" fill="white" /> Start Timer
          </button>
        </div>
      )}
    </div>
  );
}
