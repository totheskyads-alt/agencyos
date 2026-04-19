'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/Modal';
import { fmtDate, getElapsed, fmtClock } from '@/lib/utils';
import {
  Plus, Search, ChevronDown, ArrowLeft, MessageSquare,
  Paperclip, Trash2, Send, Archive, Kanban, MoreHorizontal,
  Edit2, X, Check, LayoutList, User, Users, Tag, RotateCcw,
  Play, Square, Timer, FolderOpen
} from 'lucide-react';

const DEFAULT_BOARD_COLS = [
  { name: 'This Week',            color: '#007AFF' },
  { name: 'Later',               color: '#AEAEB2' },
  { name: 'Taskuri Săptămânale', color: '#FF9500' },
  { name: 'Rapoarte',            color: '#34C759' },
];

const PRIORITY_CFG = {
  low:    { label: 'Scăzut',  dot: '#AEAEB2' },
  medium: { label: 'Mediu',   dot: '#FF9500' },
  high:   { label: 'Ridicat', dot: '#FF3B30' },
  urgent: { label: 'Urgent',  dot: '#FF3B30' },
};

const COL_COLORS = ['#007AFF','#34C759','#FF9500','#FF3B30','#AF52DE','#32ADE6','#5856D6','#FF2D55','#AEAEB2'];

// ─── Timer Hook ───────────────────────────────────────────────────────────────
function useActiveTimer(currentUserId) {
  const [activeTimer, setActiveTimer] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef(null);

  async function loadTimer() {
    if (!currentUserId) return;
    const { data } = await supabase.from('time_entries')
      .select('*').eq('user_id', currentUserId).is('end_time', null).maybeSingle();
    setActiveTimer(data || null);
  }

  useEffect(() => {
    loadTimer();
  }, [currentUserId]);

  useEffect(() => {
    clearInterval(intervalRef.current);
    if (!activeTimer?.start_time) { setElapsed(0); return; }
    const tick = () => setElapsed(getElapsed(activeTimer.start_time));
    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => clearInterval(intervalRef.current);
  }, [activeTimer]);

  async function startTimer(task, userId) {
    // Stop existing timer if any
    if (activeTimer) {
      const dur = getElapsed(activeTimer.start_time);
      await supabase.from('time_entries').update({
        end_time: new Date().toISOString(), duration_seconds: dur,
      }).eq('id', activeTimer.id);
    }
    const { data } = await supabase.from('time_entries').insert({
      user_id: userId,
      task_id: task.id,
      project_id: task.project_id,
      description: task.title,
      start_time: new Date().toISOString(),
    }).select().single();
    setActiveTimer(data);
  }

  async function stopTimer() {
    if (!activeTimer) return;
    const dur = getElapsed(activeTimer.start_time);
    await supabase.from('time_entries').update({
      end_time: new Date().toISOString(), duration_seconds: dur,
    }).eq('id', activeTimer.id);
    setActiveTimer(null);
    setElapsed(0);
  }

  return { activeTimer, elapsed, startTimer, stopTimer, loadTimer };
}

// ─── Quick Timer Button ───────────────────────────────────────────────────────
function QuickTimer({ task, activeTimer, elapsed, onStart, onStop }) {
  const isActive = activeTimer?.task_id === task.id;
  return (
    <button
      onClick={e => { e.stopPropagation(); isActive ? onStop() : onStart(task); }}
      title={isActive ? 'Stop timer' : 'Start timer'}
      className={`flex items-center gap-1 px-2 py-1 rounded-ios text-caption1 font-semibold transition-all shrink-0 ${
        isActive
          ? 'bg-red-50 text-ios-red border border-red-100'
          : 'bg-blue-50 text-ios-blue border border-blue-100 opacity-0 group-hover:opacity-100'
      }`}>
      {isActive ? (
        <><Square className="w-3 h-3" fill="currentColor" /><span className="font-mono">{fmtClock(elapsed)}</span></>
      ) : (
        <><Play className="w-3 h-3" fill="currentColor" /><span>Start</span></>
      )}
    </button>
  );
}

// ─── Label Pill ───────────────────────────────────────────────────────────────
function LabelPill({ label, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white"
      style={{ background: label.color }}>
      {label.name}
      {onRemove && <button onClick={e => { e.stopPropagation(); onRemove(label.id); }} className="hover:opacity-70 ml-0.5"><X className="w-2.5 h-2.5" /></button>}
    </span>
  );
}

// ─── Task Detail Modal ────────────────────────────────────────────────────────
function TaskDetail({ task, members, boardColumns, projects, labels: allLabels, activeTimer, elapsed, onClose, onSave, onDelete, onStartTimer, onStopTimer, currentUser }) {
  const isNew = !task?.id;
  const isTimerActive = activeTimer?.task_id === task?.id;

  const [form, setForm] = useState({
    title: task?.title || '',
    description: task?.description || '',
    assigned_to: task?.assigned_to || currentUser?.id || '',
    priority: task?.priority || 'medium',
    due_date: task?.due_date || '',
    column_id: task?.column_id || boardColumns[0]?.id || '',
    project_id: task?.project_id || '',
    status: task?.status || 'todo',
  });
  const [comments, setComments] = useState([]);
  const [taskLabels, setTaskLabels] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [commentFile, setCommentFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [tab, setTab] = useState('details');
  const [showProjDrop, setShowProjDrop] = useState(false);
  const [projSearch, setProjSearch] = useState('');
  const [showNewProj, setShowNewProj] = useState(false);
  const [newProjName, setNewProjName] = useState('');
  const [newProjColor, setNewProjColor] = useState('#007AFF');
  const [showLabelDrop, setShowLabelDrop] = useState(false);
  const [labelSearch, setLabelSearch] = useState('');
  const [showNewLabel, setShowNewLabel] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState('#007AFF');
  const projRef = useRef(null);
  const labelRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (task?.id) { loadComments(); loadLabels(); }
  }, [task?.id]);

  // Auto-set first column if no column_id
  useEffect(() => {
    if (!form.column_id && boardColumns.length > 0) {
      setForm(prev => ({ ...prev, column_id: boardColumns[0].id }));
    }
  }, [boardColumns]);

  useEffect(() => {
    const h = e => {
      if (projRef.current && !projRef.current.contains(e.target)) setShowProjDrop(false);
      if (labelRef.current && !labelRef.current.contains(e.target)) setShowLabelDrop(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  async function loadComments() {
    const { data } = await supabase.from('task_comments')
      .select('*, profiles(full_name,email)').eq('task_id', task.id).order('created_at');
    setComments(data || []);
  }

  async function loadLabels() {
    const { data } = await supabase.from('task_labels')
      .select('*, labels(*)').eq('task_id', task.id);
    setTaskLabels((data || []).map(tl => tl.labels).filter(Boolean));
  }

  async function toggleLabel(label) {
    if (!task?.id) return;
    const has = taskLabels.some(l => l.id === label.id);
    if (has) {
      await supabase.from('task_labels').delete().eq('task_id', task.id).eq('label_id', label.id);
      setTaskLabels(prev => prev.filter(l => l.id !== label.id));
    } else {
      await supabase.from('task_labels').insert({ task_id: task.id, label_id: label.id });
      setTaskLabels(prev => [...prev, label]);
    }
  }

  async function createLabel() {
    if (!newLabelName.trim()) return;
    const { data } = await supabase.from('labels').insert({ name: newLabelName.trim(), color: newLabelColor }).select().single();
    if (data && task?.id) {
      await supabase.from('task_labels').insert({ task_id: task.id, label_id: data.id });
      setTaskLabels(prev => [...prev, data]);
    }
    setNewLabelName(''); setShowNewLabel(false);
    onSave();
  }

  async function save() {
    if (!form.title.trim() || !form.project_id) return;
    setLoading(true);
    const payload = {
      ...form,
      assigned_to: form.assigned_to || null,
      due_date: form.due_date || null,
      column_id: form.column_id || boardColumns[0]?.id || null,
    };
    if (task?.id) await supabase.from('tasks').update(payload).eq('id', task.id);
    else await supabase.from('tasks').insert({ ...payload, status: 'todo' });
    setLoading(false); onSave();
  }

  async function createProject() {
    if (!newProjName.trim()) return;
    const { data } = await supabase.from('projects').insert({ name: newProjName.trim(), color: newProjColor, status: 'active' }).select().single();
    if (data) setForm(prev => ({ ...prev, project_id: data.id }));
    setShowNewProj(false); setNewProjName(''); onSave();
  }

  async function addComment() {
    if (!newComment.trim() && !commentFile) return;
    setSending(true);
    let fileData = null;
    if (commentFile) {
      try {
        const path = `tasks/${task.id}/comments/${Date.now()}_${commentFile.name}`;
        const { error } = await supabase.storage.from('task-files').upload(path, commentFile);
        if (!error) {
          const { data: { publicUrl } } = supabase.storage.from('task-files').getPublicUrl(path);
          fileData = { name: commentFile.name, url: publicUrl, type: commentFile.type, size: commentFile.size };
        }
      } catch {}
    }
    await supabase.from('task_comments').insert({
      task_id: task.id,
      user_id: currentUser?.id,
      content: newComment.trim() || (fileData ? `📎 ${fileData.name}` : ''),
      ...(fileData ? { file_name: fileData.name, file_url: fileData.url, file_type: fileData.type, file_size: fileData.size } : {}),
    });
    setNewComment(''); setCommentFile(null); setSending(false); loadComments();
  }

  async function archiveTask() {
    await supabase.from('tasks').update({ is_archived: true, archived_at: new Date().toISOString() }).eq('id', task.id);
    onSave();
  }

  async function unarchiveTask() {
    await supabase.from('tasks').update({ is_archived: false, archived_at: null }).eq('id', task.id);
    onSave();
  }

  const selectedProject = projects.find(p => p.id === form.project_id);
  const filteredProjects = projects.filter(p =>
    p.name.toLowerCase().includes(projSearch.toLowerCase()) ||
    p.clients?.name?.toLowerCase().includes(projSearch.toLowerCase())
  );
  const filteredLabels = allLabels.filter(l => l.name.toLowerCase().includes(labelSearch.toLowerCase()));

  return (
    <Modal title={isNew ? 'Task nou' : task.title} onClose={onClose} size="lg">
      {/* Timer bar */}
      {!isNew && task?.id && (
        <div className={`flex items-center justify-between p-3 rounded-ios mb-4 -mt-1 ${isTimerActive ? 'bg-red-50 border border-red-100' : 'bg-blue-50 border border-blue-100'}`}>
          <div className="flex items-center gap-2">
            <Timer className={`w-4 h-4 ${isTimerActive ? 'text-ios-red' : 'text-ios-blue'}`} />
            <span className={`text-footnote font-semibold ${isTimerActive ? 'text-ios-red' : 'text-ios-blue'}`}>
              {isTimerActive ? `Timer activ — ${fmtClock(elapsed)}` : 'Pornește timer pe acest task'}
            </span>
          </div>
          <button onClick={() => isTimerActive ? onStopTimer() : onStartTimer(task)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-ios text-footnote font-semibold text-white transition-all ${isTimerActive ? 'bg-ios-red' : 'bg-ios-blue'}`}>
            {isTimerActive ? <><Square className="w-3.5 h-3.5" fill="white" /> Stop</> : <><Play className="w-3.5 h-3.5" fill="white" /> Start</>}
          </button>
        </div>
      )}

      {!isNew && (
        <div className="flex gap-0.5 bg-ios-fill p-1 rounded-ios mb-4">
          {[['details','Detalii'],['comments',`Comentarii${comments.length > 0 ? ` (${comments.length})` : ''}`]].map(([k,v]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`flex-1 py-1.5 rounded-ios-sm text-footnote font-semibold transition-all ${tab === k ? 'bg-white text-ios-primary shadow-ios-sm' : 'text-ios-secondary'}`}>{v}</button>
          ))}
        </div>
      )}

      {tab === 'details' && (
        <div className="space-y-4">
          {/* Project */}
          <div ref={projRef} className="relative">
            <label className="input-label">Proiect *</label>
            <button onClick={() => setShowProjDrop(!showProjDrop)}
              className={`input w-full flex items-center justify-between text-left ${!form.project_id ? 'text-ios-tertiary' : 'text-ios-primary'}`}>
              {selectedProject ? (
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: selectedProject.color }} />
                  {selectedProject.name}
                  {selectedProject.clients?.name && <span className="text-ios-tertiary text-footnote">· {selectedProject.clients.name}</span>}
                </span>
              ) : '— Selectează proiect (obligatoriu) —'}
              <ChevronDown className="w-4 h-4 text-ios-tertiary shrink-0" />
            </button>
            {showProjDrop && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-ios-lg shadow-ios-modal border border-ios-separator/30 z-50 max-h-60 overflow-y-auto">
                <div className="p-2 border-b border-ios-separator/30 space-y-1">
                  <input className="input py-1.5 text-footnote" placeholder="Caută proiect..." value={projSearch} onChange={e => setProjSearch(e.target.value)} autoFocus />
                  <button onClick={() => { setShowNewProj(true); setShowProjDrop(false); }}
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-footnote text-ios-blue hover:bg-blue-50 rounded-ios font-semibold">
                    <Plus className="w-3.5 h-3.5" /> Proiect nou
                  </button>
                </div>
                {filteredProjects.map(p => (
                  <button key={p.id} onClick={() => { setForm(prev => ({ ...prev, project_id: p.id })); setShowProjDrop(false); setProjSearch(''); }}
                    className={`w-full flex items-center gap-2 px-3 py-2.5 hover:bg-ios-fill text-left transition-colors ${form.project_id === p.id ? 'bg-blue-50' : ''}`}>
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-subhead font-medium truncate">{p.name}</p>
                      {p.clients?.name && <p className="text-caption1 text-ios-secondary">{p.clients.name}</p>}
                    </div>
                    {form.project_id === p.id && <Check className="w-4 h-4 text-ios-blue shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {showNewProj && (
            <div className="bg-blue-50 rounded-ios p-3 space-y-2">
              <p className="text-footnote font-semibold text-ios-blue">Proiect nou</p>
              <input className="input" placeholder="Nume proiect" value={newProjName} onChange={e => setNewProjName(e.target.value)} autoFocus />
              <div className="flex gap-2">{COL_COLORS.slice(0,6).map(c => <button key={c} onClick={() => setNewProjColor(c)} style={{ background: c }} className={`w-6 h-6 rounded-full ${newProjColor === c ? 'ring-2 ring-offset-1 ring-ios-blue' : ''}`} />)}</div>
              <div className="flex gap-2">
                <button className="btn-secondary flex-1 py-1.5 text-footnote" onClick={() => setShowNewProj(false)}>Anulează</button>
                <button className="btn-primary flex-1 py-1.5 text-footnote" onClick={createProject} disabled={!newProjName.trim()}>Creează</button>
              </div>
            </div>
          )}

          <div>
            <label className="input-label">Titlu *</label>
            <input className="input" value={form.title} onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))} placeholder="Ce trebuie făcut?" />
          </div>

          <div>
            <label className="input-label">Descriere</label>
            <textarea className="input" rows={3} value={form.description} onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))} placeholder="Detalii..." />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="input-label">Responsabil</label>
              <select className="input" value={form.assigned_to} onChange={e => setForm(prev => ({ ...prev, assigned_to: e.target.value }))}>
                <option value="">— Nimeni —</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
              </select>
            </div>
            <div>
              <label className="input-label">Prioritate</label>
              <select className="input" value={form.priority} onChange={e => setForm(prev => ({ ...prev, priority: e.target.value }))}>
                {Object.entries(PRIORITY_CFG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="input-label">Coloană Board *</label>
              <select className="input" value={form.column_id} onChange={e => setForm(prev => ({ ...prev, column_id: e.target.value }))}>
                {boardColumns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="input-label">Data limită</label>
              <input className="input" type="date" value={form.due_date} onChange={e => setForm(prev => ({ ...prev, due_date: e.target.value }))} />
            </div>
          </div>

          {/* Labels */}
          {task?.id && (
            <div ref={labelRef} className="relative">
              <label className="input-label">Etichete</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {taskLabels.map(l => <LabelPill key={l.id} label={l} onRemove={() => toggleLabel(l)} />)}
              </div>
              <button onClick={() => setShowLabelDrop(!showLabelDrop)}
                className="flex items-center gap-1.5 text-footnote text-ios-blue hover:bg-blue-50 px-2.5 py-1.5 rounded-ios font-semibold">
                <Tag className="w-3.5 h-3.5" /> Adaugă etichetă
              </button>
              {showLabelDrop && (
                <div className="absolute top-full left-0 mt-1 bg-white rounded-ios-lg shadow-ios-modal border border-ios-separator/30 z-50 w-60 max-h-56 overflow-y-auto">
                  <div className="p-2 border-b border-ios-separator/30">
                    <input className="input py-1.5 text-footnote" placeholder="Caută..." value={labelSearch} onChange={e => setLabelSearch(e.target.value)} autoFocus />
                  </div>
                  {filteredLabels.map(l => (
                    <button key={l.id} onClick={() => toggleLabel(l)}
                      className="flex items-center justify-between w-full px-3 py-2.5 hover:bg-ios-fill">
                      <span className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ background: l.color }} />
                        <span className="text-subhead">{l.name}</span>
                      </span>
                      {taskLabels.some(tl => tl.id === l.id) && <Check className="w-4 h-4 text-ios-blue" />}
                    </button>
                  ))}
                  <div className="border-t border-ios-separator/30 p-2">
                    {showNewLabel ? (
                      <div className="space-y-2">
                        <input className="input py-1.5 text-footnote" placeholder="Nume etichetă" value={newLabelName} onChange={e => setNewLabelName(e.target.value)} autoFocus />
                        <div className="flex gap-1.5 flex-wrap">{COL_COLORS.map(c => <button key={c} onClick={() => setNewLabelColor(c)} style={{ background: c }} className={`w-5 h-5 rounded-full ${newLabelColor === c ? 'ring-2 ring-offset-1 ring-gray-400' : ''}`} />)}</div>
                        <div className="flex gap-2">
                          <button className="btn-secondary flex-1 py-1 text-caption1" onClick={() => setShowNewLabel(false)}>Anulează</button>
                          <button className="btn-primary flex-1 py-1 text-caption1" onClick={createLabel} disabled={!newLabelName.trim()}>Creează</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setShowNewLabel(true)} className="flex items-center gap-2 w-full text-footnote text-ios-blue hover:bg-blue-50 px-2 py-1.5 rounded-ios font-semibold">
                        <Plus className="w-3.5 h-3.5" /> Etichetă nouă
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-2 flex-wrap">
            {task?.id && !task?.is_archived && (
              <button onClick={archiveTask} className="btn-secondary flex items-center gap-1.5 text-footnote">
                <Archive className="w-3.5 h-3.5" /> Arhivează
              </button>
            )}
            {task?.id && task?.is_archived && (
              <button onClick={unarchiveTask} className="btn-secondary flex items-center gap-1.5 text-footnote">
                <RotateCcw className="w-3.5 h-3.5" /> Restaurează
              </button>
            )}
            {task?.id && (
              <button onClick={onDelete} className="btn-danger flex items-center gap-1.5 text-footnote">
                <Trash2 className="w-3.5 h-3.5" /> Șterge
              </button>
            )}
            <button className="btn-secondary flex-1" onClick={onClose}>Anulează</button>
            <button className="btn-primary flex-1" onClick={save} disabled={loading || !form.title || !form.project_id}>
              {loading ? 'Se salvează...' : 'Salvează'}
            </button>
          </div>
        </div>
      )}

      {tab === 'comments' && (
        <div className="space-y-4">
          {comments.length === 0
            ? <div className="text-center py-8 text-ios-tertiary text-subhead">Niciun comentariu</div>
            : <div className="space-y-3 max-h-64 overflow-y-auto">
                {comments.map(c => (
                  <div key={c.id} className="flex gap-3">
                    <div className="w-7 h-7 bg-ios-blue rounded-full flex items-center justify-center text-white text-caption2 font-bold shrink-0">
                      {(c.profiles?.full_name || c.profiles?.email || '?')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 bg-ios-bg rounded-ios p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-footnote font-semibold">{c.profiles?.full_name || c.profiles?.email}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-caption2 text-ios-tertiary">{fmtDate(c.created_at)}</span>
                          {c.user_id === currentUser?.id && (
                            <button onClick={async () => { await supabase.from('task_comments').delete().eq('id', c.id); loadComments(); }} className="text-ios-tertiary hover:text-ios-red"><X className="w-3 h-3" /></button>
                          )}
                        </div>
                      </div>
                      {c.content && <p className="text-subhead whitespace-pre-wrap">{c.content}</p>}
                      {c.file_url && (
                        <a href={c.file_url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1.5 mt-1.5 text-footnote text-ios-blue hover:underline">
                          <Paperclip className="w-3.5 h-3.5" />{c.file_name}
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
          }

          {/* Comment input with file */}
          <div className="border-t border-ios-separator/30 pt-3 space-y-2">
            {commentFile && (
              <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-ios text-footnote text-ios-blue">
                <Paperclip className="w-3.5 h-3.5 shrink-0" />
                <span className="flex-1 truncate">{commentFile.name}</span>
                <button onClick={() => setCommentFile(null)}><X className="w-3.5 h-3.5" /></button>
              </div>
            )}
            <div className="flex gap-2">
              <input ref={fileRef} type="file" className="hidden" onChange={e => setCommentFile(e.target.files?.[0] || null)} />
              <button onClick={() => fileRef.current?.click()} className="p-2 rounded-ios hover:bg-ios-fill text-ios-tertiary hover:text-ios-blue transition-colors" title="Atașează fișier">
                <Paperclip className="w-4 h-4" />
              </button>
              <input className="input flex-1" placeholder="Comentariu... (Enter trimite)"
                value={newComment} onChange={e => setNewComment(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addComment(); }}} />
              <button onClick={addComment} disabled={!newComment.trim() && !commentFile || sending} className="btn-primary px-3">
                {sending ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── Col Header ───────────────────────────────────────────────────────────────
function ColHeader({ col, onRename, onDelete, onAdd }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div className="flex items-center justify-between mb-3" ref={ref}>
      <div className="flex items-center gap-2">
        <div className="w-2.5 h-2.5 rounded-full" style={{ background: col.color }} />
        <span className="text-footnote font-bold text-ios-primary">{col.name}</span>
      </div>
      <div className="flex items-center gap-1">
        <button onClick={() => onAdd(col.id)} className="p-1 rounded hover:bg-ios-fill text-ios-tertiary hover:text-ios-blue"><Plus className="w-3.5 h-3.5" /></button>
        <div className="relative">
          <button onClick={() => setOpen(!open)} className="p-1 rounded hover:bg-ios-fill text-ios-tertiary"><MoreHorizontal className="w-3.5 h-3.5" /></button>
          {open && (
            <div className="absolute right-0 top-full mt-1 bg-white rounded-ios shadow-ios-modal border border-ios-separator/30 py-1 z-30 w-36">
              <button onClick={() => { onRename(); setOpen(false); }} className="flex items-center gap-2 w-full px-3 py-2 text-footnote hover:bg-ios-fill"><Edit2 className="w-3.5 h-3.5" />Redenumește</button>
              <button onClick={() => { onDelete(); setOpen(false); }} className="flex items-center gap-2 w-full px-3 py-2 text-footnote text-ios-red hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" />Șterge</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Task Row ─────────────────────────────────────────────────────────────────
function TaskRow({ task, members, boardColumns, taskLabels, activeTimer, elapsed, onOpen, onToggle, onStartTimer, onStopTimer, done }) {
  const pri = PRIORITY_CFG[task.priority];
  const assignee = members.find(m => m.id === task.assigned_to);
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && !done;
  const col = boardColumns.find(c => c.id === task.column_id);
  const labels = taskLabels[task.id] || [];
  const isTimerActive = activeTimer?.task_id === task.id;

  return (
    <div onClick={onOpen}
      className={`flex items-center gap-3 px-4 py-3 border-b border-ios-separator/20 hover:bg-ios-bg/50 cursor-pointer group ${done ? 'opacity-60' : ''}`}>
      <button onClick={onToggle}
        className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${done ? 'border-ios-green bg-ios-green' : 'border-ios-separator hover:border-ios-blue'}`}>
        {done && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
      </button>
      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: pri?.dot || '#AEAEB2' }} />
      <div className="flex-1 min-w-0">
        <p className={`text-subhead ${done ? 'line-through text-ios-tertiary' : 'text-ios-primary'} truncate`}>{task.title}</p>
        {labels.length > 0 && (
          <div className="flex gap-1 mt-0.5 flex-wrap">
            {labels.slice(0,3).map(l => <span key={l.id} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-white" style={{ background: l.color }}>{l.name}</span>)}
          </div>
        )}
      </div>
      {col && <span className="text-caption2 font-semibold px-2 py-0.5 rounded-full shrink-0 hidden lg:inline" style={{ background: col.color+'25', color: col.color }}>{col.name}</span>}
      <div className="flex items-center gap-2 shrink-0">
        {task.comment_count > 0 && <div className="flex items-center gap-0.5 text-ios-tertiary"><MessageSquare className="w-3 h-3" /><span className="text-caption2">{task.comment_count}</span></div>}
        {task.due_date && <span className={`text-caption1 font-medium ${isOverdue ? 'text-ios-red' : 'text-ios-tertiary'}`}>{new Date(task.due_date).toLocaleDateString('ro-RO',{day:'numeric',month:'short'})}</span>}
        {/* Quick timer button */}
        <QuickTimer task={task} activeTimer={activeTimer} elapsed={elapsed}
          onStart={onStartTimer} onStop={onStopTimer} />
        {/* Quick archive */}
        <button onClick={e => { e.stopPropagation(); supabase.from('tasks').update({ is_archived: true, archived_at: new Date().toISOString() }).eq('id', task.id).then(() => onToggle(e, true)); }}
          className="p-1 rounded text-ios-tertiary hover:text-ios-orange opacity-0 group-hover:opacity-100 transition-opacity" title="Arhivează">
          <Archive className="w-3.5 h-3.5" />
        </button>
        {assignee && <div className="w-6 h-6 bg-ios-blue rounded-full flex items-center justify-center text-white text-caption2 font-bold">{(assignee.full_name||assignee.email)[0].toUpperCase()}</div>}
      </div>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function TasksPage() {
  const [mode, setMode] = useState('list');
  const [projects, setProjects] = useState([]);
  const [boardColumns, setBoardColumns] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [archivedTasks, setArchivedTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [labels, setLabels] = useState([]);
  const [taskLabels, setTaskLabels] = useState({});
  const [currentUser, setCurrentUser] = useState(null);
  const [mainFilter, setMainFilter] = useState('all');
  const [filterProject, setFilterProject] = useState('');
  const [filterLabel, setFilterLabel] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState({});
  const [dragOver, setDragOver] = useState(null);
  const [taskModal, setTaskModal] = useState(null);
  const [newColModal, setNewColModal] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColColor, setNewColColor] = useState('#007AFF');
  const [editColModal, setEditColModal] = useState(null);
  const [editColName, setEditColName] = useState('');
  const [showMemberDrop, setShowMemberDrop] = useState(false);
  const memberRef = useRef(null);

  const { activeTimer, elapsed, startTimer, stopTimer } = useActiveTimer(currentUser?.id);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUser(user));
    loadAll();
  }, []);

  useEffect(() => {
    const h = e => { if (memberRef.current && !memberRef.current.contains(e.target)) setShowMemberDrop(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  async function loadAll() {
    const [{ data: proj }, { data: mem }, { data: cols }, { data: lbl }] = await Promise.all([
      supabase.from('projects').select('*, clients(id,name)').eq('status','active').order('name'),
      supabase.from('profiles').select('id,full_name,email').order('full_name'),
      supabase.from('task_columns').select('*').eq('is_archived',false).order('position'),
      supabase.from('labels').select('*').order('name'),
    ]);
    setProjects(proj || []);
    setMembers(mem || []);
    setLabels(lbl || []);

    // Ensure board columns exist
    let finalCols = cols || [];
    if (finalCols.length === 0) {
      const toInsert = DEFAULT_BOARD_COLS.map((c,i) => ({ ...c, position: i }));
      const { data: created } = await supabase.from('task_columns').insert(toInsert).select();
      finalCols = created || [];
    }
    setBoardColumns(finalCols);
    await loadTasks();
  }

  async function loadTasks() {
    const [{ data: active }, { data: archived }] = await Promise.all([
      supabase.from('tasks').select('*, profiles(full_name,email), projects(id,name,color,clients(name))').eq('is_archived',false).order('position'),
      supabase.from('tasks').select('*, profiles(full_name,email), projects(id,name,color)').eq('is_archived',true).order('archived_at',{ascending:false}).limit(50),
    ]);
    const all = [...(active||[]), ...(archived||[])];
    const ids = all.map(t => t.id);
    let cc = {}, tl = {};
    if (ids.length > 0) {
      const [{ data: comments }, { data: tlData }] = await Promise.all([
        supabase.from('task_comments').select('task_id').in('task_id', ids),
        supabase.from('task_labels').select('task_id, labels(*)').in('task_id', ids),
      ]);
      (comments||[]).forEach(c => cc[c.task_id] = (cc[c.task_id]||0)+1);
      (tlData||[]).forEach(row => {
        if (!tl[row.task_id]) tl[row.task_id] = [];
        if (row.labels) tl[row.task_id].push(row.labels);
      });
    }
    const meta = t => ({ ...t, comment_count: cc[t.id]||0 });
    setTasks((active||[]).filter(t => t.project_id).map(meta));
    setArchivedTasks((archived||[]).filter(t => t.project_id).map(meta));
    setTaskLabels(tl);
  }

  async function addColumn() {
    if (!newColName.trim()) return;
    const { data } = await supabase.from('task_columns').insert({ name: newColName.trim(), color: newColColor, position: boardColumns.length }).select().single();
    if (data) setBoardColumns(prev => [...prev, data]);
    setNewColModal(false); setNewColName(''); setNewColColor('#007AFF');
  }

  async function renameColumn() {
    if (!editColName.trim() || !editColModal) return;
    await supabase.from('task_columns').update({ name: editColName }).eq('id', editColModal.id);
    setBoardColumns(prev => prev.map(c => c.id === editColModal.id ? { ...c, name: editColName } : c));
    setEditColModal(null);
  }

  async function deleteColumn(col) {
    if (!confirm(`Ștergi coloana "${col.name}"? Taskurile din ea vor rămâne fără coloană.`)) return;
    await supabase.from('task_columns').delete().eq('id', col.id);
    setBoardColumns(prev => prev.filter(c => c.id !== col.id));
  }

  async function handleDrop(e, colId) {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('taskId');
    if (!taskId) return;
    setDragOver(null);
    await supabase.from('tasks').update({ column_id: colId }).eq('id', taskId);
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, column_id: colId } : t));
  }

  async function toggleDone(task, e, forceArchive) {
    e?.stopPropagation();
    if (forceArchive) { await loadTasks(); return; }
    const newStatus = task.status === 'done' ? 'todo' : 'done';
    await supabase.from('tasks').update({ status: newStatus }).eq('id', task.id);
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
  }

  async function deleteTask(taskId) {
    if (!confirm('Ștergi taskul definitiv?')) return;
    await supabase.from('tasks').delete().eq('id', taskId);
    setTaskModal(null); loadTasks();
  }

  async function handleStartTimer(task) {
    await startTimer(task, currentUser?.id);
  }

  let visible = tasks;
  if (mainFilter !== 'all') visible = visible.filter(t => t.assigned_to === mainFilter);
  if (filterProject) visible = visible.filter(t => t.project_id === filterProject);
  if (filterPriority) visible = visible.filter(t => t.priority === filterPriority);
  if (filterLabel) visible = visible.filter(t => (taskLabels[t.id]||[]).some(l => l.id === filterLabel));
  if (search) visible = visible.filter(t => t.title?.toLowerCase().includes(search.toLowerCase()));

  const byProject = {};
  visible.forEach(t => {
    if (!byProject[t.project_id]) byProject[t.project_id] = { project: t.projects, tasks: [] };
    byProject[t.project_id].tasks.push(t);
  });

  const selectedMember = members.find(m => m.id === mainFilter);
  let boardTasks = tasks;
  if (mainFilter !== 'all') boardTasks = boardTasks.filter(t => t.assigned_to === mainFilter);
  if (filterProject) boardTasks = boardTasks.filter(t => t.project_id === filterProject);
  const hasFilters = mainFilter !== 'all' || filterProject || filterPriority || filterLabel || search;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-title2 font-bold text-ios-primary">
            {mode === 'archive' ? 'Arhivă' : 'Taskuri'}
          </h1>
          <p className="text-subhead text-ios-secondary">
            {mode === 'archive' ? `${archivedTasks.length} arhivate` : `${visible.length} taskuri`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {mode !== 'archive' && (
            <>
              <div className="flex bg-ios-fill rounded-ios p-0.5 gap-0.5">
                <button onClick={() => setMode('list')} className={`p-2 rounded-ios-sm transition-all ${mode==='list' ? 'bg-white shadow-ios-sm' : ''}`} title="Listă">
                  <LayoutList className="w-4 h-4 text-ios-secondary" />
                </button>
                <button onClick={() => setMode('board')} className={`p-2 rounded-ios-sm transition-all ${mode==='board' ? 'bg-white shadow-ios-sm' : ''}`} title="Board">
                  <Kanban className="w-4 h-4 text-ios-secondary" />
                </button>
              </div>
              <button onClick={() => setMode(mode === 'archive' ? 'list' : 'archive')} className="p-2 rounded-ios hover:bg-ios-fill text-ios-tertiary" title="Arhivă">
                <Archive className="w-4 h-4" />
              </button>
              <button onClick={() => setTaskModal({ project_id: filterProject || '' })} className="btn-primary flex items-center gap-2">
                <Plus className="w-4 h-4" strokeWidth={2.5} /> Task nou
              </button>
            </>
          )}
          {mode === 'archive' && (
            <button onClick={() => setMode('list')} className="btn-secondary flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" /> Înapoi
            </button>
          )}
          {mode === 'board' && (
            <button onClick={() => setNewColModal(true)} className="btn-secondary flex items-center gap-1.5 text-footnote">
              <Plus className="w-3.5 h-3.5" /> Coloană
            </button>
          )}
        </div>
      </div>

      {/* Active timer banner */}
      {activeTimer && !activeTimer.task_id && (
        <div className="bg-blue-50 border border-blue-100 rounded-ios-lg p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-ios-blue rounded-full animate-pulse" />
            <span className="text-footnote font-semibold text-ios-blue">Timer general activ — {fmtClock(elapsed)}</span>
          </div>
        </div>
      )}

      {/* Filters */}
      {mode !== 'archive' && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative" ref={memberRef}>
            <button onClick={() => setShowMemberDrop(!showMemberDrop)}
              className={`flex items-center gap-2 px-3 py-2 rounded-ios text-subhead font-semibold border transition-all ${mainFilter==='all' ? 'bg-white border-ios-separator text-ios-primary' : 'bg-ios-blue border-ios-blue text-white'}`}>
              {mainFilter==='all' ? <><Users className="w-4 h-4"/>Toată echipa</> : <><User className="w-4 h-4"/>{selectedMember?.full_name?.split(' ')[0]}</>}
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {showMemberDrop && (
              <div className="absolute top-full left-0 mt-2 bg-white rounded-ios-lg shadow-ios-modal border border-ios-separator/30 py-1 z-50 w-52">
                <button onClick={() => { setMainFilter('all'); setShowMemberDrop(false); }}
                  className={`flex items-center gap-2 w-full px-3 py-2.5 text-subhead hover:bg-ios-fill ${mainFilter==='all' ? 'text-ios-blue font-semibold' : 'text-ios-primary'}`}>
                  <Users className="w-4 h-4"/>Toată echipa
                  {mainFilter==='all' && <Check className="w-4 h-4 ml-auto"/>}
                </button>
                <div className="border-t border-ios-separator/30 my-1"/>
                {members.map(m => (
                  <button key={m.id} onClick={() => { setMainFilter(m.id); setShowMemberDrop(false); }}
                    className={`flex items-center gap-2 w-full px-3 py-2.5 text-subhead hover:bg-ios-fill ${mainFilter===m.id ? 'text-ios-blue font-semibold' : 'text-ios-primary'}`}>
                    <div className="w-6 h-6 bg-ios-blue rounded-full flex items-center justify-center text-white text-caption2 font-bold shrink-0">{(m.full_name||m.email)[0].toUpperCase()}</div>
                    <span className="truncate">{m.full_name||m.email}</span>
                    {mainFilter===m.id && <Check className="w-4 h-4 ml-auto shrink-0"/>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="h-6 w-px bg-ios-separator hidden sm:block"/>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-tertiary"/>
            <input className="input pl-9 w-36 py-2 text-footnote" placeholder="Caută..." value={search} onChange={e => setSearch(e.target.value)}/>
          </div>
          <select className="input py-2 text-footnote w-36" value={filterProject} onChange={e => setFilterProject(e.target.value)}>
            <option value="">Toate proiectele</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className="input py-2 text-footnote w-36" value={filterLabel} onChange={e => setFilterLabel(e.target.value)}>
            <option value="">Toate etichetele</option>
            {labels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select className="input py-2 text-footnote w-32" value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
            <option value="">Orice prioritate</option>
            {Object.entries(PRIORITY_CFG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          {hasFilters && (
            <button onClick={() => { setMainFilter('all'); setFilterProject(''); setFilterPriority(''); setFilterLabel(''); setSearch(''); }}
              className="flex items-center gap-1 text-footnote text-ios-red hover:bg-red-50 px-2 py-2 rounded-ios">
              <X className="w-3.5 h-3.5"/> Resetează
            </button>
          )}
        </div>
      )}

      {/* LIST */}
      {mode === 'list' && (
        <div className="card overflow-hidden">
          {Object.keys(byProject).length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-subhead text-ios-secondary mb-4">Niciun task{hasFilters ? ' cu filtrele curente' : ''}</p>
              <button onClick={() => setTaskModal({ project_id: filterProject||'' })} className="btn-primary">Task nou</button>
            </div>
          ) : Object.entries(byProject).map(([pid, { project, tasks: projTasks }]) => {
            const openTasks = projTasks.filter(t => t.status !== 'done');
            const doneTasks = projTasks.filter(t => t.status === 'done');
            const isCollapsed = collapsed[pid];
            return (
              <div key={pid}>
                <div className="flex items-center justify-between px-4 py-2.5 bg-ios-bg border-b border-ios-separator/30 sticky top-0 z-10">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setCollapsed(p => ({ ...p, [pid]: !isCollapsed }))} className="text-ios-tertiary hover:text-ios-primary">
                      <ChevronDown className={`w-4 h-4 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}/>
                    </button>
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: project?.color||'#007AFF' }}/>
                    <span className="text-subhead font-bold text-ios-primary">{project?.name}</span>
                    {project?.clients?.name && <span className="text-footnote text-ios-secondary">· {project.clients.name}</span>}
                    <span className="text-caption1 text-ios-tertiary bg-white border border-ios-separator px-1.5 py-0.5 rounded-full font-semibold">{openTasks.length}</span>
                  </div>
                  <button onClick={() => setTaskModal({ project_id: pid })} className="p-1.5 rounded-ios hover:bg-ios-fill text-ios-tertiary hover:text-ios-blue">
                    <Plus className="w-3.5 h-3.5"/>
                  </button>
                </div>
                {!isCollapsed && openTasks.map(t => (
                  <TaskRow key={t.id} task={t} members={members} boardColumns={boardColumns} taskLabels={taskLabels}
                    activeTimer={activeTimer} elapsed={elapsed}
                    onOpen={() => setTaskModal(t)} onToggle={e => toggleDone(t, e)}
                    onStartTimer={handleStartTimer} onStopTimer={stopTimer} />
                ))}
                {!isCollapsed && doneTasks.length > 0 && (
                  <div className="border-t border-ios-separator/20">
                    <button onClick={() => setCollapsed(p => ({ ...p, [`done_${pid}`]: !p[`done_${pid}`] }))}
                      className="flex items-center gap-2 w-full px-4 py-2 text-footnote text-ios-blue hover:bg-blue-50/50">
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${collapsed[`done_${pid}`] ? '-rotate-90' : ''}`}/>
                      {collapsed[`done_${pid}`] ? `Arată ${doneTasks.length} finalizate` : `Ascunde ${doneTasks.length} finalizate`}
                    </button>
                    {!collapsed[`done_${pid}`] && (
                      <div className="bg-gray-50/50">
                        <p className="px-4 py-1.5 text-caption1 font-semibold text-ios-tertiary uppercase tracking-wide">FINALIZATE</p>
                        {doneTasks.map(t => (
                          <TaskRow key={t.id} task={t} members={members} boardColumns={boardColumns} taskLabels={taskLabels}
                            activeTimer={activeTimer} elapsed={elapsed}
                            onOpen={() => setTaskModal(t)} onToggle={e => toggleDone(t, e)}
                            onStartTimer={handleStartTimer} onStopTimer={stopTimer} done />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* BOARD */}
      {mode === 'board' && (
        <div className="flex gap-3 overflow-x-auto pb-6" style={{ minHeight: '65vh' }}>
          {boardColumns.map(col => {
            const colTasks = boardTasks.filter(t => t.column_id === col.id);
            const isDragTarget = dragOver === col.id;
            return (
              <div key={col.id}
                className={`shrink-0 w-64 rounded-ios-lg p-3 transition-all ${isDragTarget ? 'bg-blue-50 ring-2 ring-ios-blue' : 'bg-ios-bg'}`}
                onDragOver={e => { e.preventDefault(); setDragOver(col.id); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={e => handleDrop(e, col.id)}>
                <ColHeader col={col}
                  onRename={() => { setEditColModal(col); setEditColName(col.name); }}
                  onDelete={() => deleteColumn(col)}
                  onAdd={colId => setTaskModal({ column_id: colId, project_id: filterProject||'' })} />
                <div className="space-y-2">
                  {colTasks.map(task => {
                    const pri = PRIORITY_CFG[task.priority];
                    const assignee = members.find(m => m.id === task.assigned_to);
                    const labels = taskLabels[task.id] || [];
                    const isDone = task.status === 'done';
                    const isTimerActive = activeTimer?.task_id === task.id;
                    return (
                      <div key={task.id} draggable
                        onDragStart={e => e.dataTransfer.setData('taskId', task.id)}
                        onDragEnd={() => setDragOver(null)}
                        onClick={() => setTaskModal(task)}
                        className={`bg-white rounded-ios border p-3 cursor-pointer hover:shadow-ios transition-all select-none group ${isDone ? 'opacity-60 border-ios-separator/30' : isTimerActive ? 'border-ios-blue' : 'border-ios-separator/50'}`}>
                        {labels.length > 0 && (
                          <div className="flex gap-1 flex-wrap mb-2">
                            {labels.slice(0,2).map(l => <span key={l.id} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-white" style={{ background: l.color }}>{l.name}</span>)}
                          </div>
                        )}
                        <div className="flex items-start gap-2 mb-2">
                          <button onClick={e => { e.stopPropagation(); toggleDone(task, e); }}
                            className={`shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center mt-0.5 transition-all ${isDone ? 'border-ios-green bg-ios-green' : 'border-ios-separator hover:border-ios-blue'}`}>
                            {isDone && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3}/>}
                          </button>
                          <p className={`text-footnote font-semibold leading-snug flex-1 ${isDone ? 'line-through text-ios-tertiary' : 'text-ios-primary'}`}>{task.title}</p>
                        </div>
                        {task.projects?.name && (
                          <div className="flex items-center gap-1 mb-1.5">
                            <div className="w-1.5 h-1.5 rounded-full" style={{ background: task.projects.color||'#007AFF' }}/>
                            <span className="text-caption2 text-ios-secondary">{task.projects.name}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            {task.comment_count > 0 && <div className="flex items-center gap-0.5 text-ios-tertiary"><MessageSquare className="w-3 h-3"/><span className="text-caption2">{task.comment_count}</span></div>}
                            {/* Quick timer on board card */}
                            <button onClick={e => { e.stopPropagation(); isTimerActive ? stopTimer() : handleStartTimer(task); }}
                              className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-caption2 font-semibold transition-all opacity-0 group-hover:opacity-100 ${isTimerActive ? 'opacity-100 bg-red-50 text-ios-red' : 'bg-blue-50 text-ios-blue'}`}>
                              {isTimerActive ? <><Square className="w-2.5 h-2.5" fill="currentColor"/>{fmtClock(elapsed)}</> : <><Play className="w-2.5 h-2.5" fill="currentColor"/>Start</>}
                            </button>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {task.due_date && <span className="text-caption2 text-ios-tertiary">{new Date(task.due_date).toLocaleDateString('ro-RO',{day:'numeric',month:'short'})}</span>}
                            {assignee && <div className="w-5 h-5 bg-ios-blue rounded-full flex items-center justify-center text-white text-[9px] font-bold">{(assignee.full_name||assignee.email)[0].toUpperCase()}</div>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {colTasks.length === 0 && (
                    <div className={`h-12 rounded-ios border-2 border-dashed flex items-center justify-center ${isDragTarget ? 'border-ios-blue' : 'border-ios-separator'}`}>
                      <p className="text-caption1 text-ios-tertiary">Trage taskuri aici</p>
                    </div>
                  )}
                  <button onClick={() => setTaskModal({ column_id: col.id, project_id: filterProject||'' })}
                    className="w-full py-2 text-caption1 text-ios-tertiary hover:text-ios-blue border border-dashed border-ios-separator hover:border-ios-blue rounded-ios flex items-center justify-center gap-1">
                    <Plus className="w-3 h-3"/> Adaugă
                  </button>
                </div>
              </div>
            );
          })}
          <button onClick={() => setNewColModal(true)}
            className="shrink-0 w-52 h-14 rounded-ios-lg border-2 border-dashed border-ios-separator flex items-center justify-center gap-2 text-ios-tertiary hover:border-ios-blue hover:text-ios-blue transition-colors">
            <Plus className="w-4 h-4"/><span className="text-footnote font-medium">Coloană nouă</span>
          </button>
        </div>
      )}

      {/* ARCHIVE */}
      {mode === 'archive' && (
        <div className="card overflow-hidden">
          {archivedTasks.length === 0 ? (
            <div className="p-12 text-center"><Archive className="w-8 h-8 text-ios-label4 mx-auto mb-3"/><p className="text-subhead text-ios-secondary">Niciun task arhivat</p></div>
          ) : archivedTasks.map(task => {
            const assignee = members.find(m => m.id === task.assigned_to);
            return (
              <div key={task.id} onClick={() => setTaskModal(task)}
                className="flex items-center gap-3 px-4 py-3 border-b border-ios-separator/20 hover:bg-ios-bg/50 cursor-pointer opacity-70">
                <Archive className="w-4 h-4 text-ios-tertiary shrink-0"/>
                <div className="flex-1 min-w-0">
                  <p className="text-subhead text-ios-secondary line-through truncate">{task.title}</p>
                  <p className="text-caption1 text-ios-tertiary">{task.projects?.name} · {fmtDate(task.archived_at)}</p>
                </div>
                {assignee && <div className="w-6 h-6 bg-ios-fill rounded-full flex items-center justify-center text-ios-tertiary text-caption2 font-bold">{(assignee.full_name||assignee.email)[0].toUpperCase()}</div>}
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {taskModal !== null && (
        <TaskDetail task={taskModal} members={members} boardColumns={boardColumns} projects={projects} labels={labels}
          activeTimer={activeTimer} elapsed={elapsed}
          currentUser={currentUser} onClose={() => setTaskModal(null)}
          onSave={() => { setTaskModal(null); loadAll(); }}
          onDelete={() => deleteTask(taskModal.id)}
          onStartTimer={handleStartTimer} onStopTimer={stopTimer} />
      )}
      {newColModal && (
        <Modal title="Coloană nouă" onClose={() => setNewColModal(false)}>
          <div className="space-y-4">
            <div><label className="input-label">Nume *</label><input className="input" value={newColName} onChange={e => setNewColName(e.target.value)} autoFocus/></div>
            <div><label className="input-label">Culoare</label><div className="flex gap-2 flex-wrap">{COL_COLORS.map(c => <button key={c} onClick={() => setNewColColor(c)} style={{ background: c }} className={`w-7 h-7 rounded-full ${newColColor===c ? 'ring-2 ring-offset-2 ring-ios-blue scale-110' : ''}`}/>)}</div></div>
            <div className="flex gap-3"><button className="btn-secondary flex-1" onClick={() => setNewColModal(false)}>Anulează</button><button className="btn-primary flex-1" onClick={addColumn} disabled={!newColName.trim()}>Adaugă</button></div>
          </div>
        </Modal>
      )}
      {editColModal && (
        <Modal title="Redenumește coloana" onClose={() => setEditColModal(null)}>
          <div className="space-y-4">
            <div><label className="input-label">Nume nou</label><input className="input" value={editColName} onChange={e => setEditColName(e.target.value)} autoFocus/></div>
            <div className="flex gap-3"><button className="btn-secondary flex-1" onClick={() => setEditColModal(null)}>Anulează</button><button className="btn-primary flex-1" onClick={renameColumn} disabled={!editColName.trim()}>Salvează</button></div>
          </div>
        </Modal>
      )}
    </div>
  );
}
