'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/Modal';
import { TASK_STATUS, TASK_PRIORITY } from '@/lib/utils';
import { Plus, ChevronDown } from 'lucide-react';

const STATUSES = ['todo','in_progress','review','done'];
const PRIORITIES = ['low','medium','high','urgent'];
const empty = { title: '', description: '', project_id: '', assigned_to: '', status: 'todo', priority: 'medium', due_date: '', task_type: 'general' };
const TASK_TYPES = ['general','campaign_setup','optimization','reporting','creative','strategy','meeting'];
const TASK_TYPE_LABELS = { general:'General', campaign_setup:'Setup campanie', optimization:'Optimizare', reporting:'Raportare', creative:'Creative', strategy:'Strategie', meeting:'Meeting' };

export default function TasksPage() {
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [members, setMembers] = useState([]);
  const [modal, setModal] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(empty);
  const [loading, setLoading] = useState(false);
  const [filterProject, setFilterProject] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    const [{ data: t }, { data: p }, { data: m }] = await Promise.all([
      supabase.from('tasks').select('*, projects(name,color), profiles(full_name,email)').order('created_at', { ascending: false }),
      supabase.from('projects').select('id, name, color').eq('status', 'active').order('name'),
      supabase.from('profiles').select('id, full_name, email').order('full_name'),
    ]);
    setTasks(t || []); setProjects(p || []); setMembers(m || []);
  }

  function openAdd(status = 'todo') { setForm({ ...empty, status }); setSelected(null); setModal(true); }
  function openEdit(t) {
    setForm({ title: t.title, description: t.description || '', project_id: t.project_id || '',
      assigned_to: t.assigned_to || '', status: t.status, priority: t.priority,
      due_date: t.due_date || '', task_type: t.task_type || 'general' });
    setSelected(t); setModal(true);
  }

  async function save() {
    setLoading(true);
    const payload = { ...form, project_id: form.project_id || null, assigned_to: form.assigned_to || null, due_date: form.due_date || null };
    if (selected) await supabase.from('tasks').update(payload).eq('id', selected.id);
    else await supabase.from('tasks').insert(payload);
    setModal(false); setLoading(false); load();
  }

  async function moveTask(id, status) {
    await supabase.from('tasks').update({ status }).eq('id', id);
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t));
  }

  async function del(id) {
    if (!confirm('Ștergi taskul?')) return;
    await supabase.from('tasks').delete().eq('id', id);
    setModal(false); load();
  }

  let filtered = tasks;
  if (filterProject) filtered = filtered.filter(t => t.project_id === filterProject);
  if (filterAssignee) filtered = filtered.filter(t => t.assigned_to === filterAssignee);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-title2 font-bold text-ios-primary">Taskuri</h1>
          <p className="text-subhead text-ios-secondary">{tasks.filter(t => t.status !== 'done').length} deschise</p>
        </div>
        <button onClick={() => openAdd()} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" strokeWidth={2.5} /> Task nou
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative">
          <select className="input appearance-none pr-8 py-2 text-footnote"
            value={filterProject} onChange={e => setFilterProject(e.target.value)}>
            <option value="">Toate proiectele</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ios-tertiary pointer-events-none" />
        </div>
        <div className="relative">
          <select className="input appearance-none pr-8 py-2 text-footnote"
            value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)}>
            <option value="">Toată echipa</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ios-tertiary pointer-events-none" />
        </div>
      </div>

      {/* Kanban */}
      <div className="grid lg:grid-cols-4 gap-3 overflow-x-auto">
        {STATUSES.map(status => {
          const col = filtered.filter(t => t.status === status);
          const { label, color } = TASK_STATUS[status];
          return (
            <div key={status} className="min-w-[260px]">
              <div className="flex items-center justify-between mb-2 px-1">
                <span className={`badge ${color}`}>{label}</span>
                <span className="text-caption1 text-ios-tertiary font-semibold">{col.length}</span>
              </div>
              <div className="space-y-2">
                {col.map(t => {
                  const pri = TASK_PRIORITY[t.priority];
                  const isOverdue = t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done';
                  return (
                    <div key={t.id} className="card p-3 cursor-pointer hover:shadow-ios-lg transition-all active:scale-98"
                      onClick={() => openEdit(t)}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="text-footnote font-semibold text-ios-primary flex-1 leading-snug">{t.title}</p>
                        <span className={`badge ${pri?.color} shrink-0`}>{pri?.label}</span>
                      </div>
                      {t.description && <p className="text-caption1 text-ios-secondary mb-2 line-clamp-2">{t.description}</p>}
                      {t.projects?.name && (
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <div className="w-1.5 h-1.5 rounded-full" style={{ background: t.projects.color }} />
                          <span className="text-caption1 text-ios-secondary">{t.projects.name}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        {t.profiles?.full_name && (
                          <div className="w-5 h-5 bg-ios-blue rounded-full flex items-center justify-center text-white text-caption2 font-bold">
                            {t.profiles.full_name[0]}
                          </div>
                        )}
                        {t.due_date && (
                          <span className={`text-caption1 font-medium ${isOverdue ? 'text-ios-red' : 'text-ios-secondary'}`}>
                            {new Date(t.due_date).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' })}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
                <button onClick={() => openAdd(status)}
                  className="w-full py-2.5 rounded-ios border border-dashed border-ios-separator text-ios-tertiary text-footnote hover:border-ios-blue hover:text-ios-blue transition-colors flex items-center justify-center gap-1">
                  <Plus className="w-3 h-3" /> Adaugă
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {modal && (
        <Modal title={selected ? 'Editează task' : 'Task nou'} onClose={() => setModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="input-label">Titlu *</label>
              <input className="input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <label className="input-label">Descriere</label>
              <textarea className="input" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="input-label">Proiect</label>
                <select className="input" value={form.project_id} onChange={e => setForm({ ...form, project_id: e.target.value })}>
                  <option value="">— Fără —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="input-label">Responsabil</label>
                <select className="input" value={form.assigned_to} onChange={e => setForm({ ...form, assigned_to: e.target.value })}>
                  <option value="">— Nimeni —</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
                </select>
              </div>
              <div>
                <label className="input-label">Status</label>
                <select className="input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                  {STATUSES.map(s => <option key={s} value={s}>{TASK_STATUS[s].label}</option>)}
                </select>
              </div>
              <div>
                <label className="input-label">Prioritate</label>
                <select className="input" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                  {PRIORITIES.map(p => <option key={p} value={p}>{TASK_PRIORITY[p].label}</option>)}
                </select>
              </div>
              <div>
                <label className="input-label">Tip task</label>
                <select className="input" value={form.task_type} onChange={e => setForm({ ...form, task_type: e.target.value })}>
                  {TASK_TYPES.map(t => <option key={t} value={t}>{TASK_TYPE_LABELS[t]}</option>)}
                </select>
              </div>
              <div>
                <label className="input-label">Data limită</label>
                <input className="input" type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              {selected && <button className="btn-danger" onClick={() => del(selected.id)}>Șterge</button>}
              <button className="btn-secondary flex-1" onClick={() => setModal(false)}>Anulează</button>
              <button className="btn-primary flex-1" onClick={save} disabled={loading || !form.title}>
                {loading ? 'Se salvează...' : 'Salvează'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
