'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/Modal';
import { TASK_PRIORITY, fmtDate } from '@/lib/utils';
import {
  Plus, Search, ChevronDown, ChevronRight, ArrowLeft,
  MessageSquare, Paperclip, Trash2, Send, Archive,
  LayoutList, Kanban, MoreHorizontal, Edit2, X, Check,
  Circle, CheckCircle2, Clock, AlertCircle
} from 'lucide-react';

const DEFAULT_COLUMNS = [
  { name: 'This Week', color: '#007AFF' },
  { name: 'Later',     color: '#AEAEB2' },
  { name: 'Taskuri Săptămânale', color: '#FF9500' },
  { name: 'Rapoarte',  color: '#34C759' },
];

const PRIORITY_CONFIG = {
  low:    { label: 'Scăzut',  color: 'badge-gray',   dot: '#AEAEB2' },
  medium: { label: 'Mediu',   color: 'badge-orange', dot: '#FF9500' },
  high:   { label: 'Ridicat', color: 'badge-red',    dot: '#FF3B30' },
  urgent: { label: 'Urgent',  color: 'badge-red',    dot: '#FF3B30' },
};

const COLORS = ['#007AFF','#34C759','#FF9500','#FF3B30','#AF52DE','#32ADE6','#5856D6','#FF2D55'];

// ─── Task Detail Modal ────────────────────────────────────────────────────────
function TaskDetail({ task, members, columns, allColumns, onClose, onSave, onDelete, currentUser }) {
  const isNew = !task?.id;
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
  const [tab, setTab] = useState('details');
  const fileRef = useRef(null);

  useEffect(() => { if (task?.id) { loadComments(); loadFiles(); } }, [task?.id]);

  async function loadComments() {
    const { data } = await supabase.from('task_comments')
      .select('*, profiles(full_name,email)').eq('task_id', task.id).order('created_at');
    setComments(data || []);
  }
  async function loadFiles() {
    const { data } = await supabase.from('task_files')
      .select('*, profiles(full_name)').eq('task_id', task.id).order('created_at', { ascending: false });
    setFiles(data || []);
  }

  async function save() {
    setLoading(true);
    const payload = { ...form, assigned_to: form.assigned_to || null, due_date: form.due_date || null, column_id: form.column_id || null, project_id: form.project_id || null };
    if (task?.id) await supabase.from('tasks').update(payload).eq('id', task.id);
    else await supabase.from('tasks').insert({ ...payload, status: 'todo' });
    setLoading(false); onSave();
  }

  async function addComment() {
    if (!newComment.trim() || !task?.id) return;
    await supabase.from('task_comments').insert({ task_id: task.id, user_id: currentUser?.id, content: newComment.trim() });
    setNewComment(''); loadComments();
  }

  async function deleteComment(id) {
    await supabase.from('task_comments').delete().eq('id', id); loadComments();
  }

  async function archiveTask() {
    if (!confirm('Arhivezi taskul?')) return;
    await supabase.from('tasks').update({ is_archived: true, archived_at: new Date().toISOString() }).eq('id', task.id);
    onSave();
  }

  const taskCols = allColumns.filter(c => !task?.project_id || c.project_id === form.project_id);

  return (
    <Modal title={isNew ? 'Task nou' : task.title} onClose={onClose} size="lg">
      {!isNew && (
        <div className="flex gap-0.5 bg-ios-fill p-1 rounded-ios mb-4 -mt-1">
          {[['details','Detalii'],['comments',`Comentarii${comments.length > 0 ? ` (${comments.length})` : ''}`],['files',`Fișiere${files.length > 0 ? ` (${files.length})` : ''}`]].map(([k,v]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`flex-1 py-1.5 rounded-ios-sm text-footnote font-semibold transition-all ${tab === k ? 'bg-white text-ios-primary shadow-ios-sm' : 'text-ios-secondary'}`}>{v}</button>
          ))}
        </div>
      )}

      {tab === 'details' && (
        <div className="space-y-4">
          <div><label className="input-label">Titlu *</label>
            <input className="input" value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Ce trebuie făcut?" autoFocus={isNew} />
          </div>
          <div><label className="input-label">Descriere</label>
            <textarea className="input" rows={3} value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Detalii..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="input-label">Responsabil</label>
              <select className="input" value={form.assigned_to} onChange={e => setForm({...form, assigned_to: e.target.value})}>
                <option value="">— Nimeni —</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
              </select>
            </div>
            <div><label className="input-label">Prioritate</label>
              <select className="input" value={form.priority} onChange={e => setForm({...form, priority: e.target.value})}>
                {Object.entries(PRIORITY_CONFIG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div><label className="input-label">Coloană</label>
              <select className="input" value={form.column_id} onChange={e => setForm({...form, column_id: e.target.value})}>
                <option value="">— Selectează —</option>
                {taskCols.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div><label className="input-label">Data limită</label>
              <input className="input" type="date" value={form.due_date} onChange={e => setForm({...form, due_date: e.target.value})} />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            {task?.id && <>
              <button onClick={archiveTask} className="btn-secondary flex items-center gap-1.5 text-footnote"><Archive className="w-3.5 h-3.5" />Arhivează</button>
              <button onClick={onDelete} className="btn-danger flex items-center gap-1.5 text-footnote"><Trash2 className="w-3.5 h-3.5" />Șterge</button>
            </>}
            <button className="btn-secondary flex-1" onClick={onClose}>Anulează</button>
            <button className="btn-primary flex-1" onClick={save} disabled={loading || !form.title}>
              {loading ? 'Se salvează...' : 'Salvează'}
            </button>
          </div>
        </div>
      )}

      {tab === 'comments' && (
        <div className="space-y-4">
          {comments.length === 0
            ? <div className="text-center py-8 text-ios-tertiary text-subhead">Niciun comentariu</div>
            : <div className="space-y-3">
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
                            <button onClick={() => deleteComment(c.id)} className="text-ios-tertiary hover:text-ios-red"><X className="w-3 h-3" /></button>
                          )}
                        </div>
                      </div>
                      <p className="text-subhead whitespace-pre-wrap">{c.content}</p>
                    </div>
                  </div>
                ))}
              </div>
          }
          <div className="flex gap-2 pt-2 border-t border-ios-separator/30">
            <input className="input flex-1" placeholder="Adaugă comentariu... (Enter pentru trimite)" value={newComment}
              onChange={e => setNewComment(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addComment(); }}} />
            <button onClick={addComment} disabled={!newComment.trim()} className="btn-primary px-3"><Send className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {tab === 'files' && (
        <div className="space-y-4">
          <div className="bg-blue-50 rounded-ios p-3">
            <p className="text-footnote text-ios-blue">
              Pentru fișiere, activează <strong>Storage</strong> în Supabase → Storage → New bucket → numel: <code>task-files</code> → Public
            </p>
          </div>
          {files.length === 0
            ? <div className="text-center py-6 text-ios-tertiary text-subhead">Niciun fișier</div>
            : files.map(f => (
                <div key={f.id} className="flex items-center gap-3 p-3 bg-ios-bg rounded-ios">
                  <Paperclip className="w-4 h-4 text-ios-secondary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <a href={f.file_url} target="_blank" rel="noopener noreferrer"
                      className="text-footnote font-semibold text-ios-blue hover:underline truncate block">{f.file_name}</a>
                    <p className="text-caption2 text-ios-tertiary">{f.profiles?.full_name}</p>
                  </div>
                  <button onClick={async () => { await supabase.from('task_files').delete().eq('id', f.id); loadFiles(); }}
                    className="text-ios-tertiary hover:text-ios-red"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))
          }
        </div>
      )}
    </Modal>
  );
}

// ─── Column Header (board) ────────────────────────────────────────────────────
function ColHeader({ col, count, onEdit, onArchive, onAdd }) {
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
        <span className="text-caption2 text-ios-tertiary bg-ios-fill px-1.5 py-0.5 rounded-full font-semibold">{count}</span>
      </div>
      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
        <button onClick={() => onAdd(col.id)} className="p-1 rounded hover:bg-ios-fill text-ios-tertiary hover:text-ios-blue transition-colors"><Plus className="w-3.5 h-3.5" /></button>
        <div className="relative">
          <button onClick={() => setOpen(!open)} className="p-1 rounded hover:bg-ios-fill text-ios-tertiary"><MoreHorizontal className="w-3.5 h-3.5" /></button>
          {open && (
            <div className="absolute right-0 top-full mt-1 bg-white rounded-ios shadow-ios-modal border border-ios-separator/30 py-1 z-30 w-36">
              <button onClick={() => { onEdit(); setOpen(false); }} className="flex items-center gap-2 w-full px-3 py-2 text-footnote hover:bg-ios-fill"><Edit2 className="w-3.5 h-3.5" />Redenumește</button>
              <button onClick={() => { onArchive(); setOpen(false); }} className="flex items-center gap-2 w-full px-3 py-2 text-footnote text-ios-red hover:bg-red-50"><Archive className="w-3.5 h-3.5" />Arhivează</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TasksPage() {
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'board'
  const [boardProject, setBoardProject] = useState(null);

  const [projects, setProjects] = useState([]);
  const [allColumns, setAllColumns] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [filterClient, setFilterClient] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [myOnly, setMyOnly] = useState(false);

  // Board state
  const [boardColumns, setBoardColumns] = useState([]);
  const [dragOver, setDragOver] = useState(null);
  const [newColModal, setNewColModal] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColColor, setNewColColor] = useState('#007AFF');
  const [editColModal, setEditColModal] = useState(null);
  const [editColName, setEditColName] = useState('');

  // Task modal
  const [taskModal, setTaskModal] = useState(null);

  // List collapsed projects
  const [collapsed, setCollapsed] = useState({});

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUser(user));
    loadAll();
  }, []);

  async function loadAll() {
    const [{ data: proj }, { data: mem }, { data: cols }] = await Promise.all([
      supabase.from('projects').select('*, clients(id, name)').eq('status', 'active').order('name'),
      supabase.from('profiles').select('id, full_name, email').order('full_name'),
      supabase.from('task_columns').select('*').eq('is_archived', false).order('position'),
    ]);
    setProjects(proj || []);
    setMembers(mem || []);
    setAllColumns(cols || []);
    await loadTasks();
  }

  async function loadTasks() {
    const { data } = await supabase.from('tasks')
      .select('*, profiles(full_name,email), projects(id,name,color,clients(name))')
      .eq('is_archived', false).order('position');

    const taskIds = (data || []).map(t => t.id);
    let cc = {}, fc = {};
    if (taskIds.length > 0) {
      const [{ data: comments }, { data: files }] = await Promise.all([
        supabase.from('task_comments').select('task_id').in('task_id', taskIds),
        supabase.from('task_files').select('task_id').in('task_id', taskIds),
      ]);
      (comments || []).forEach(c => cc[c.task_id] = (cc[c.task_id] || 0) + 1);
      (files || []).forEach(f => fc[f.task_id] = (fc[f.task_id] || 0) + 1);
    }
    setTasks((data || []).map(t => ({ ...t, comment_count: cc[t.id] || 0, file_count: fc[t.id] || 0 })));
  }

  async function openBoard(project) {
    setBoardProject(project);
    setViewMode('board');
    let { data: cols } = await supabase.from('task_columns').select('*').eq('project_id', project.id).eq('is_archived', false).order('position');
    if (!cols || cols.length === 0) {
      const toInsert = DEFAULT_COLUMNS.map((c, i) => ({ ...c, project_id: project.id, position: i }));
      const { data: created } = await supabase.from('task_columns').insert(toInsert).select();
      cols = created || [];
    }
    setBoardColumns(cols);
    setAllColumns(prev => {
      const without = prev.filter(c => c.project_id !== project.id);
      return [...without, ...(cols || [])];
    });
  }

  async function addColumn() {
    if (!newColName.trim() || !boardProject) return;
    const { data } = await supabase.from('task_columns').insert({
      project_id: boardProject.id, name: newColName.trim(), color: newColColor, position: boardColumns.length,
    }).select().single();
    if (data) { setBoardColumns(prev => [...prev, data]); setAllColumns(prev => [...prev, data]); }
    setNewColModal(false); setNewColName(''); setNewColColor('#007AFF');
  }

  async function renameColumn() {
    if (!editColName.trim() || !editColModal) return;
    await supabase.from('task_columns').update({ name: editColName }).eq('id', editColModal.id);
    setBoardColumns(prev => prev.map(c => c.id === editColModal.id ? { ...c, name: editColName } : c));
    setEditColModal(null);
  }

  async function archiveColumn(col) {
    if (!confirm(`Arhivezi coloana "${col.name}"?`)) return;
    await supabase.from('task_columns').update({ is_archived: true }).eq('id', col.id);
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

  async function deleteTask(taskId) {
    if (!confirm('Ștergi taskul definitiv?')) return;
    await supabase.from('tasks').delete().eq('id', taskId);
    setTaskModal(null); loadTasks();
  }

  async function toggleDone(task) {
    const newStatus = task.status === 'done' ? 'todo' : 'done';
    await supabase.from('tasks').update({ status: newStatus }).eq('id', task.id);
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
  }

  // ── Filtered tasks ─────────────────────────────────────────────────────────
  let filtered = tasks;
  if (search) filtered = filtered.filter(t => t.title?.toLowerCase().includes(search.toLowerCase()) || t.description?.toLowerCase().includes(search.toLowerCase()));
  if (filterProject) filtered = filtered.filter(t => t.project_id === filterProject);
  if (filterAssignee) filtered = filtered.filter(t => t.assigned_to === filterAssignee);
  if (filterPriority) filtered = filtered.filter(t => t.priority === filterPriority);
  if (myOnly) filtered = filtered.filter(t => t.assigned_to === currentUser?.id);

  const filteredClients = [...new Map(projects.filter(p => p.clients).map(p => [p.clients.id, p.clients])).values()];

  // Group tasks by project for list view
  const tasksByProject = {};
  filtered.forEach(t => {
    const pid = t.project_id || 'none';
    if (!tasksByProject[pid]) tasksByProject[pid] = { project: t.projects || null, tasks: [] };
    tasksByProject[pid].tasks.push(t);
  });

  // Board filtered tasks
  const boardTasks = viewMode === 'board' ? tasks.filter(t => t.project_id === boardProject?.id) : [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {viewMode === 'board' && (
            <button onClick={() => { setViewMode('list'); loadTasks(); }} className="p-2 rounded-ios hover:bg-ios-fill transition-colors">
              <ArrowLeft className="w-5 h-5 text-ios-secondary" />
            </button>
          )}
          <div>
            <h1 className="text-title2 font-bold text-ios-primary">
              {viewMode === 'board' ? boardProject?.name : 'Taskuri'}
            </h1>
            <p className="text-subhead text-ios-secondary">
              {viewMode === 'board' ? boardProject?.clients?.name : `${filtered.length} taskuri`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {viewMode === 'list' && (
            <>
              {/* View toggle */}
              <div className="flex bg-ios-fill rounded-ios p-0.5">
                <button onClick={() => setViewMode('list')} className={`p-2 rounded-ios-sm transition-all ${viewMode === 'list' ? 'bg-white shadow-ios-sm' : ''}`}>
                  <LayoutList className="w-4 h-4 text-ios-secondary" />
                </button>
              </div>
              <button onClick={() => setTaskModal({ project_id: filterProject || '' })} className="btn-primary flex items-center gap-2">
                <Plus className="w-4 h-4" strokeWidth={2.5} /> Task nou
              </button>
            </>
          )}
          {viewMode === 'board' && (
            <>
              <button onClick={() => setNewColModal(true)} className="btn-secondary flex items-center gap-1.5 text-footnote">
                <Plus className="w-3.5 h-3.5" /> Coloană
              </button>
              <button onClick={() => setTaskModal({ project_id: boardProject?.id, column_id: boardColumns[0]?.id })} className="btn-primary flex items-center gap-1.5 text-footnote">
                <Plus className="w-3.5 h-3.5" /> Task
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filters — list view */}
      {viewMode === 'list' && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-tertiary" />
            <input className="input pl-9 w-48 py-2 text-footnote" placeholder="Caută..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="input py-2 text-footnote w-36" value={filterProject} onChange={e => setFilterProject(e.target.value)}>
            <option value="">Toate proiectele</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className="input py-2 text-footnote w-36" value={filterAssignee} onChange={e => { setFilterAssignee(e.target.value); setMyOnly(false); }}>
            <option value="">Toată echipa</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
          </select>
          <select className="input py-2 text-footnote w-32" value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
            <option value="">Orice prioritate</option>
            {Object.entries(PRIORITY_CONFIG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button onClick={() => { setMyOnly(!myOnly); setFilterAssignee(''); }}
            className={`px-3 py-2 rounded-ios text-footnote font-semibold transition-all ${myOnly ? 'bg-ios-blue text-white' : 'bg-ios-fill text-ios-secondary'}`}>
            Ale mele
          </button>
          {(search || filterProject || filterAssignee || filterPriority || myOnly) && (
            <button onClick={() => { setSearch(''); setFilterProject(''); setFilterAssignee(''); setFilterPriority(''); setMyOnly(false); }}
              className="flex items-center gap-1 text-footnote text-ios-red hover:bg-red-50 px-2 py-2 rounded-ios transition-colors">
              <X className="w-3.5 h-3.5" /> Resetează
            </button>
          )}
        </div>
      )}

      {/* ── LIST VIEW ──────────────────────────────────────────────────────── */}
      {viewMode === 'list' && (
        <div className="card overflow-hidden">
          {Object.keys(tasksByProject).length === 0 ? (
            <div className="p-12 text-center">
              <CheckCircle2 className="w-8 h-8 text-ios-label4 mx-auto mb-3" />
              <p className="text-subhead text-ios-secondary mb-1">Niciun task</p>
              <p className="text-footnote text-ios-tertiary mb-4">Adaugă primul task sau schimbă filtrele</p>
              <button onClick={() => setTaskModal({ project_id: '' })} className="btn-primary">Task nou</button>
            </div>
          ) : (
            Object.entries(tasksByProject).map(([pid, { project, tasks: projTasks }]) => {
              const isCollapsed = collapsed[pid];
              const doneTasks = projTasks.filter(t => t.status === 'done').length;
              return (
                <div key={pid}>
                  {/* Project header */}
                  <div className="flex items-center justify-between px-4 py-3 bg-ios-bg border-b border-ios-separator/30 sticky top-0 z-10">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setCollapsed(prev => ({ ...prev, [pid]: !isCollapsed }))} className="text-ios-tertiary">
                        {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                      {project && <div className="w-3 h-3 rounded-full" style={{ background: project.color || '#007AFF' }} />}
                      <span className="text-subhead font-bold text-ios-primary">{project?.name || 'Fără proiect'}</span>
                      {project?.clients?.name && <span className="text-footnote text-ios-secondary">· {project.clients.name}</span>}
                      <span className="text-caption1 text-ios-tertiary bg-ios-fill px-1.5 py-0.5 rounded-full">{projTasks.length}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {project && (
                        <button onClick={() => openBoard(project)} className="text-footnote text-ios-blue hover:underline flex items-center gap-1">
                          <Kanban className="w-3.5 h-3.5" /> Board
                        </button>
                      )}
                      <button onClick={() => setTaskModal({ project_id: pid === 'none' ? '' : pid })}
                        className="p-1 rounded hover:bg-ios-fill text-ios-tertiary hover:text-ios-blue">
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Tasks */}
                  {!isCollapsed && projTasks.map(task => {
                    const pri = PRIORITY_CONFIG[task.priority];
                    const assignee = members.find(m => m.id === task.assigned_to);
                    const isDone = task.status === 'done';
                    const isOverdue = task.due_date && new Date(task.due_date) < new Date() && !isDone;
                    const col = allColumns.find(c => c.id === task.column_id);
                    return (
                      <div key={task.id}
                        className="flex items-center gap-3 px-4 py-3 border-b border-ios-separator/20 hover:bg-ios-bg/50 group cursor-pointer"
                        onClick={() => setTaskModal(task)}>
                        {/* Done toggle */}
                        <button onClick={e => { e.stopPropagation(); toggleDone(task); }}
                          className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${isDone ? 'border-ios-green bg-ios-green' : 'border-ios-separator hover:border-ios-blue'}`}>
                          {isDone && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                        </button>

                        {/* Priority dot */}
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: pri?.dot || '#AEAEB2' }} />

                        {/* Title */}
                        <p className={`flex-1 text-subhead ${isDone ? 'line-through text-ios-tertiary' : 'text-ios-primary'} truncate`}>
                          {task.title}
                        </p>

                        {/* Column badge */}
                        {col && (
                          <span className="text-caption2 font-semibold px-2 py-0.5 rounded-full shrink-0 hidden sm:inline"
                            style={{ background: col.color + '20', color: col.color }}>
                            {col.name}
                          </span>
                        )}

                        {/* Meta */}
                        <div className="flex items-center gap-3 shrink-0">
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
                          {task.due_date && (
                            <span className={`text-caption1 font-medium ${isOverdue ? 'text-ios-red' : 'text-ios-tertiary'}`}>
                              {new Date(task.due_date).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' })}
                            </span>
                          )}
                          {assignee && (
                            <div className="w-6 h-6 bg-ios-blue rounded-full flex items-center justify-center text-white text-caption2 font-bold"
                              title={assignee.full_name || assignee.email}>
                              {(assignee.full_name || assignee.email)[0].toUpperCase()}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── BOARD VIEW ─────────────────────────────────────────────────────── */}
      {viewMode === 'board' && (
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
                <ColHeader col={col} count={colTasks.length}
                  onEdit={() => { setEditColModal(col); setEditColName(col.name); }}
                  onArchive={() => archiveColumn(col)}
                  onAdd={colId => setTaskModal({ project_id: boardProject?.id, column_id: colId })} />
                <div className="space-y-2">
                  {colTasks.map(task => {
                    const pri = PRIORITY_CONFIG[task.priority];
                    const assignee = members.find(m => m.id === task.assigned_to);
                    const isOverdue = task.due_date && new Date(task.due_date) < new Date();
                    return (
                      <div key={task.id} draggable
                        onDragStart={e => { e.dataTransfer.setData('taskId', task.id); }}
                        onDragEnd={() => setDragOver(null)}
                        onClick={() => setTaskModal(task)}
                        className="bg-white rounded-ios border border-ios-separator/50 p-3 cursor-pointer hover:shadow-ios transition-all active:scale-98 select-none">
                        {/* Tag if urgent/high */}
                        {(task.priority === 'urgent' || task.priority === 'high') && (
                          <span className="inline-block text-caption2 font-semibold px-2 py-0.5 rounded-full mb-2"
                            style={{ background: pri.dot + '20', color: pri.dot }}>
                            {pri.label}
                          </span>
                        )}
                        <p className="text-footnote font-semibold text-ios-primary leading-snug mb-2">{task.title}</p>
                        {task.description && <p className="text-caption2 text-ios-secondary mb-2 line-clamp-2">{task.description}</p>}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-ios-tertiary">
                            {task.comment_count > 0 && <div className="flex items-center gap-0.5"><MessageSquare className="w-3 h-3" /><span className="text-caption2">{task.comment_count}</span></div>}
                            {task.file_count > 0 && <div className="flex items-center gap-0.5"><Paperclip className="w-3 h-3" /><span className="text-caption2">{task.file_count}</span></div>}
                          </div>
                          <div className="flex items-center gap-2">
                            {task.due_date && <span className={`text-caption2 font-medium ${isOverdue ? 'text-ios-red' : 'text-ios-tertiary'}`}>{new Date(task.due_date).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' })}</span>}
                            {assignee && <div className="w-5 h-5 bg-ios-blue rounded-full flex items-center justify-center text-white text-[9px] font-bold">{(assignee.full_name||assignee.email)[0].toUpperCase()}</div>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {colTasks.length === 0 && (
                    <div className={`h-16 rounded-ios border-2 border-dashed flex items-center justify-center ${isDragTarget ? 'border-ios-blue' : 'border-ios-separator'}`}>
                      <p className="text-caption1 text-ios-tertiary">Trage taskuri aici</p>
                    </div>
                  )}
                  <button onClick={() => setTaskModal({ project_id: boardProject?.id, column_id: col.id })}
                    className="w-full py-2 text-caption1 text-ios-tertiary hover:text-ios-blue border border-dashed border-ios-separator hover:border-ios-blue rounded-ios transition-colors flex items-center justify-center gap-1">
                    <Plus className="w-3 h-3" /> Adaugă
                  </button>
                </div>
              </div>
            );
          })}
          {/* Add column */}
          <button onClick={() => setNewColModal(true)}
            className="shrink-0 w-56 h-16 rounded-ios-lg border-2 border-dashed border-ios-separator flex items-center justify-center gap-2 text-ios-tertiary hover:border-ios-blue hover:text-ios-blue transition-colors">
            <Plus className="w-4 h-4" /><span className="text-footnote font-medium">Coloană nouă</span>
          </button>
        </div>
      )}

      {/* Task Modal */}
      {taskModal !== null && (
        <TaskDetail task={taskModal} members={members} columns={boardColumns} allColumns={allColumns}
          currentUser={currentUser} onClose={() => setTaskModal(null)}
          onSave={() => { setTaskModal(null); loadTasks(); }}
          onDelete={() => deleteTask(taskModal.id)} />
      )}

      {/* New column */}
      {newColModal && (
        <Modal title="Coloană nouă" onClose={() => setNewColModal(false)}>
          <div className="space-y-4">
            <div><label className="input-label">Nume *</label>
              <input className="input" placeholder="ex: Taskuri Săptămânale" value={newColName}
                onChange={e => setNewColName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addColumn()} autoFocus />
            </div>
            <div><label className="input-label">Culoare</label>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map(c => <button key={c} onClick={() => setNewColColor(c)} style={{ background: c }} className={`w-7 h-7 rounded-full transition-all ${newColColor === c ? 'ring-2 ring-offset-2 ring-ios-blue scale-110' : ''}`} />)}
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button className="btn-secondary flex-1" onClick={() => setNewColModal(false)}>Anulează</button>
              <button className="btn-primary flex-1" onClick={addColumn} disabled={!newColName.trim()}>Adaugă</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Rename column */}
      {editColModal && (
        <Modal title="Redenumește" onClose={() => setEditColModal(null)}>
          <div className="space-y-4">
            <div><label className="input-label">Nume nou</label>
              <input className="input" value={editColName} onChange={e => setEditColName(e.target.value)} onKeyDown={e => e.key === 'Enter' && renameColumn()} autoFocus />
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
