'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/Modal';
import { TASK_PRIORITY, fmtDate } from '@/lib/utils';
import {
  Plus, ChevronRight, ChevronDown, Settings, Archive,
  MessageSquare, Paperclip, X, Send, Trash2, GripVertical,
  FolderOpen, ArrowLeft, Edit2, Check, MoreHorizontal
} from 'lucide-react';

const DEFAULT_COLUMNS = [
  { name: 'De făcut', color: '#AEAEB2' },
  { name: 'În lucru',  color: '#007AFF' },
  { name: 'Review',    color: '#FF9500' },
  { name: 'Finalizat', color: '#34C759' },
];

const PRIORITIES = ['low','medium','high','urgent'];
const PRIORITY_LABELS = { low:'Scăzut', medium:'Mediu', high:'Ridicat', urgent:'Urgent' };

// ─── Task Card ────────────────────────────────────────────────────────────────
function TaskCard({ task, members, onOpen, onDragStart, onDragEnd }) {
  const pri = TASK_PRIORITY[task.priority];
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done';
  const assignee = members.find(m => m.id === task.assigned_to);

  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.setData('taskId', task.id); onDragStart?.(task.id); }}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(task)}
      className="bg-white rounded-ios border border-ios-separator/50 p-3 cursor-pointer hover:shadow-ios transition-all active:scale-98 select-none group"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-footnote font-semibold text-ios-primary flex-1 leading-snug">{task.title}</p>
        <span className={`badge ${pri?.color || 'badge-gray'} shrink-0 text-[10px]`}>{pri?.label}</span>
      </div>
      {task.description && <p className="text-caption2 text-ios-secondary mb-2 line-clamp-2">{task.description}</p>}
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-2">
          {task.comment_count > 0 && (
            <div className="flex items-center gap-0.5 text-ios-tertiary">
              <MessageSquare className="w-3 h-3" />
              <span className="text-caption2">{task.comment_count}</span>
            </div>
          )}
          {task.file_count > 0 && (
            <div className="flex items-center gap-0.5 text-ios-tertiary">
              <Paperclip className="w-3 h-3" />
              <span className="text-caption2">{task.file_count}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {task.due_date && (
            <span className={`text-caption2 font-medium ${isOverdue ? 'text-ios-red' : 'text-ios-tertiary'}`}>
              {new Date(task.due_date).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' })}
            </span>
          )}
          {assignee && (
            <div className="w-5 h-5 bg-ios-blue rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0"
              title={assignee.full_name || assignee.email}>
              {(assignee.full_name || assignee.email)[0].toUpperCase()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Column Header ────────────────────────────────────────────────────────────
function ColumnHeader({ col, count, onEdit, onArchive, onAddTask }) {
  const [menu, setMenu] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setMenu(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div className="flex items-center justify-between mb-3 px-0.5" ref={ref}>
      <div className="flex items-center gap-2">
        <div className="w-2.5 h-2.5 rounded-full" style={{ background: col.color }} />
        <span className="text-footnote font-bold text-ios-primary">{col.name}</span>
        <span className="text-caption2 text-ios-tertiary font-semibold bg-ios-fill px-1.5 py-0.5 rounded-full">{count}</span>
      </div>
      <div className="flex items-center gap-1">
        <button onClick={() => onAddTask(col.id)} className="p-1 rounded-ios hover:bg-ios-fill text-ios-tertiary hover:text-ios-blue transition-colors">
          <Plus className="w-3.5 h-3.5" />
        </button>
        <div className="relative">
          <button onClick={() => setMenu(!menu)} className="p-1 rounded-ios hover:bg-ios-fill text-ios-tertiary transition-colors">
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
          {menu && (
            <div className="absolute right-0 top-full mt-1 bg-white rounded-ios shadow-ios-modal border border-ios-separator/30 py-1 z-20 w-36">
              <button onClick={() => { onEdit(); setMenu(false); }} className="flex items-center gap-2 w-full px-3 py-2 text-footnote text-ios-primary hover:bg-ios-fill">
                <Edit2 className="w-3.5 h-3.5" /> Redenumește
              </button>
              <button onClick={() => { onArchive(); setMenu(false); }} className="flex items-center gap-2 w-full px-3 py-2 text-footnote text-ios-red hover:bg-red-50">
                <Archive className="w-3.5 h-3.5" /> Arhivează
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Task Detail Modal ────────────────────────────────────────────────────────
function TaskDetail({ task, members, columns, projects, onClose, onSave, onDelete, currentUser }) {
  const [form, setForm] = useState({
    title: task?.title || '', description: task?.description || '',
    assigned_to: task?.assigned_to || '', priority: task?.priority || 'medium',
    due_date: task?.due_date || '', column_id: task?.column_id || '',
    project_id: task?.project_id || '',
  });
  const [comments, setComments] = useState([]);
  const [files, setFiles] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [tab, setTab] = useState('details');
  const fileRef = useRef(null);

  useEffect(() => {
    if (task?.id) { loadComments(); loadFiles(); }
  }, [task?.id]);

  async function loadComments() {
    const { data } = await supabase.from('task_comments')
      .select('*, profiles(full_name, email)')
      .eq('task_id', task.id).order('created_at');
    setComments(data || []);
  }

  async function loadFiles() {
    const { data } = await supabase.from('task_files')
      .select('*, profiles(full_name)')
      .eq('task_id', task.id).order('created_at', { ascending: false });
    setFiles(data || []);
  }

  async function save() {
    setLoading(true);
    const payload = { ...form, assigned_to: form.assigned_to || null, due_date: form.due_date || null, column_id: form.column_id || null };
    if (task?.id) await supabase.from('tasks').update(payload).eq('id', task.id);
    else await supabase.from('tasks').insert({ ...payload, status: 'todo' });
    setLoading(false);
    onSave();
  }

  async function addComment() {
    if (!newComment.trim() || !task?.id) return;
    await supabase.from('task_comments').insert({
      task_id: task.id, user_id: currentUser?.id, content: newComment.trim(),
    });
    setNewComment('');
    loadComments();
  }

  async function deleteComment(id) {
    await supabase.from('task_comments').delete().eq('id', id);
    loadComments();
  }

  async function uploadFile(e) {
    const file = e.target.files?.[0]; if (!file || !task?.id) return;
    setUploading(true);
    try {
      const path = `tasks/${task.id}/${Date.now()}_${file.name}`;
      const { data, error } = await supabase.storage.from('task-files').upload(path, file);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('task-files').getPublicUrl(path);
      await supabase.from('task_files').insert({
        task_id: task.id, user_id: currentUser?.id,
        file_name: file.name, file_url: publicUrl,
        file_size: file.size, file_type: file.type,
      });
      loadFiles();
    } catch (err) {
      alert('Eroare la upload: ' + err.message);
    } finally {
      setUploading(false);
    }
  }

  async function deleteFile(f) {
    await supabase.from('task_files').delete().eq('id', f.id);
    loadFiles();
  }

  async function archiveTask() {
    if (!confirm('Arhivezi taskul? Va fi ascuns din board.')) return;
    await supabase.from('tasks').update({ is_archived: true, archived_at: new Date().toISOString() }).eq('id', task.id);
    onSave();
  }

  function fmtFileSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1048576) return `${(bytes/1024).toFixed(0)}KB`;
    return `${(bytes/1048576).toFixed(1)}MB`;
  }

  return (
    <Modal title={task?.id ? 'Task' : 'Task nou'} onClose={onClose} size="lg">
      {/* Tabs */}
      {task?.id && (
        <div className="flex gap-0.5 bg-ios-fill p-1 rounded-ios mb-4 -mt-1">
          {[['details','Detalii'],['comments',`Comentarii${comments.length > 0 ? ` (${comments.length})` : ''}`],['files',`Fișiere${files.length > 0 ? ` (${files.length})` : ''}`]].map(([k,v]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`flex-1 py-1.5 rounded-ios-sm text-footnote font-semibold transition-all ${tab === k ? 'bg-white text-ios-primary shadow-ios-sm' : 'text-ios-secondary'}`}>{v}</button>
          ))}
        </div>
      )}

      {/* Details tab */}
      {tab === 'details' && (
        <div className="space-y-4">
          <div>
            <label className="input-label">Titlu *</label>
            <input className="input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Titlu task..." />
          </div>
          <div>
            <label className="input-label">Descriere</label>
            <textarea className="input" rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Descrie taskul..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="input-label">Responsabil</label>
              <select className="input" value={form.assigned_to} onChange={e => setForm({ ...form, assigned_to: e.target.value })}>
                <option value="">— Nimeni —</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
              </select>
            </div>
            <div>
              <label className="input-label">Prioritate</label>
              <select className="input" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
              </select>
            </div>
            <div>
              <label className="input-label">Coloană</label>
              <select className="input" value={form.column_id} onChange={e => setForm({ ...form, column_id: e.target.value })}>
                <option value="">— Selectează —</option>
                {columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="input-label">Data limită</label>
              <input className="input" type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            {task?.id && (
              <>
                <button onClick={archiveTask} className="btn-secondary flex items-center gap-2">
                  <Archive className="w-4 h-4" /> Arhivează
                </button>
                <button onClick={onDelete} className="btn-danger flex items-center gap-2">
                  <Trash2 className="w-4 h-4" /> Șterge
                </button>
              </>
            )}
            <button className="btn-secondary flex-1" onClick={onClose}>Anulează</button>
            <button className="btn-primary flex-1" onClick={save} disabled={loading || !form.title}>
              {loading ? 'Se salvează...' : 'Salvează'}
            </button>
          </div>
        </div>
      )}

      {/* Comments tab */}
      {tab === 'comments' && (
        <div className="space-y-4">
          {comments.length === 0 ? (
            <div className="text-center py-6 text-ios-tertiary text-subhead">Niciun comentariu încă</div>
          ) : (
            <div className="space-y-3">
              {comments.map(c => (
                <div key={c.id} className="flex gap-3">
                  <div className="w-7 h-7 bg-ios-blue rounded-full flex items-center justify-center text-white text-caption2 font-bold shrink-0">
                    {(c.profiles?.full_name || c.profiles?.email || '?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 bg-ios-bg rounded-ios p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-footnote font-semibold text-ios-primary">{c.profiles?.full_name || c.profiles?.email}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-caption2 text-ios-tertiary">{fmtDate(c.created_at)}</span>
                        {c.user_id === currentUser?.id && (
                          <button onClick={() => deleteComment(c.id)} className="text-ios-tertiary hover:text-ios-red transition-colors">
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-subhead text-ios-primary whitespace-pre-wrap">{c.content}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add comment */}
          <div className="flex gap-2 pt-2 border-t border-ios-separator/30">
            <input className="input flex-1" placeholder="Adaugă comentariu..." value={newComment}
              onChange={e => setNewComment(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addComment(); } }} />
            <button onClick={addComment} disabled={!newComment.trim()} className="btn-primary px-3">
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Files tab */}
      {tab === 'files' && (
        <div className="space-y-4">
          <input ref={fileRef} type="file" className="hidden" onChange={uploadFile} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="btn-secondary w-full flex items-center justify-center gap-2">
            <Paperclip className="w-4 h-4" />
            {uploading ? 'Se încarcă...' : 'Adaugă fișier'}
          </button>
          <p className="text-caption1 text-ios-tertiary text-center -mt-2">
            Notă: Activează Storage în Supabase pentru fișiere
          </p>

          {files.length === 0 ? (
            <div className="text-center py-6 text-ios-tertiary text-subhead">Niciun fișier atașat</div>
          ) : (
            <div className="space-y-2">
              {files.map(f => (
                <div key={f.id} className="flex items-center gap-3 p-3 bg-ios-bg rounded-ios">
                  <Paperclip className="w-4 h-4 text-ios-secondary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <a href={f.file_url} target="_blank" rel="noopener noreferrer"
                      className="text-footnote font-semibold text-ios-blue hover:underline truncate block">{f.file_name}</a>
                    <p className="text-caption2 text-ios-tertiary">{f.profiles?.full_name} · {fmtFileSize(f.file_size)}</p>
                  </div>
                  <button onClick={() => deleteFile(f)} className="text-ios-tertiary hover:text-ios-red shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

// ─── Main Tasks Page ──────────────────────────────────────────────────────────
export default function TasksPage() {
  const [view, setView] = useState('projects'); // 'projects' | 'board'
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [columns, setColumns] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [taskModal, setTaskModal] = useState(null); // null | task object | 'new'
  const [newTaskCol, setNewTaskCol] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editColModal, setEditColModal] = useState(null);
  const [editColName, setEditColName] = useState('');
  const [newColModal, setNewColModal] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColColor, setNewColColor] = useState('#007AFF');
  const [dragOver, setDragOver] = useState(null);
  const [filterAssignee, setFilterAssignee] = useState('');
  const [myTasksOnly, setMyTasksOnly] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUser(user));
    loadProjects();
    supabase.from('profiles').select('id, full_name, email').order('full_name')
      .then(({ data }) => setMembers(data || []));
  }, []);

  async function loadProjects() {
    const { data } = await supabase.from('projects').select('*, clients(name)').eq('status', 'active').order('name');
    setProjects(data || []);
  }

  async function openProject(project) {
    setSelectedProject(project);
    setView('board');
    await loadBoard(project.id);
  }

  async function loadBoard(projectId) {
    // Load columns
    let { data: cols } = await supabase.from('task_columns')
      .select('*').eq('project_id', projectId).eq('is_archived', false).order('position');

    // If no columns, create defaults
    if (!cols || cols.length === 0) {
      const toInsert = DEFAULT_COLUMNS.map((c, i) => ({ ...c, project_id: projectId, position: i }));
      const { data: created } = await supabase.from('task_columns').insert(toInsert).select();
      cols = created || [];
    }
    setColumns(cols);

    // Load tasks with counts
    const { data: taskData } = await supabase.from('tasks')
      .select('*, profiles(full_name,email)')
      .eq('project_id', projectId)
      .eq('is_archived', false)
      .order('position');

    // Load comment and file counts
    const taskIds = (taskData || []).map(t => t.id);
    let commentCounts = {}, fileCounts = {};
    if (taskIds.length > 0) {
      const [{ data: comments }, { data: files }] = await Promise.all([
        supabase.from('task_comments').select('task_id').in('task_id', taskIds),
        supabase.from('task_files').select('task_id').in('task_id', taskIds),
      ]);
      (comments || []).forEach(c => commentCounts[c.task_id] = (commentCounts[c.task_id] || 0) + 1);
      (files || []).forEach(f => fileCounts[f.task_id] = (fileCounts[f.task_id] || 0) + 1);
    }

    setTasks((taskData || []).map(t => ({ ...t, comment_count: commentCounts[t.id] || 0, file_count: fileCounts[t.id] || 0 })));
  }

  async function handleDrop(e, colId) {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('taskId');
    if (!taskId) return;
    setDragOver(null);
    await supabase.from('tasks').update({ column_id: colId }).eq('id', taskId);
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, column_id: colId } : t));
  }

  async function addColumn() {
    if (!newColName.trim() || !selectedProject) return;
    const pos = columns.length;
    const { data } = await supabase.from('task_columns').insert({
      project_id: selectedProject.id, name: newColName.trim(), color: newColColor, position: pos,
    }).select().single();
    if (data) setColumns(prev => [...prev, data]);
    setNewColModal(false); setNewColName(''); setNewColColor('#007AFF');
  }

  async function renameColumn() {
    if (!editColName.trim() || !editColModal) return;
    await supabase.from('task_columns').update({ name: editColName }).eq('id', editColModal.id);
    setColumns(prev => prev.map(c => c.id === editColModal.id ? { ...c, name: editColName } : c));
    setEditColModal(null);
  }

  async function archiveColumn(col) {
    if (!confirm(`Arhivezi coloana "${col.name}"? Taskurile din ea vor rămâne, dar coloana va fi ascunsă.`)) return;
    await supabase.from('task_columns').update({ is_archived: true }).eq('id', col.id);
    setColumns(prev => prev.filter(c => c.id !== col.id));
  }

  async function deleteTask(taskId) {
    if (!confirm('Ștergi taskul definitiv?')) return;
    await supabase.from('tasks').delete().eq('id', taskId);
    setTaskModal(null);
    loadBoard(selectedProject.id);
  }

  function openNewTask(colId) {
    setNewTaskCol(colId);
    setTaskModal({ column_id: colId, project_id: selectedProject?.id });
  }

  const COLORS = ['#007AFF','#34C759','#FF9500','#FF3B30','#AF52DE','#32ADE6','#5856D6'];

  let visibleTasks = tasks;
  if (filterAssignee) visibleTasks = visibleTasks.filter(t => t.assigned_to === filterAssignee);
  if (myTasksOnly) visibleTasks = visibleTasks.filter(t => t.assigned_to === currentUser?.id);

  return (
    <div className="space-y-4">
      {view === 'projects' ? (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-title2 font-bold text-ios-primary">Taskuri</h1>
              <p className="text-subhead text-ios-secondary">Selectează proiectul</p>
            </div>
          </div>

          {projects.length === 0 ? (
            <div className="card p-12 text-center">
              <FolderOpen className="w-8 h-8 text-ios-label4 mx-auto mb-3" />
              <p className="text-subhead text-ios-secondary">Niciun proiect activ</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map(p => {
                const projectTasks = tasks.filter(t => t.project_id === p.id);
                return (
                  <button key={p.id} onClick={() => openProject(p)}
                    className="card p-4 text-left hover:shadow-ios-lg transition-all active:scale-98">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ background: p.color }} />
                        <p className="text-subhead font-bold text-ios-primary">{p.name}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-ios-tertiary" />
                    </div>
                    {p.clients?.name && <p className="text-footnote text-ios-secondary mb-2">{p.clients.name}</p>}
                    <div className="flex items-center gap-2 text-caption1 text-ios-tertiary">
                      <span>Board cu coloane personalizate</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
          {/* Board header */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <button onClick={() => setView('projects')} className="p-2 rounded-ios hover:bg-ios-fill transition-colors">
                <ArrowLeft className="w-5 h-5 text-ios-secondary" />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ background: selectedProject?.color }} />
                  <h1 className="text-title3 font-bold text-ios-primary">{selectedProject?.name}</h1>
                </div>
                {selectedProject?.clients?.name && <p className="text-footnote text-ios-secondary">{selectedProject.clients.name}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* My tasks filter */}
              <button onClick={() => { setMyTasksOnly(!myTasksOnly); setFilterAssignee(''); }}
                className={`px-3 py-1.5 rounded-ios text-footnote font-semibold transition-all ${myTasksOnly ? 'bg-ios-blue text-white' : 'bg-ios-fill text-ios-secondary'}`}>
                Taskurile mele
              </button>
              {/* Assignee filter */}
              <select className="input py-1.5 text-footnote w-36" value={filterAssignee}
                onChange={e => { setFilterAssignee(e.target.value); setMyTasksOnly(false); }}>
                <option value="">Toată echipa</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
              </select>
              <button onClick={() => setNewColModal(true)} className="btn-secondary flex items-center gap-1.5 text-footnote">
                <Plus className="w-3.5 h-3.5" /> Coloană
              </button>
              <button onClick={() => openNewTask(columns[0]?.id)} className="btn-primary flex items-center gap-1.5 text-footnote">
                <Plus className="w-3.5 h-3.5" /> Task nou
              </button>
            </div>
          </div>

          {/* Kanban board */}
          <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: '60vh' }}>
            {columns.map(col => {
              const colTasks = visibleTasks.filter(t => t.column_id === col.id);
              const isDragTarget = dragOver === col.id;
              return (
                <div key={col.id}
                  className={`shrink-0 w-64 rounded-ios-lg p-3 transition-all ${isDragTarget ? 'bg-blue-50 ring-2 ring-ios-blue' : 'bg-ios-bg'}`}
                  onDragOver={e => { e.preventDefault(); setDragOver(col.id); }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={e => handleDrop(e, col.id)}>
                  <ColumnHeader col={col} count={colTasks.length}
                    onEdit={() => { setEditColModal(col); setEditColName(col.name); }}
                    onArchive={() => archiveColumn(col)}
                    onAddTask={() => openNewTask(col.id)} />
                  <div className="space-y-2">
                    {colTasks.map(task => (
                      <TaskCard key={task.id} task={task} members={members}
                        onOpen={t => setTaskModal(t)}
                        onDragStart={() => {}} onDragEnd={() => setDragOver(null)} />
                    ))}
                    {colTasks.length === 0 && (
                      <div className={`h-16 rounded-ios border-2 border-dashed flex items-center justify-center ${isDragTarget ? 'border-ios-blue' : 'border-ios-separator'}`}>
                        <p className="text-caption1 text-ios-tertiary">Trage taskuri aici</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Add column button */}
            <button onClick={() => setNewColModal(true)}
              className="shrink-0 w-64 h-16 rounded-ios-lg border-2 border-dashed border-ios-separator flex items-center justify-center gap-2 text-ios-tertiary hover:border-ios-blue hover:text-ios-blue transition-colors">
              <Plus className="w-4 h-4" />
              <span className="text-footnote font-medium">Coloană nouă</span>
            </button>
          </div>
        </>
      )}

      {/* Task detail modal */}
      {taskModal && (
        <TaskDetail
          task={taskModal}
          members={members}
          columns={columns}
          projects={projects}
          currentUser={currentUser}
          onClose={() => setTaskModal(null)}
          onSave={() => { setTaskModal(null); loadBoard(selectedProject.id); }}
          onDelete={() => deleteTask(taskModal.id)}
        />
      )}

      {/* New column modal */}
      {newColModal && (
        <Modal title="Coloană nouă" onClose={() => setNewColModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="input-label">Nume coloană *</label>
              <input className="input" placeholder="ex: În revizuire" value={newColName}
                onChange={e => setNewColName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addColumn()} autoFocus />
            </div>
            <div>
              <label className="input-label">Culoare</label>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map(c => (
                  <button key={c} onClick={() => setNewColColor(c)} style={{ background: c }}
                    className={`w-7 h-7 rounded-full transition-all ${newColColor === c ? 'ring-2 ring-offset-2 ring-ios-blue scale-110' : ''}`} />
                ))}
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button className="btn-secondary flex-1" onClick={() => setNewColModal(false)}>Anulează</button>
              <button className="btn-primary flex-1" onClick={addColumn} disabled={!newColName.trim()}>Adaugă</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Rename column modal */}
      {editColModal && (
        <Modal title="Redenumește coloana" onClose={() => setEditColModal(null)}>
          <div className="space-y-4">
            <div>
              <label className="input-label">Nume nou</label>
              <input className="input" value={editColName} onChange={e => setEditColName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && renameColumn()} autoFocus />
            </div>
            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => setEditColModal(null)}>Anulează</button>
              <button className="btn-primary flex-1" onClick={renameColumn} disabled={!editColName.trim()}>Salvează</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
