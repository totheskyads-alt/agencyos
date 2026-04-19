'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { fmtClock, fmtDuration, getElapsed, parseUTC } from '@/lib/utils';
import { Play, Square, X, Clock, Edit2, Check } from 'lucide-react';

export default function GlobalTimer() {
  const [activeTimer, setActiveTimer] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [projects, setProjects] = useState([]);
  const [userId, setUserId] = useState(null);
  const [showStart, setShowStart] = useState(false);
  const [selProject, setSelProject] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  // Stop overview
  const [stoppedEntry, setStoppedEntry] = useState(null);
  const [editDuration, setEditDuration] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const intervalRef = useRef(null);
  const dropRef = useRef(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) { setUserId(user.id); loadTimer(user.id); }
    });
    supabase.from('projects').select('id,name,color,clients(name)').eq('status','active').order('name')
      .then(({ data }) => setProjects(data||[]));
    const h = e => { if (dropRef.current && !dropRef.current.contains(e.target)) setShowStart(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
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
    setActiveTimer(data||null);
  }

  async function start() {
    if (!selProject || !userId || loading) return;
    setLoading(true);
    if (activeTimer) {
      await supabase.from('time_entries').update({ end_time: new Date().toISOString(), duration_seconds: getElapsed(activeTimer.start_time) }).eq('id', activeTimer.id);
    }
    const { data } = await supabase.from('time_entries').insert({
      user_id: userId, project_id: selProject,
      description: description||null, start_time: new Date().toISOString(),
    }).select('*, projects(name,color), tasks(title)').single();
    setActiveTimer(data);
    setShowStart(false); setSelProject(''); setDescription('');
    setLoading(false);
  }

  async function stop() {
    if (!activeTimer || loading) return;
    setLoading(true);
    const dur = getElapsed(activeTimer.start_time);
    await supabase.from('time_entries').update({ end_time: new Date().toISOString(), duration_seconds: dur }).eq('id', activeTimer.id);
    // Show stop overview
    setStoppedEntry({ ...activeTimer, duration_seconds: dur });
    setEditDuration(Math.round(dur/60).toString());
    setEditDesc(activeTimer.description||activeTimer.tasks?.title||'');
    setActiveTimer(null); setElapsed(0);
    setLoading(false);
  }

  async function saveStoppedEdit() {
    if (!stoppedEntry) return;
    const mins = parseFloat(editDuration)||0;
    const secs = Math.round(mins*60);
    const startUTC = parseUTC(stoppedEntry.start_time);
    const newEnd = new Date(startUTC.getTime() + secs*1000).toISOString();
    await supabase.from('time_entries').update({
      duration_seconds: secs, end_time: newEnd, description: editDesc||null,
    }).eq('id', stoppedEntry.id);
    setStoppedEntry(null);
  }

  if (!userId) return null;

  // Stop overview popup
  if (stoppedEntry) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 lg:left-60">
        <div className="bg-white border-t-2 border-ios-green shadow-ios-modal px-4 py-4">
          <div className="max-w-lg mx-auto">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 bg-ios-green rounded-full" />
                <p className="text-subhead font-semibold text-ios-primary">Timer stopped — review entry</p>
              </div>
              <button onClick={() => setStoppedEntry(null)} className="text-ios-tertiary hover:text-ios-primary"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="input-label">Project</label>
                <p className="text-subhead font-semibold text-ios-primary flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full inline-block" style={{ background: stoppedEntry.projects?.color||'#007AFF' }} />
                  {stoppedEntry.projects?.name||'—'}
                </p>
              </div>
              <div>
                <label className="input-label">Duration (edit if needed)</label>
                <div className="flex items-center gap-2">
                  <input className="input py-1.5 text-footnote w-24" type="number" value={editDuration} onChange={e => setEditDuration(e.target.value)} />
                  <span className="text-footnote text-ios-secondary">min = {fmtDuration(Math.round(parseFloat(editDuration||0)*60))}</span>
                </div>
              </div>
              <div className="col-span-2">
                <label className="input-label">Description</label>
                <input className="input py-1.5 text-footnote" value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="What did you work on?" />
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => setStoppedEntry(null)} className="btn-secondary flex-1 py-2 text-footnote">Discard</button>
              <button onClick={saveStoppedEdit} className="btn-primary flex-1 py-2 text-footnote flex items-center justify-center gap-1.5">
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
                {(activeTimer.tasks?.title||activeTimer.description) && <span className="opacity-75"> · {activeTimer.tasks?.title||activeTimer.description}</span>}
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
        <div ref={dropRef} className="bg-white border-t border-ios-separator shadow-ios-modal p-4">
          <div className="max-w-lg mx-auto space-y-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-subhead font-semibold text-ios-primary">Start Timer</p>
              <button onClick={() => setShowStart(false)} className="text-ios-tertiary hover:text-ios-primary"><X className="w-4 h-4" /></button>
            </div>
            <div>
              <label className="input-label">Project * (required)</label>
              <select className="input" value={selProject} onChange={e => setSelProject(e.target.value)} autoFocus>
                <option value="">— Select project —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}{p.clients?.name ? ` · ${p.clients.name}` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="input-label">Description (optional)</label>
              <input className="input" placeholder="What are you working on?" value={description} onChange={e => setDescription(e.target.value)}
                onKeyDown={e => e.key==='Enter' && selProject && start()} />
            </div>
            <div className="flex gap-2">
              <button className="btn-secondary flex-1" onClick={() => setShowStart(false)}>Cancel</button>
              <button className="btn-primary flex-1" onClick={start} disabled={!selProject||loading}>
                {loading ? 'Starting...' : <><Play className="w-4 h-4 inline mr-1" fill="white"/>Start Timer</>}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white border-t border-ios-separator/50 px-4 py-2 flex items-center justify-end">
          <button onClick={() => setShowStart(true)}
            className="flex items-center gap-2 px-4 py-2 bg-ios-blue text-white rounded-ios text-footnote font-semibold hover:opacity-90 shadow-ios-sm">
            <Play className="w-3.5 h-3.5" fill="white" /> Start Timer
          </button>
        </div>
      )}
    </div>
  );
}
