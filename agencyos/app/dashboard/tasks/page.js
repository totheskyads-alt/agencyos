'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/Modal';
import { fmtDate, getElapsed, fmtClock } from '@/lib/utils';
import { useRole } from '@/lib/useRole';
import { useTimer } from '@/lib/timerContext';
import {
  Plus, Search, ChevronDown, ArrowLeft, MessageSquare,
  Paperclip, Trash2, Send, Archive, Kanban, MoreHorizontal,
  Edit2, X, Check, LayoutList, User, Users, Tag, RotateCcw,
  Play, Square, Pause, Timer
} from 'lucide-react';

const DEFAULT_COLS = [
  { name: 'This Week', color: '#007AFF' },
  { name: 'Later', color: '#AEAEB2' },
  { name: 'Weekly Tasks', color: '#FF9500' },
  { name: 'Reports', color: '#34C759' },
];

const PRIORITY = {
  low:    { label: 'Low',    dot: '#AEAEB2' },
  medium: { label: 'Medium', dot: '#FF9500' },
  high:   { label: 'High',   dot: '#FF3B30' },
  urgent: { label: 'Urgent', dot: '#FF3B30' },
};
const COL_COLORS = ['#007AFF','#34C759','#FF9500','#FF3B30','#AF52DE','#32ADE6','#5856D6','#FF2D55','#AEAEB2'];
const VIEW_KEY = 'agencyos_tasks_view';


// ─── Download File Helper ─────────────────────────────────────────────────────
async function downloadFile(url, filename) {
  try {
    // Extract Supabase storage path and use signed download URL
    const marker = '/object/public/task-files/';
    const pathIdx = url.indexOf(marker);
    if (pathIdx !== -1) {
      const filePath = decodeURIComponent(url.substring(pathIdx + marker.length).split('?')[0]);
      const { supabase: sb } = await import('@/lib/supabase');
      const { data: blob, error } = await sb.storage.from('task-files').download(filePath);
      if (!error && blob) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename || 'file';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        return;
      }
    }
  } catch {}
  // Fallback: open in new tab
  window.open(url, '_blank');
}

// ─── Quick Timer ──────────────────────────────────────────────────────────────
function QuickTimer({ task, activeTimer, elapsed, onStart, onStop }) {
  const isActive = activeTimer?.task_id === task.id;
  return (
    <button onClick={e => { e.stopPropagation(); isActive ? onStop() : onStart(task); }}
      title={isActive ? 'Stop timer' : 'Start timer'}
      className={`flex items-center gap-1 px-2 py-1 rounded-ios text-caption1 font-semibold transition-all shrink-0 ${
        isActive ? 'bg-red-50 text-ios-red border border-red-100'
                 : 'bg-blue-50 text-ios-blue border border-blue-100 opacity-0 group-hover:opacity-100'
      }`}>
      {isActive
        ? <><Square className="w-3 h-3" fill="currentColor" /><span className="font-mono">{fmtClock(elapsed)}</span></>
        : <><Play className="w-3 h-3" fill="currentColor" />Start</>}
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
function TaskDetail({ task, members, boardColumns, projects, labels: allLabels, activeTimer, elapsed, isPaused, onClose, onSave, onDelete, onStartTimer, onStopTimer, onPauseTimer, currentUser }) {
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
  });
  const [comments, setComments] = useState([]);
  const [taskLabels, setTaskLabels] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [commentFile, setCommentFile] = useState(null);
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingCommentText, setEditingCommentText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [tab, setTab] = useState('details');
  const [showProjDrop, setShowProjDrop] = useState(false);
  const [projSearch, setProjSearch] = useState('');
  const [showNewProj, setShowNewProj] = useState(false);
  const [newProjName, setNewProjName] = useState('');
  const [newProjColor, setNewProjColor] = useState('#007AFF');
  const [newProjClientId, setNewProjClientId] = useState('');
  const [projClients, setProjClients] = useState([]);
  const [showLabelDrop, setShowLabelDrop] = useState(false);
  const [pendingLabels, setPendingLabels] = useState([]);
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

  useEffect(() => {
    if (!form.column_id && boardColumns.length > 0)
      setForm(p => ({ ...p, column_id: boardColumns[0].id }));
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
      .select('*, profiles(full_name,email,id)')
      .eq('task_id', task.id).order('created_at');
    setComments(data || []);
  }

  async function loadLabels() {
    const { data } = await supabase.from('task_labels').select('*, labels(*)').eq('task_id', task.id);
    setTaskLabels((data || []).map(tl => tl.labels).filter(Boolean));
  }

  async function toggleLabel(label) {
    if (!task?.id) return;
    const has = taskLabels.some(l => l.id === label.id);
    if (has) {
      await supabase.from('task_labels').delete().eq('task_id', task.id).eq('label_id', label.id);
      setTaskLabels(p => p.filter(l => l.id !== label.id));
    } else {
      await supabase.from('task_labels').insert({ task_id: task.id, label_id: label.id });
      setTaskLabels(p => [...p, label]);
    }
  }

  async function createLabel() {
    if (!newLabelName.trim()) return;
    const { data } = await supabase.from('labels').insert({ name: newLabelName.trim(), color: newLabelColor }).select().single();
    if (data && task?.id) {
      await supabase.from('task_labels').insert({ task_id: task.id, label_id: data.id });
      setTaskLabels(p => [...p, data]);
    }
    setNewLabelName(''); setShowNewLabel(false); onSave();
  }

  async function save() {
    if (!form.title.trim() || !form.project_id) return;
    setLoading(true);
    const payload = { ...form, assigned_to: form.assigned_to || null, due_date: form.due_date || null, column_id: form.column_id || boardColumns[0]?.id || null };
    if (task?.id) await supabase.from('tasks').update(payload).eq('id', task.id);
    else await supabase.from('tasks').insert({ ...payload, status: 'todo' });
    setLoading(false); onSave();
  }

  async function createProject() {
    if (!newProjName.trim()) return;
    // Project requires client too - use first available or skip
    const payload = { name: newProjName.trim(), color: newProjColor, status: 'active' };
    if (newProjClientId) payload.client_id = newProjClientId;
    const { data } = await supabase.from('projects').insert(payload).select('*, clients(name)').single();
    if (data) {
      setForm(p => ({ ...p, project_id: data.id }));
      // Add to local projects list without closing modal
      setProjects(prev => [...prev, data].sort((a,b) => a.name.localeCompare(b.name)));
    }
    setShowNewProj(false); setNewProjName(''); setNewProjClientId('');
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
      task_id: task.id, user_id: currentUser?.id,
      content: newComment.trim() || (fileData ? `📎 ${fileData.name}` : ''),
      ...(fileData ? { file_name: fileData.name, file_url: fileData.url, file_type: fileData.type } : {}),
    });
    setNewComment(''); setCommentFile(null); setSending(false); loadComments();
  }

  async function saveCommentEdit(commentId) {
    if (!editingCommentText.trim()) return;
    await supabase.from('task_comments').update({ content: editingCommentText.trim() }).eq('id', commentId);
    setEditingCommentId(null); setEditingCommentText(''); loadComments();
  }

  async function deleteComment(id) {
    await supabase.from('task_comments').delete().eq('id', id); loadComments();
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
    <Modal title={isNew ? 'New Task' : task.title} onClose={onClose} size="lg">
      {/* Timer bar */}
      {!isNew && task?.id && (
        <div className={`flex items-center justify-between p-3 rounded-ios mb-4 -mt-1 ${isTimerActive ? 'bg-red-50 border border-red-100' : 'bg-blue-50 border border-blue-100'}`}>
          <div className="flex items-center gap-2">
            <Timer className={`w-4 h-4 ${isTimerActive ? 'text-ios-red' : 'text-ios-blue'}`} />
            <span className={`text-footnote font-semibold ${isTimerActive ? 'text-ios-red' : 'text-ios-blue'}`}>
              {isTimerActive ? `Timer active — ${fmtClock(elapsed)}` : 'Track time on this task'}
            </span>
          </div>
          <div className="flex gap-2">
            {isTimerActive && (
              <button onClick={onPauseTimer}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-ios text-footnote font-semibold text-white ${isPaused ? 'bg-ios-blue' : 'bg-ios-orange'}`}>
                {isPaused ? <><Play className="w-3.5 h-3.5" fill="white" />Resume</> : <><Pause className="w-3.5 h-3.5" fill="white" />Pause</>}
              </button>
            )}
            <button onClick={() => isTimerActive ? onStopTimer() : onStartTimer(task)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-ios text-footnote font-semibold text-white ${isTimerActive ? 'bg-ios-red' : 'bg-ios-blue'}`}>
              {isTimerActive ? <><Square className="w-3.5 h-3.5" fill="white" />Stop</> : <><Play className="w-3.5 h-3.5" fill="white" />Start</>}
            </button>
          </div>
        </div>
      )}

      {!isNew && (
        <div className="flex gap-0.5 bg-ios-fill p-1 rounded-ios mb-4">
          {[['details','Details'], ['comments', `Comments${comments.length > 0 ? ` (${comments.length})` : ''}`]].map(([k,v]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`flex-1 py-1.5 rounded-ios-sm text-footnote font-semibold transition-all ${tab===k ? 'bg-white text-ios-primary shadow-ios-sm' : 'text-ios-secondary'}`}>{v}</button>
          ))}
        </div>
      )}

      {tab === 'details' && (
        <div className="space-y-4">
          {/* Project selector */}
          <div ref={projRef} className="relative">
            <label className="input-label">Project * <span className="text-ios-red">(required)</span></label>
            <button onClick={() => setShowProjDrop(!showProjDrop)}
              className={`input w-full flex items-center justify-between text-left ${!form.project_id ? 'text-ios-tertiary' : 'text-ios-primary'}`}>
              {selectedProject ? (
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: selectedProject.color }} />
                  {selectedProject.name}
                  {selectedProject.clients?.name && <span className="text-ios-tertiary text-footnote">· {selectedProject.clients.name}</span>}
                </span>
              ) : '— Select project —'}
              <ChevronDown className="w-4 h-4 text-ios-tertiary shrink-0" />
            </button>
            {showProjDrop && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-ios-lg shadow-ios-modal border border-ios-separator/30 z-50 max-h-60 overflow-y-auto">
                <div className="p-2 border-b border-ios-separator/30 space-y-1">
                  <input className="input py-1.5 text-footnote" placeholder="Search project..." value={projSearch} onChange={e => setProjSearch(e.target.value)} autoFocus />
                  <button onClick={async () => {
                      setShowNewProj(true); setShowProjDrop(false);
                      const { data: cl } = await supabase.from('clients').select('id,name').order('name');
                      setProjClients(cl||[]);
                    }}
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-footnote text-ios-blue hover:bg-blue-50 rounded-ios font-semibold">
                    <Plus className="w-3.5 h-3.5" /> New Project
                  </button>
                </div>
                {filteredProjects.map(p => (
                  <button key={p.id} onClick={() => { setForm(prev => ({ ...prev, project_id: p.id })); setShowProjDrop(false); setProjSearch(''); }}
                    className={`w-full flex items-center gap-2 px-3 py-2.5 hover:bg-ios-fill text-left ${form.project_id===p.id ? 'bg-blue-50' : ''}`}>
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-subhead font-medium truncate">{p.name}</p>
                      {p.clients?.name && <p className="text-caption1 text-ios-secondary">{p.clients.name}</p>}
                    </div>
                    {form.project_id===p.id && <Check className="w-4 h-4 text-ios-blue shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {showNewProj && (
            <div className="bg-blue-50 rounded-ios p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-footnote font-semibold text-ios-blue">New Project</p>
                <button onClick={() => setShowNewProj(false)} className="text-ios-tertiary text-caption1">Cancel</button>
              </div>
              <input className="input" placeholder="Project name *" value={newProjName} onChange={e => setNewProjName(e.target.value)} autoFocus />
              <div>
                <p className="input-label">Client (required)</p>
                <select className="input" value={newProjClientId} onChange={e => setNewProjClientId(e.target.value)}>
                  <option value="">— Select client —</option>
                  {projClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="flex gap-2">{COL_COLORS.slice(0,6).map(c => <button key={c} onClick={() => setNewProjColor(c)} style={{ background: c }} className={`w-6 h-6 rounded-full ${newProjColor===c ? 'ring-2 ring-offset-1 ring-ios-blue' : ''}`} />)}</div>
              <button className="btn-primary w-full py-1.5 text-footnote" onClick={createProject} disabled={!newProjName.trim()}>
                Create Project & Select
              </button>
            </div>
          )}

          <div>
            <label className="input-label">Title *</label>
            <input className="input" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="What needs to be done?" />
          </div>
          <div>
            <label className="input-label">Description</label>
            <textarea className="input" rows={3} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Details..." />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="input-label">Assignee</label>
              <select className="input" value={form.assigned_to} onChange={e => setForm(p => ({ ...p, assigned_to: e.target.value }))}>
                <option value="">— Nobody —</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
              </select>
            </div>
            <div>
              <label className="input-label">Priority</label>
              <select className="input" value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}>
                {Object.entries(PRIORITY).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="input-label">Column</label>
              <select className="input" value={form.column_id} onChange={e => setForm(p => ({ ...p, column_id: e.target.value }))}>
                {boardColumns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="input-label">Due Date</label>
              <input className="input" type="date" value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} />
            </div>
          </div>

          {/* Labels */}
          {task?.id && (
            <div ref={labelRef} className="relative">
              <label className="input-label">Labels</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {taskLabels.map(l => <LabelPill key={l.id} label={l} onRemove={() => toggleLabel(l)} />)}
              </div>
              <button onClick={() => setShowLabelDrop(!showLabelDrop)}
                className="flex items-center gap-1.5 text-footnote text-ios-blue hover:bg-blue-50 px-2.5 py-1.5 rounded-ios font-semibold">
                <Tag className="w-3.5 h-3.5" /> Add label
              </button>
              {showLabelDrop && (
                <div className="absolute top-full left-0 mt-1 bg-white rounded-ios-lg shadow-ios-modal border border-ios-separator/30 z-50 w-60 max-h-56 overflow-y-auto">
                  <div className="p-2 border-b border-ios-separator/30">
                    <input className="input py-1.5 text-footnote" placeholder="Search..." value={labelSearch} onChange={e => setLabelSearch(e.target.value)} autoFocus />
                  </div>
                  {filteredLabels.map(l => (
                    <button key={l.id} onClick={() => {
                      if (isNew) {
                        setPendingLabels(p => p.some(x=>x.id===l.id) ? p.filter(x=>x.id!==l.id) : [...p, l]);
                      } else {
                        toggleLabel(l);
                      }
                    }} className="flex items-center justify-between w-full px-3 py-2.5 hover:bg-ios-fill">
                      <span className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ background: l.color }} />
                        <span className="text-subhead">{l.name}</span>
                      </span>
                      {taskLabels.some(tl => tl.id===l.id) && <Check className="w-4 h-4 text-ios-blue" />}
                    </button>
                  ))}
                  <div className="border-t border-ios-separator/30 p-2">
                    {showNewLabel ? (
                      <div className="space-y-2 overflow-y-auto flex-1" style={{maxHeight:'calc(100vh - 260px)'}}>
                        <input className="input py-1.5 text-footnote" placeholder="Label name" value={newLabelName} onChange={e => setNewLabelName(e.target.value)} autoFocus />
                        <div className="flex gap-1.5 flex-wrap">{COL_COLORS.map(c => <button key={c} onClick={() => setNewLabelColor(c)} style={{ background: c }} className={`w-5 h-5 rounded-full ${newLabelColor===c ? 'ring-2 ring-offset-1 ring-gray-400' : ''}`} />)}</div>
                        <div className="flex gap-2">
                          <button className="btn-secondary flex-1 py-1 text-caption1" onClick={() => setShowNewLabel(false)}>Cancel</button>
                          <button className="btn-primary flex-1 py-1 text-caption1" onClick={createLabel} disabled={!newLabelName.trim()}>Create</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setShowNewLabel(true)} className="flex items-center gap-2 w-full text-footnote text-ios-blue hover:bg-blue-50 px-2 py-1.5 rounded-ios font-semibold">
                        <Plus className="w-3.5 h-3.5" /> New label
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
                <Archive className="w-3.5 h-3.5" /> Archive
              </button>
            )}
            {task?.id && task?.is_archived && (
              <button onClick={unarchiveTask} className="btn-secondary flex items-center gap-1.5 text-footnote">
                <RotateCcw className="w-3.5 h-3.5" /> Restore
              </button>
            )}
            {task?.id && (
              <button onClick={onDelete} className="btn-danger flex items-center gap-1.5 text-footnote">
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            )}
            <button className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
            <button className="btn-primary flex-1" onClick={save} disabled={loading || !form.title || !form.project_id}>
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {tab === 'comments' && (
        <div className="space-y-4">
          {comments.length === 0
            ? <div className="text-center py-8 text-ios-tertiary text-subhead">No comments yet</div>
            : <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {comments.map(c => {
                  const isMe = c.user_id === currentUser?.id;
                  const isEditing = editingCommentId === c.id;
                  return (
                    <div key={c.id} className="flex gap-3 group">
                      <div className="w-7 h-7 bg-ios-blue rounded-full flex items-center justify-center text-white text-caption2 font-bold shrink-0">
                        {(c.profiles?.full_name || c.profiles?.email || '?')[0].toUpperCase()}
                      </div>
                      <div className="flex-1 bg-ios-bg rounded-ios p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-footnote font-semibold">{c.profiles?.full_name || c.profiles?.email}</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-caption2 text-ios-tertiary">{fmtDate(c.created_at)}</span>
                            {isMe && !isEditing && (
                              <>
                                <button onClick={() => { setEditingCommentId(c.id); setEditingCommentText(c.content || ''); }}
                                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-ios-fill text-ios-tertiary hover:text-ios-blue transition-all">
                                  <Edit2 className="w-3 h-3" />
                                </button>
                                <button onClick={() => deleteComment(c.id)}
                                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-ios-tertiary hover:text-ios-red transition-all">
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                        {isEditing ? (
                          <div className="space-y-2">
                            <textarea className="input text-footnote" rows={2} value={editingCommentText}
                              onChange={e => setEditingCommentText(e.target.value)} autoFocus />
                            <div className="flex gap-2">
                              <button className="btn-secondary flex-1 py-1 text-caption1" onClick={() => setEditingCommentId(null)}>Cancel</button>
                              <button className="btn-primary flex-1 py-1 text-caption1" onClick={() => saveCommentEdit(c.id)}>Save</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {c.content && <p className="text-subhead whitespace-pre-wrap">{c.content}</p>}
                            {c.file_url && (
                              <button onClick={e => { e.stopPropagation(); downloadFile(c.file_url, c.file_name); }}
                                className="flex items-center gap-1.5 mt-1.5 text-footnote text-ios-blue hover:underline">
                                <Paperclip className="w-3.5 h-3.5 shrink-0" />{c.file_name}
                                <span className="text-caption2 text-ios-tertiary">(download)</span>
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
          }
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
              <button onClick={() => fileRef.current?.click()} className="p-2 rounded-ios hover:bg-ios-fill text-ios-tertiary hover:text-ios-blue" title="Attach file">
                <Paperclip className="w-4 h-4" />
              </button>
              <input className="input flex-1 resize-none" style={{whiteSpace:"pre-wrap",wordBreak:"break-word"}} placeholder="Add comment... (Enter to send)"
                value={newComment} onChange={e => setNewComment(e.target.value)}
                onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); addComment(); }}} />
              <button onClick={addComment} disabled={(!newComment.trim() && !commentFile) || sending} className="btn-primary px-3">
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
function ColHeader({ col, onRename, onDelete, onAdd, onDragStart, onDragEnd }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div className="flex items-center justify-between mb-3 cursor-grab active:cursor-grabbing" ref={ref}
      draggable onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex items-center gap-2">
        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: col.color }} />
        <span className="text-footnote font-bold text-ios-primary select-none">{col.name}</span>
      </div>
      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
        <button onClick={() => onAdd(col.id)} className="p-1 rounded hover:bg-ios-fill text-ios-tertiary hover:text-ios-blue"><Plus className="w-3.5 h-3.5" /></button>
        <div className="relative">
          <button onClick={() => setOpen(!open)} className="p-1 rounded hover:bg-ios-fill text-ios-tertiary"><MoreHorizontal className="w-3.5 h-3.5" /></button>
          {open && (
            <div className="absolute right-0 top-full mt-1 bg-white rounded-ios shadow-ios-modal border border-ios-separator/30 py-1 z-30 w-36">
              <button onClick={() => { onRename(); setOpen(false); }} className="flex items-center gap-2 w-full px-3 py-2 text-footnote hover:bg-ios-fill"><Edit2 className="w-3.5 h-3.5" />Rename</button>
              <button onClick={() => { onDelete(); setOpen(false); }} className="flex items-center gap-2 w-full px-3 py-2 text-footnote text-ios-red hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" />Delete</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Task Row ─────────────────────────────────────────────────────────────────
function TaskRow({ task, members, boardColumns, taskLabels, activeTimer, elapsed, isPaused, onOpen, onToggleDone, onQuickArchive, onStartTimer, onStopTimer, onPauseTimer, done }) {
  const pri = PRIORITY[task.priority];
  const assignee = members.find(m => m.id === task.assigned_to);
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && !done;
  const col = boardColumns.find(c => c.id === task.column_id);
  const labels = taskLabels[task.id] || [];
  const isTimerActive = activeTimer?.task_id === task.id;

  return (
    <div onClick={onOpen}
      className={`flex items-center gap-3 px-4 py-3 border-b border-ios-separator/20 hover:bg-ios-bg/50 cursor-pointer group ${done ? 'opacity-60' : ''}`}>
      <button onClick={e => { e.stopPropagation(); onToggleDone(); }}
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
        {task.due_date && <span className={`text-caption1 font-medium ${isOverdue ? 'text-ios-red' : 'text-ios-tertiary'}`}>{new Date(task.due_date).toLocaleDateString('en-US',{day:'numeric',month:'short'})}</span>}
        <QuickTimer task={task} activeTimer={activeTimer} elapsed={elapsed} isPaused={isPaused} onStart={onStartTimer} onStop={onStopTimer} onPause={onPauseTimer} />
        {/* Quick archive button */}
        <button onClick={e => { e.stopPropagation(); onQuickArchive(); }}
          className="p-1 rounded text-ios-tertiary hover:text-ios-orange opacity-0 group-hover:opacity-100 transition-opacity"
          title="Archive">
          <Archive className="w-3.5 h-3.5" />
        </button>
        {assignee && <div className="w-6 h-6 bg-ios-blue rounded-full flex items-center justify-center text-white text-caption2 font-bold">{(assignee.full_name||assignee.email)[0].toUpperCase()}</div>}
      </div>
    </div>
  );
}



// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function TasksPage() {
  // Persist view in localStorage
  const [mode, setMode] = useState(() => {
    try { return localStorage.getItem(VIEW_KEY) || 'list'; } catch { return 'list'; }
  });
  const updateMode = m => { setMode(m); try { localStorage.setItem(VIEW_KEY, m); } catch {} };

  const [projects, setProjects] = useState([]);
  const [boardColumns, setBoardColumns] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [archivedTasks, setArchivedTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [labels, setLabels] = useState([]);
  const [taskLabels, setTaskLabels] = useState({});
  const [currentUser, setCurrentUser] = useState(null);
  const [mainFilter, setMainFilter] = useState(() => {
    try { return localStorage.getItem('sm_member_filter') || 'all'; } catch { return 'all'; }
  });
  const updateMainFilter = (v) => { setMainFilter(v); try { localStorage.setItem('sm_member_filter', v); } catch {} };
  const [filterProject, setFilterProject] = useState('');
  const [viewingUserId, setViewingUserId] = useState(null); // null = own board
  const [allMembers, setAllMembers] = useState([]);
  const [filterLabel, setFilterLabel] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState({});
  const [dragOver, setDragOver] = useState(null);
  const [dragCol, setDragCol] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [dragTaskId, setDragTaskId] = useState(null);
  const [dragOverTaskId, setDragOverTaskId] = useState(null);
  const [taskModal, setTaskModal] = useState(null);
  const [newColModal, setNewColModal] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColColor, setNewColColor] = useState('#007AFF');
  const [editColModal, setEditColModal] = useState(null);
  const [editColName, setEditColName] = useState('');
  const [showMemberDrop, setShowMemberDrop] = useState(false);
  const memberRef = useRef(null);

  const { activeTimer, elapsed, isPaused, startTimer, stopTimer, pauseTimer } = useTimer();
  const { isManager, role, profile: userProfile } = useRole();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => { setCurrentUser(user); loadTimer(); });
    loadAll();
  }, []);

  useEffect(() => {
    const h = e => { if (memberRef.current && !memberRef.current.contains(e.target)) setShowMemberDrop(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  async function loadAll(targetUserId) {
    const { data: { user: me } } = await supabase.auth.getUser();
    const uid = targetUserId || me?.id;

    const [{ data: proj }, { data: mem }, { data: lbl }] = await Promise.all([
      supabase.from('projects').select('*, clients(id,name)').eq('status','active').order('name'),
      supabase.from('profiles').select('id,full_name,email,role').order('full_name'),
      supabase.from('labels').select('*').order('name'),
    ]);
    setProjects(proj||[]); setMembers(mem||[]); setLabels(lbl||[]);
    setAllMembers(mem||[]);

    // Load columns filtered by user
    await loadColumnsForUser(uid, me?.id);
    await loadTasks();
  }

  async function loadColumnsForUser(targetUid, myUid) {
    const uid = targetUid || myUid;
    if (!uid) return;

    // Load ONLY this user's personal columns
    const { data: personal } = await supabase.from('task_columns')
      .select('*').eq('user_id', uid).order('position');

    let finalCols = personal || [];

    // If user has no personal columns yet, create defaults for them
    if (finalCols.length === 0) {
      const { data: created } = await supabase.from('task_columns')
        .insert(DEFAULT_COLS.map((c, i) => ({ ...c, position: i, user_id: uid }))).select();
      finalCols = created || [];
    }
    setBoardColumns(finalCols);
  }

  async function loadTasks() {
    const { data: { user: currentUser2 } } = await supabase.auth.getUser();
    const currentUid = currentUser2?.id;
    const { data: currentProfile } = await supabase.from('profiles').select('role').eq('id', currentUid || '').single();
    const myRole = currentProfile?.role || 'operator';

    // Get role hierarchy for filtering
    let activeQ = supabase.from('tasks').select('*, profiles!tasks_assigned_to_fkey(id,full_name,email,role), projects(id,name,color,clients(name))').eq('is_archived',false).order('position');
    let archivedQ = supabase.from('tasks').select('*, profiles!tasks_assigned_to_fkey(id,full_name,email,role), projects(id,name,color)').eq('is_archived',true).order('archived_at',{ascending:false}).limit(50);

    // Operator: only own tasks
    if (myRole === 'operator') {
      activeQ = activeQ.eq('assigned_to', currentUid);
      archivedQ = archivedQ.eq('assigned_to', currentUid);
    }

    const [{ data: activeRaw }, { data: archivedRaw }] = await Promise.all([activeQ, archivedQ]);

    // Manager: filter out tasks assigned to admins
    let active = activeRaw || [];
    let archived = archivedRaw || [];
    if (myRole === 'manager') {
      const { data: adminIds } = await supabase.from('profiles').select('id').eq('role','admin');
      const adminSet = new Set((adminIds||[]).map(a => a.id));
      active = active.filter(t => !adminSet.has(t.assigned_to));
      archived = archived.filter(t => !adminSet.has(t.assigned_to));
    }
    const all = [...(active||[]), ...(archived||[])];
    const ids = all.map(t => t.id);
    let cc = {}, tl = {};
    if (ids.length > 0) {
      const [{ data: comments }, { data: tlData }] = await Promise.all([
        supabase.from('task_comments').select('task_id').in('task_id', ids),
        supabase.from('task_labels').select('task_id, labels(*)').in('task_id', ids),
      ]);
      (comments||[]).forEach(c => cc[c.task_id] = (cc[c.task_id]||0)+1);
      (tlData||[]).forEach(row => { if (!tl[row.task_id]) tl[row.task_id]=[]; if (row.labels) tl[row.task_id].push(row.labels); });
    }
    const meta = t => ({ ...t, comment_count: cc[t.id]||0 });
    setTasks((active||[]).filter(t => t.project_id).map(meta));
    setArchivedTasks((archived||[]).filter(t => t.project_id).map(meta));
    setTaskLabels(tl);
  }

  async function quickArchive(taskId) {
    // Remove from UI immediately
    setTasks(prev => prev.filter(t => t.id !== taskId));
    await supabase.from('tasks').update({ is_archived: true, archived_at: new Date().toISOString() }).eq('id', taskId);
  }

  async function addColumn() {
    if (!newColName.trim()) return;
    // Personal column for the board being viewed (null = shared)
    const colUserId = viewingUserId || currentUser?.id || null;
    const { data } = await supabase.from('task_columns').insert({ name: newColName.trim(), color: newColColor, position: boardColumns.filter(c=>c.user_id===colUserId).length, user_id: colUserId }).select().single();
    if (data) setBoardColumns(p => [...p, data]);
    setNewColModal(false); setNewColName(''); setNewColColor('#007AFF');
  }

  async function renameColumn() {
    if (!editColName.trim() || !editColModal) return;
    await supabase.from('task_columns').update({ name: editColName }).eq('id', editColModal.id);
    setBoardColumns(p => p.map(c => c.id===editColModal.id ? { ...c, name: editColName } : c));
    setEditColModal(null);
  }

  async function deleteColumn(col) {
    if (!confirm(`Delete column "${col.name}"? Tasks in it will remain without a column.`)) return;
    await supabase.from('task_columns').delete().eq('id', col.id);
    setBoardColumns(p => p.filter(c => c.id !== col.id));
  }

  async function reorderColumns(fromId, toId) {
    if (fromId === toId) return;
    const cols = [...boardColumns];
    const fromIdx = cols.findIndex(c => c.id === fromId);
    const toIdx = cols.findIndex(c => c.id === toId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = cols.splice(fromIdx, 1);
    cols.splice(toIdx, 0, moved);
    // Update positions
    const updated = cols.map((c, i) => ({ ...c, position: i }));
    setBoardColumns(updated);
    // Save to DB
    await Promise.all(updated.map(c => supabase.from('task_columns').update({ position: c.position }).eq('id', c.id)));
  }

  async function handleDrop(e, colId) {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('taskId');
    if (!taskId) return;
    setDragOver(null);
    await supabase.from('tasks').update({ column_id: colId }).eq('id', taskId);
    setTasks(p => p.map(t => t.id===taskId ? { ...t, column_id: colId } : t));
  }

  async function toggleDone(task) {
    const newStatus = task.status==='done' ? 'todo' : 'done';
    await supabase.from('tasks').update({ status: newStatus }).eq('id', task.id);
    setTasks(p => p.map(t => t.id===task.id ? { ...t, status: newStatus } : t));
  }

  async function deleteTask(taskId) {
    if (!confirm('Delete task permanently?')) return;
    await supabase.from('tasks').delete().eq('id', taskId);
    setTaskModal(null); loadTasks();
  }

  async function handleStartTimer(task) { await startTimer({ projectId: task.project_id, taskId: task.id, description: task.title }); }

  // Filters
  let visible = tasks;
  if (mainFilter !== 'all') visible = visible.filter(t => t.assigned_to===mainFilter);
  if (filterProject) visible = visible.filter(t => t.project_id===filterProject);
  if (filterPriority) visible = visible.filter(t => t.priority===filterPriority);
  if (filterLabel) visible = visible.filter(t => (taskLabels[t.id]||[]).some(l => l.id===filterLabel));
  if (search) visible = visible.filter(t => t.title?.toLowerCase().includes(search.toLowerCase()));

  const byProject = {};
  visible.forEach(t => {
    if (!byProject[t.project_id]) byProject[t.project_id] = { project: t.projects, tasks: [] };
    byProject[t.project_id].tasks.push(t);
  });

  const selectedMember = members.find(m => m.id===mainFilter);
  // Board: show tasks for the person whose board is shown
  const boardOwner = viewingUserId || currentUser?.id;
  let boardTasks = boardOwner ? tasks.filter(t => t.assigned_to === boardOwner) : tasks;
  if (filterProject) boardTasks = boardTasks.filter(t => t.project_id===filterProject);
  if (filterPriority) boardTasks = boardTasks.filter(t => t.priority===filterPriority);
  if (filterLabel) boardTasks = boardTasks.filter(t => (taskLabels[t.id]||[]).some(l => l.id===filterLabel));
  if (search) boardTasks = boardTasks.filter(t => t.title?.toLowerCase().includes(search.toLowerCase()));
  const hasFilters = mainFilter!=='all'||filterProject||filterPriority||filterLabel||search;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-title2 font-bold text-ios-primary">{mode==='archive' ? 'Archive' : 'Tasks'}</h1>
          <p className="text-subhead text-ios-secondary">{mode==='archive' ? `${archivedTasks.length} archived` : `${visible.length} tasks`}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* View toggle */}
          <div className="flex bg-ios-fill rounded-ios p-0.5 gap-0.5">
            <button onClick={() => updateMode('list')} className={`p-2 rounded-ios-sm transition-all ${mode==='list' ? 'bg-white shadow-ios-sm' : ''}`} title="List">
              <LayoutList className="w-4 h-4 text-ios-secondary" />
            </button>
            <button onClick={() => updateMode('board')} className={`p-2 rounded-ios-sm transition-all ${mode==='board' ? 'bg-white shadow-ios-sm' : ''}`} title="Board">
              <Kanban className="w-4 h-4 text-ios-secondary" />
            </button>
            <button onClick={() => updateMode('archive')} className={`p-2 rounded-ios-sm transition-all ${mode==='archive' ? 'bg-white shadow-ios-sm' : ''}`} title="Archive">
              <Archive className="w-4 h-4 text-ios-secondary" />
            </button>
          </div>
          {/* Back or New Task */}
          {mode === 'archive' ? (
            <button onClick={() => updateMode('list')} className="btn-secondary flex items-center gap-1.5 text-footnote">
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
          ) : (
            <button onClick={() => setTaskModal({ project_id: filterProject||'' })} className="btn-primary flex items-center gap-1.5">
              <Plus className="w-4 h-4" strokeWidth={2.5} /> New Task
            </button>
          )}
          {/* Column button — only in board */}
          {mode === 'board' && (
            <button onClick={() => setNewColModal(true)} className="btn-secondary flex items-center gap-1.5 text-footnote">
              <Plus className="w-3.5 h-3.5" /> Column
            </button>
          )}
        </div>
      </div>

      {/* Board mode: person switcher — only way to switch, admin only */}
      {mode === 'board' && role === 'admin' && allMembers.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 -mt-1">
          {[{ id: null, label: 'My Board', isMe: true }, ...allMembers.filter(m => m.id !== currentUser?.id).map(m => ({ id: m.id, label: m.full_name?.split(' ')[0] || m.email, isMe: false }))].map(item => {
            const active = item.id === null ? !viewingUserId : viewingUserId === item.id;
            return (
              <button key={item.id || 'me'} onClick={() => setViewingUserId(item.id)}
                className={`px-3.5 py-1.5 rounded-full text-footnote font-semibold whitespace-nowrap transition-all ${active ? 'bg-ios-blue text-white shadow-ios-sm' : 'bg-ios-fill text-ios-secondary hover:bg-ios-fill2'}`}>
                {item.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Filters */}
      {mode !== 'archive' && (
        <div className="flex items-center gap-2 flex-wrap">
          {mode === 'list' && (
            <div className="relative" ref={memberRef}>
              <button onClick={() => setShowMemberDrop(!showMemberDrop)}
                className={`flex items-center gap-2 px-3 py-2 rounded-ios text-subhead font-semibold border transition-all ${mainFilter==='all' ? 'bg-white border-ios-separator text-ios-primary' : 'bg-ios-blue border-ios-blue text-white'}`}>
                {mainFilter==='all' ? <><Users className="w-4 h-4"/>All members</> : <><User className="w-4 h-4"/>{selectedMember?.full_name?.split(' ')[0]}</>}
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {showMemberDrop && (
                <div className="absolute top-full left-0 mt-2 bg-white rounded-ios-lg shadow-ios-modal border border-ios-separator/30 py-1 z-50 w-52">
                  <button onClick={() => { updateMainFilter('all'); setShowMemberDrop(false); }}
                    className={`flex items-center gap-2 w-full px-3 py-2.5 text-subhead hover:bg-ios-fill ${mainFilter==='all' ? 'text-ios-blue font-semibold' : 'text-ios-primary'}`}>
                    <Users className="w-4 h-4"/>All members {mainFilter==='all' && <Check className="w-4 h-4 ml-auto"/>}
                  </button>
                  <div className="border-t border-ios-separator/30 my-1"/>
                  {members.map(m => (
                    <button key={m.id} onClick={() => { updateMainFilter(m.id); setShowMemberDrop(false); }}
                      className={`flex items-center gap-2 w-full px-3 py-2.5 text-subhead hover:bg-ios-fill ${mainFilter===m.id ? 'text-ios-blue font-semibold' : 'text-ios-primary'}`}>
                      <div className="w-6 h-6 bg-ios-blue rounded-full flex items-center justify-center text-white text-caption2 font-bold shrink-0">{(m.full_name||m.email)[0].toUpperCase()}</div>
                      <span className="truncate">{m.full_name||m.email}</span>
                      {mainFilter===m.id && <Check className="w-4 h-4 ml-auto shrink-0"/>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-tertiary"/>
            <input className="input pl-9 w-36 py-2 text-footnote" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}/>
          </div>
          <select className="input py-2 text-footnote w-36" value={filterProject} onChange={e => setFilterProject(e.target.value)}>
            <option value="">All projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className="input py-2 text-footnote w-36" value={filterLabel} onChange={e => setFilterLabel(e.target.value)}>
            <option value="">All labels</option>
            {labels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select className="input py-2 text-footnote w-32" value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
            <option value="">Any priority</option>
            {Object.entries(PRIORITY).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          {hasFilters && (
            <button onClick={() => { updateMainFilter('all'); setFilterProject(''); setFilterPriority(''); setFilterLabel(''); setSearch(''); }}
              className="flex items-center gap-1 text-footnote text-ios-red hover:bg-red-50 px-2 py-2 rounded-ios">
              <X className="w-3.5 h-3.5"/> Reset
            </button>
          )}
        </div>
      )}

      {/* LIST */}
      {mode === 'list' && (
        <div className="card overflow-hidden">
          {Object.keys(byProject).length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-subhead text-ios-secondary mb-4">{hasFilters ? 'No tasks match filters' : 'No tasks yet'}</p>
              <button onClick={() => setTaskModal({ project_id: filterProject||'' })} className="btn-primary">New Task</button>
            </div>
          ) : Object.entries(byProject).map(([pid, { project, tasks: projTasks }]) => {
            const openTasks = projTasks.filter(t => t.status!=='done');
            const doneTasks = projTasks.filter(t => t.status==='done');
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
                    onOpen={() => setTaskModal(t)}
                    onToggleDone={() => toggleDone(t)}
                    onQuickArchive={() => quickArchive(t.id)}
                    onStartTimer={handleStartTimer} onStopTimer={stopTimer} onPauseTimer={pauseTimer} isPaused={isPaused} />
                ))}
                {!isCollapsed && doneTasks.length > 0 && (
                  <div className="border-t border-ios-separator/20">
                    <button onClick={() => setCollapsed(p => ({ ...p, [`done_${pid}`]: !p[`done_${pid}`] }))}
                      className="flex items-center gap-2 w-full px-4 py-2 text-footnote text-ios-blue hover:bg-blue-50/50">
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${collapsed[`done_${pid}`] ? '-rotate-90' : ''}`}/>
                      {collapsed[`done_${pid}`] ? `Show ${doneTasks.length} completed` : `Hide ${doneTasks.length} completed`}
                    </button>
                    {!collapsed[`done_${pid}`] && (
                      <div className="bg-gray-50/50">
                        <p className="px-4 py-1.5 text-caption1 font-semibold text-ios-tertiary uppercase tracking-wide">COMPLETED</p>
                        {doneTasks.map(t => (
                          <TaskRow key={t.id} task={t} members={members} boardColumns={boardColumns} taskLabels={taskLabels}
                            activeTimer={activeTimer} elapsed={elapsed} isPaused={isPaused}
                            onOpen={() => setTaskModal(t)}
                            onToggleDone={() => toggleDone(t)}
                            onQuickArchive={() => quickArchive(t.id)}
                            onStartTimer={handleStartTimer} onStopTimer={stopTimer} onPauseTimer={pauseTimer} done />
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
            const isFirstCol = boardColumns[0]?.id === col.id;
            const knownColIds = new Set(boardColumns.map(c => c.id));
            const orphanTasks = isFirstCol ? boardTasks.filter(t => !t.column_id || !knownColIds.has(t.column_id)) : [];
            const colTasks = [...boardTasks.filter(t => t.column_id===col.id), ...orphanTasks];
            const isDragTarget = dragOver===col.id;
            return (
              <div key={col.id}
                className={`shrink-0 w-72 rounded-ios-lg p-3 transition-all flex flex-col ${isDragTarget ? 'bg-blue-50 ring-2 ring-ios-blue' : dragOverCol === col.id && dragCol !== col.id ? 'ring-2 ring-ios-orange ring-dashed' : 'bg-ios-bg'}`}
                onDragOver={e => { e.preventDefault(); if (dragCol) setDragOverCol(col.id); else setDragOver(col.id); }}
                onDragLeave={() => { setDragOver(null); setDragOverCol(null); }}
                onDrop={e => { if (dragCol) { reorderColumns(dragCol, col.id); setDragCol(null); setDragOverCol(null); } else { handleDrop(e, col.id); } }}>
                <ColHeader col={col}
                  onRename={() => { setEditColModal(col); setEditColName(col.name); }}
                  onDelete={() => deleteColumn(col)}
                  onAdd={colId => setTaskModal({ column_id: colId, project_id: filterProject||'' })}
                  onDragStart={() => setDragCol(col.id)}
                  onDragEnd={() => { setDragCol(null); setDragOverCol(null); }} />
                <div className="space-y-2">
                  {colTasks.map(task => {
                    const pri = PRIORITY[task.priority];
                    const assignee = members.find(m => m.id===task.assigned_to);
                    const labels = taskLabels[task.id]||[];
                    const isDone = task.status==='done';
                    const isTimerActive = activeTimer?.task_id===task.id;
                    return (
                      <div key={task.id} draggable
                        onDragStart={e => { e.dataTransfer.setData('taskId', task.id); setDragTaskId(task.id); }}
                        onDragEnd={() => { setDragOver(null); setDragTaskId(null); setDragOverTaskId(null); }}
                        onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOverTaskId(task.id); }}
                        onDrop={async e => {
                          e.preventDefault();
                          const srcId = e.dataTransfer.getData('taskId');
                          if (!srcId || srcId === task.id) { setDragOverTaskId(null); return; }
                          const srcTask = boardTasks.find(t => t.id === srcId);
                          if (srcTask?.column_id === col.id) {
                            // Same column — reorder
                            e.stopPropagation();
                            const colItems = boardTasks.filter(t => t.column_id === col.id);
                            const srcIdx = colItems.findIndex(t => t.id === srcId);
                            const dstIdx = colItems.findIndex(t => t.id === task.id);
                            if (srcIdx !== -1 && dstIdx !== -1) {
                              const reordered = [...colItems];
                              const [moved] = reordered.splice(srcIdx, 1);
                              reordered.splice(dstIdx, 0, moved);
                              setTasks(prev => { const others = prev.filter(t => t.column_id !== col.id); return [...others, ...reordered]; });
                              await Promise.all(reordered.map((t, i) => supabase.from('tasks').update({ position: i, column_id: col.id }).eq('id', t.id)));
                            }
                          }
                          // Cross-column: let bubble to column handler
                          setDragOverTaskId(null);
                        }}
                        onClick={() => setTaskModal(task)}
                        className={`bg-white rounded-ios border p-2.5 cursor-pointer hover:shadow-ios transition-all select-none group ${dragOverTaskId === task.id && dragTaskId !== task.id ? 'border-ios-blue border-2' : ''} ${isDone ? 'opacity-50' : isTimerActive ? 'border-ios-blue bg-blue-50/30' : 'border-ios-separator/50'}`}>

                        {/* Row 1: labels + archive */}
                        {labels.length > 0 && (
                          <div className="flex gap-1 flex-wrap mb-1.5">
                            {labels.slice(0,3).map(l => <span key={l.id} className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{background:l.color}}>{l.name}</span>)}
                          </div>
                        )}

                        {/* Row 2: checkbox + title + archive */}
                        <div className="flex items-start gap-1.5">
                          <button onClick={e => { e.stopPropagation(); toggleDone(task); }}
                            className={`shrink-0 w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center mt-0.5 transition-all ${isDone ? 'border-ios-green bg-ios-green' : 'border-ios-separator hover:border-ios-blue'}`}>
                            {isDone && <Check className="w-2 h-2 text-white" strokeWidth={3}/>}
                          </button>
                          <p className={`text-footnote font-semibold leading-snug flex-1 ${isDone ? 'line-through text-ios-tertiary' : 'text-ios-primary'}`}>{task.title}</p>
                          <button onClick={e => { e.stopPropagation(); quickArchive(task.id); }}
                            className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-ios-tertiary hover:text-ios-orange shrink-0">
                            <Archive className="w-3 h-3"/>
                          </button>
                        </div>

                        {/* Row 3: project + meta */}
                        <div className="flex items-center justify-between mt-1.5 gap-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {task.projects?.name && (
                              <div className="flex items-center gap-1 min-w-0">
                                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{background:task.projects.color||'#007AFF'}}/>
                                <span className="text-[10px] text-ios-secondary truncate">{task.projects.name}</span>
                              </div>
                            )}
                            {task.comment_count > 0 && (
                              <div className="flex items-center gap-0.5 text-ios-tertiary shrink-0">
                                <MessageSquare className="w-3 h-3"/><span className="text-[10px]">{task.comment_count}</span>
                              </div>
                            )}
                            {pri && <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{background:pri.color}} title={pri.label}/>}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {task.due_date && <span className="text-[10px] text-ios-tertiary">{new Date(task.due_date).toLocaleDateString('en-US',{day:'numeric',month:'short'})}</span>}
                            {assignee && (
                              <div className="w-5 h-5 bg-ios-blue rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0">
                                {(assignee.full_name||assignee.email)[0].toUpperCase()}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Timer controls on hover */}
                        {isTimerActive && (
                          <div className="flex items-center gap-1 mt-1.5" onClick={e=>e.stopPropagation()}>
                            <button onClick={()=>pauseTimer()} className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold ${isPaused?'bg-blue-50 text-ios-blue':'bg-orange-50 text-ios-orange'}`}>
                              {isPaused?<><Play className="w-2.5 h-2.5" fill="currentColor"/>Resume</>:<><Pause className="w-2.5 h-2.5" fill="currentColor"/>Pause</>}
                            </button>
                            <button onClick={()=>stopTimer()} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-ios-red">
                              <Square className="w-2.5 h-2.5" fill="currentColor"/><span className="font-mono">{fmtClock(elapsed)}</span>
                            </button>
                          </div>
                        )}
                        {!isTimerActive && (
                          <button onClick={e=>{e.stopPropagation();handleStartTimer(task);}}
                            className="mt-1 w-full flex items-center justify-center gap-0.5 py-0.5 rounded text-[10px] font-semibold opacity-0 group-hover:opacity-100 bg-blue-50 text-ios-blue transition-opacity">
                            <Play className="w-2.5 h-2.5" fill="currentColor"/>Start timer
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {colTasks.length === 0 && (
                    <div className={`h-20 rounded-ios border-2 border-dashed flex flex-col items-center justify-center gap-1 transition-all ${isDragTarget ? 'border-ios-blue bg-blue-50' : 'border-ios-separator/50 opacity-50'}`}>
                      <Kanban className={`w-4 h-4 ${isDragTarget ? 'text-ios-blue' : 'text-ios-label4'}`} />
                      <p className={`text-caption2 font-medium ${isDragTarget ? 'text-ios-blue' : 'text-ios-label4'}`}>Drop tasks here</p>
                    </div>
                  )}
                  <button onClick={() => setTaskModal({ column_id: col.id, project_id: filterProject||'' })}
                    className="w-full py-2.5 text-footnote font-semibold text-ios-blue hover:bg-blue-50 border-2 border-ios-blue/30 hover:border-ios-blue rounded-ios flex items-center justify-center gap-1.5 transition-all">
                    <Plus className="w-4 h-4"/> New Task
                  </button>
                </div>
              </div>
            );
          })}
          <button onClick={() => setNewColModal(true)}
            className="shrink-0 w-52 h-14 rounded-ios-lg border-2 border-dashed border-ios-separator flex items-center justify-center gap-2 text-ios-tertiary hover:border-ios-blue hover:text-ios-blue transition-colors">
            <Plus className="w-4 h-4"/><span className="text-footnote font-medium">New column</span>
          </button>
        </div>
      )}

      {/* ARCHIVE */}
      {mode === 'archive' && (
        <div className="card overflow-hidden">
          {archivedTasks.length === 0 ? (
            <div className="p-12 text-center"><Archive className="w-8 h-8 text-ios-label4 mx-auto mb-3"/><p className="text-subhead text-ios-secondary">No archived tasks</p></div>
          ) : archivedTasks.map(task => {
            const assignee = members.find(m => m.id===task.assigned_to);
            return (
              <div key={task.id} onClick={() => setTaskModal(task)}
                className="flex items-center gap-3 px-4 py-3 border-b border-ios-separator/20 hover:bg-ios-bg/50 cursor-pointer opacity-70">
                <Archive className="w-4 h-4 text-ios-tertiary shrink-0"/>
                <div className="flex-1 min-w-0">
                  <p className="text-subhead text-ios-secondary line-through truncate">{task.title}</p>
                  <p className="text-caption1 text-ios-tertiary">{task.projects?.name} · Archived {fmtDate(task.archived_at)}</p>
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
          activeTimer={activeTimer} elapsed={elapsed} currentUser={currentUser}
          onClose={() => setTaskModal(null)}
          onSave={() => { setTaskModal(null); loadAll(); }}
          onDelete={() => deleteTask(taskModal.id)}
          onStartTimer={handleStartTimer} onStopTimer={stopTimer} onPauseTimer={pauseTimer} isPaused={isPaused} />
      )}

      {newColModal && (
        <Modal title="New Column" onClose={() => setNewColModal(false)}>
          <div className="space-y-4">
            <div><label className="input-label">Name *</label><input className="input" value={newColName} onChange={e => setNewColName(e.target.value)} autoFocus/></div>
            <div><label className="input-label">Color</label><div className="flex gap-2 flex-wrap">{COL_COLORS.map(c => <button key={c} onClick={() => setNewColColor(c)} style={{ background: c }} className={`w-7 h-7 rounded-full ${newColColor===c ? 'ring-2 ring-offset-2 ring-ios-blue scale-110' : ''}`}/>)}</div></div>
            <div className="flex gap-3"><button className="btn-secondary flex-1" onClick={() => setNewColModal(false)}>Cancel</button><button className="btn-primary flex-1" onClick={addColumn} disabled={!newColName.trim()}>Add</button></div>
          </div>
        </Modal>
      )}

      {editColModal && (
        <Modal title="Rename Column" onClose={() => setEditColModal(null)}>
          <div className="space-y-4">
            <div><label className="input-label">New name</label><input className="input" value={editColName} onChange={e => setEditColName(e.target.value)} autoFocus/></div>
            <div className="flex gap-3"><button className="btn-secondary flex-1" onClick={() => setEditColModal(null)}>Cancel</button><button className="btn-primary flex-1" onClick={renameColumn} disabled={!editColName.trim()}>Save</button></div>
          </div>
        </Modal>
      )}
    </div>
  );
}
