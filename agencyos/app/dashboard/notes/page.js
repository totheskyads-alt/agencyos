'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Modal from '@/components/Modal';
import { supabase } from '@/lib/supabase';
import { getProjectAccess } from '@/lib/projectAccess';
import { useRole } from '@/lib/useRole';
import {
  Bold,
  Check,
  ChevronDown,
  Italic,
  NotebookText,
  List,
  ListOrdered,
  Plus,
  Search,
  Tag,
  Trash2,
  Type,
  X,
} from 'lucide-react';

const NOTE_COLORS = ['#007AFF', '#34C759', '#FF9500', '#FF3B30', '#AF52DE', '#32ADE6', '#5856D6', '#FF2D55'];
const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
];

const emptyForm = {
  project_id: '',
  task_id: '',
  title: '',
  body: '',
  status: 'open',
  color: '#007AFF',
  tags: [],
  reminder_at: '',
  source: 'text',
};

function toDateTimeLocalValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fmtReminder(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function tagArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(Boolean);
}

function stripHtml(value) {
  return (value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function NoteTagPill({ tag, onRemove, color = '#007AFF' }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white text-ios-secondary border border-ios-separator/40 px-2 py-0.5 text-[10px] font-semibold shrink-0">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
      <span>{tag}</span>
      {onRemove && (
        <button
          type="button"
          onClick={() => onRemove(tag)}
          className="text-ios-tertiary hover:text-ios-primary transition-colors"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      )}
    </span>
  );
}

export default function NotesPage() {
  const params = useSearchParams();
  const { isAdmin } = useRole();
  const editorRef = useRef(null);
  const [notes, setNotes] = useState([]);
  const [projects, setProjects] = useState([]);
  const [labelLibrary, setLabelLibrary] = useState([]);
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState(params.get('project') || '');
  const [taskFilter, setTaskFilter] = useState(params.get('task') || '');
  const [statusFilter, setStatusFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [tagInput, setTagInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [profileId, setProfileId] = useState(null);
  const [projectSearch, setProjectSearch] = useState('');
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [fontSize, setFontSize] = useState('3');
  const [showLabelDrop, setShowLabelDrop] = useState(false);
  const [labelSearch, setLabelSearch] = useState('');
  const labelRef = useRef(null);

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !profileId) return;
    try {
      const stored = JSON.parse(window.localStorage.getItem(`sm_notes_labels:${profileId}`) || '[]');
      if (Array.isArray(stored)) {
        setLabelLibrary(stored.filter(Boolean));
      }
    } catch {}
  }, [profileId]);

  useEffect(() => {
    if (typeof window === 'undefined' || !profileId) return;
    window.localStorage.setItem(`sm_notes_labels:${profileId}`, JSON.stringify(labelLibrary));
  }, [labelLibrary, profileId]);

  useEffect(() => {
    if (!modalOpen || !editorRef.current) return;
    editorRef.current.innerHTML = form.body || '';
  }, [modalOpen, selected?.id]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (labelRef.current && !labelRef.current.contains(e.target)) {
        setShowLabelDrop(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function load() {
    const accessInfo = await getProjectAccess({ forceRefresh: true });
    const user = accessInfo.user;
    setProfileId(user?.id || null);

    let projectQuery = supabase
      .from('projects')
      .select('id,name,color,client_id,clients(name)')
      .eq('status', 'active')
      .order('name');

    let noteQuery = supabase
      .from('notes')
      .select('*, projects(id,name,color,clients(name)), tasks(id,title)')
      .eq('created_by', user.id)
      .order('updated_at', { ascending: false });

    if (accessInfo.isRestricted) {
      if (!accessInfo.projectIds?.length) {
        setProjects([]);
        setNotes([]);
        return;
      }
      projectQuery = projectQuery.in('id', accessInfo.projectIds);
    }

    const [{ data: projectData }, { data: noteData }] = await Promise.all([projectQuery, noteQuery]);
    setProjects(projectData || []);
    setNotes(noteData || []);
    setLabelLibrary(prev => {
      const merged = new Set(prev);
      (noteData || []).forEach(note => {
        tagArray(note.tags).forEach(tag => {
          if (tag) merged.add(tag);
        });
      });
      return Array.from(merged).sort((a, b) => a.localeCompare(b));
    });
    const noteId = params.get('note');
    const shouldOpen = params.get('newNote') === '1';
    if (noteId && noteData?.length) {
      const match = noteData.find(note => note.id === noteId);
      if (match) openEdit(match);
    } else if (shouldOpen) {
      openAdd(params.get('project') || '', params.get('task') || '');
    }
  }

  function openAdd(prefillProject = '', prefillTask = '') {
    setSelected(null);
    setForm({
      ...emptyForm,
      project_id: prefillProject || '',
      task_id: prefillTask || '',
    });
    setTagInput('');
    setProjectSearch('');
    setProjectPickerOpen(!prefillProject);
    setModalOpen(true);
  }

  function openEdit(note) {
    setSelected(note);
    setForm({
      project_id: note.project_id || '',
      task_id: note.task_id || '',
      title: note.title || '',
      body: note.body || '',
      status: note.status || 'open',
      color: note.color || '#007AFF',
      tags: tagArray(note.tags),
      reminder_at: toDateTimeLocalValue(note.reminder_at),
      source: 'text',
    });
    setTagInput('');
    setProjectSearch('');
    setProjectPickerOpen(false);
    setModalOpen(true);
  }

  function addTag(raw) {
    const next = raw.trim().replace(/^#/, '');
    if (!next) return;
    setLabelLibrary(prev => prev.includes(next) ? prev : [...prev, next].sort((a, b) => a.localeCompare(b)));
    setForm(prev => prev.tags.includes(next) ? prev : { ...prev, tags: [...prev.tags, next] });
    setTagInput('');
  }

  function removeTag(tag) {
    setForm(prev => ({ ...prev, tags: prev.tags.filter(item => item !== tag) }));
  }

  function deleteLabel(label) {
    setLabelLibrary(prev => prev.filter(item => item !== label));
    setForm(prev => ({ ...prev, tags: prev.tags.filter(item => item !== label) }));
  }

  function toggleLabel(label) {
    setLabelLibrary(prev => prev.includes(label) ? prev : [...prev, label].sort((a, b) => a.localeCompare(b)));
    setForm(prev => prev.tags.includes(label)
      ? { ...prev, tags: prev.tags.filter(item => item !== label) }
      : { ...prev, tags: [...prev.tags, label] }
    );
  }

  function syncEditorBody() {
    if (!editorRef.current) return;
    setForm(prev => ({ ...prev, body: editorRef.current.innerHTML }));
  }

  function ensureEditorFocus() {
    if (!editorRef.current) return false;
    editorRef.current.focus();

    if (!editorRef.current.innerHTML.trim()) {
      editorRef.current.innerHTML = '<div><br></div>';
    }

    const selection = window.getSelection();
    if (!selection) return true;
    if (selection.rangeCount === 0 || !editorRef.current.contains(selection.anchorNode)) {
      const range = document.createRange();
      range.selectNodeContents(editorRef.current);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    return true;
  }

  function runEditorCommand(command, value = null) {
    if (!ensureEditorFocus()) return;
    document.execCommand(command, false, value);
    syncEditorBody();
  }

  async function saveNote() {
    if (!form.project_id || !form.title.trim() || !profileId) return;
    setLoading(true);

    const noteHtml = editorRef.current ? editorRef.current.innerHTML : form.body;
    const cleanBody = stripHtml(noteHtml);

    const payload = {
      project_id: form.project_id,
      task_id: form.task_id || null,
      title: form.title.trim(),
      body: cleanBody ? noteHtml : null,
      status: form.status,
      color: form.color,
      tags: form.tags,
      reminder_at: form.reminder_at ? new Date(form.reminder_at).toISOString() : null,
      source: 'text',
      updated_at: new Date().toISOString(),
    };

    if (selected?.id) {
      const { error } = await supabase.from('notes').update({
        ...payload,
        resolved_at: form.status === 'resolved' ? new Date().toISOString() : null,
        resolved_by: form.status === 'resolved' ? profileId : null,
      }).eq('id', selected.id);
      if (error) {
        setLoading(false);
        alert(`Note could not be saved: ${error.message}`);
        return;
      }
    } else {
      const { error } = await supabase.from('notes').insert({
        ...payload,
        created_by: profileId,
        resolved_at: form.status === 'resolved' ? new Date().toISOString() : null,
        resolved_by: form.status === 'resolved' ? profileId : null,
      });
      if (error) {
        setLoading(false);
        alert(`Note could not be saved: ${error.message}`);
        return;
      }
    }

    setLoading(false);
    setModalOpen(false);
    load();
  }

  async function toggleResolved(note) {
    const nextStatus = note.status === 'resolved' ? 'open' : 'resolved';
    await supabase.from('notes').update({
      status: nextStatus,
      resolved_at: nextStatus === 'resolved' ? new Date().toISOString() : null,
      resolved_by: nextStatus === 'resolved' ? profileId : null,
      updated_at: new Date().toISOString(),
    }).eq('id', note.id);
    load();
  }

  async function deleteNote(noteId) {
    if (!confirm('Delete this note?')) return;
    await supabase.from('notes').delete().eq('id', noteId);
    if (selected?.id === noteId) setModalOpen(false);
    load();
  }

  const filteredNotes = useMemo(() => notes.filter(note => {
    if (projectFilter && note.project_id !== projectFilter) return false;
    if (taskFilter && note.task_id !== taskFilter) return false;
    if (statusFilter !== 'all' && note.status !== statusFilter) return false;
    const haystack = `${note.title || ''} ${stripHtml(note.body || '')} ${(note.projects?.name || '')} ${(note.tasks?.title || '')} ${(note.tags || []).join(' ')}`.toLowerCase();
    if (search && !haystack.includes(search.toLowerCase())) return false;
    return true;
  }), [notes, projectFilter, taskFilter, statusFilter, search]);

  const selectedFormProject = projects.find(project => project.id === form.project_id);
  const filteredProjectChoices = useMemo(() => {
    const needle = projectSearch.trim().toLowerCase();
    if (!needle) return projects;
    return projects.filter(project =>
      project.name.toLowerCase().includes(needle) ||
      (project.clients?.name || '').toLowerCase().includes(needle)
    );
  }, [projects, projectSearch]);
  const labelOptions = useMemo(() => {
    const unique = new Set();
    labelLibrary.forEach(label => {
      if (label) unique.add(label);
    });
    notes.forEach(note => {
      tagArray(note.tags).forEach(tag => {
        if (tag) unique.add(tag);
      });
    });
    form.tags.forEach(tag => {
      if (tag) unique.add(tag);
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [labelLibrary, notes, form.tags]);
  const filteredLabelOptions = useMemo(() => {
    const needle = labelSearch.trim().toLowerCase();
    if (!needle) return labelOptions;
    return labelOptions.filter(label => label.toLowerCase().includes(needle));
  }, [labelOptions, labelSearch]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-title2 font-bold text-ios-primary">Notes</h1>
          <p className="text-subhead text-ios-secondary">
            Smart project notes, reminders, and quick follow-up.
          </p>
        </div>
        <button onClick={() => openAdd(projectFilter, taskFilter)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" strokeWidth={2.5} /> New Note
        </button>
      </div>

      <div className="card-section p-3 space-y-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-tertiary" />
            <input className="input pl-10" placeholder="Search notes, labels, projects..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {STATUS_OPTIONS.map(option => (
            <button
              key={option.value}
              onClick={() => setStatusFilter(option.value)}
              className={`px-3 py-1.5 rounded-ios text-footnote font-semibold transition-all ${
                statusFilter === option.value ? 'bg-ios-blue text-white shadow-ios-sm' : 'bg-ios-fill text-ios-secondary'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        {filteredNotes.length === 0 ? (
          <div className="p-10 text-center">
            <NotebookText className="w-8 h-8 text-ios-label4 mx-auto mb-3" />
            <p className="text-headline font-semibold text-ios-secondary">No notes yet</p>
            <p className="text-footnote text-ios-tertiary mt-1">Start with one smart note for a project, then add a reminder if needed.</p>
          </div>
        ) : filteredNotes.map(note => (
          <div key={note.id} className="list-row gap-3 cursor-pointer hover:bg-ios-bg transition-colors" onClick={() => openEdit(note)}>
            <div className="w-1.5 self-stretch rounded-full shrink-0" style={{ background: note.color || '#007AFF' }} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className={`text-subhead font-semibold ${note.status === 'resolved' ? 'line-through text-ios-tertiary' : 'text-ios-primary'}`}>{note.title}</p>
                <span className={`badge ${note.status === 'resolved' ? 'badge-green' : 'badge-gray'}`}>
                  {note.status === 'resolved' ? 'Resolved' : 'Open'}
                </span>
              </div>
              {note.body && <p className="text-footnote text-ios-secondary mt-1 line-clamp-2">{stripHtml(note.body)}</p>}
              <div className="flex items-center gap-2 flex-wrap mt-2">
                {note.projects?.name && <span className="badge badge-blue">{note.projects.name}</span>}
                {note.projects?.clients?.name && <span className="badge badge-gray">{note.projects.clients.name}</span>}
                {note.tasks?.title && <span className="badge badge-orange">{note.tasks.title}</span>}
                {note.reminder_at && <span className="badge badge-red">Reminder {fmtReminder(note.reminder_at)}</span>}
                {tagArray(note.tags).slice(0, 3).map(tag => <NoteTagPill key={tag} tag={tag} color={note.color || '#007AFF'} />)}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
              <button
                onClick={() => toggleResolved(note)}
                className={`px-2.5 py-1.5 rounded-ios text-caption1 font-semibold ${note.status === 'resolved' ? 'bg-ios-fill text-ios-secondary' : 'bg-green-50 text-ios-green'}`}
              >
                {note.status === 'resolved' ? 'Reopen' : 'Resolve'}
              </button>
              {isAdmin && (
                <button onClick={() => deleteNote(note.id)} className="p-2 rounded-ios hover:bg-red-50 text-ios-tertiary hover:text-ios-red">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {modalOpen && (
        <Modal key={selected?.id || 'new-note'} title={selected ? 'Edit Note' : 'New Note'} onClose={() => setModalOpen(false)} size="xl">
          <div className="space-y-3">
            <div>
              <label className="input-label">Project *</label>
              {!projectPickerOpen && form.project_id ? (
                <div className="rounded-ios bg-ios-fill px-3.5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex items-center gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ background: selectedFormProject?.color || '#007AFF' }}
                      />
                      <div className="min-w-0">
                        <p className="text-body font-semibold text-ios-primary truncate">
                          {selectedFormProject?.name || 'Selected project'}
                        </p>
                        {selectedFormProject?.clients?.name && (
                          <p className="text-caption1 text-ios-secondary truncate">
                            {selectedFormProject.clients.name}
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setProjectSearch('');
                        setProjectPickerOpen(true);
                      }}
                      className="text-footnote font-semibold text-ios-blue hover:opacity-80 shrink-0"
                    >
                      Change
                    </button>
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-tertiary" />
                  <input
                    className="input pl-10"
                    placeholder="Search project..."
                    value={projectSearch}
                    onChange={e => {
                      setProjectSearch(e.target.value);
                      if (form.project_id) {
                        setForm(prev => ({ ...prev, project_id: '', task_id: prev.task_id || '' }));
                      }
                      if (!projectPickerOpen) setProjectPickerOpen(true);
                    }}
                    onFocus={() => setProjectPickerOpen(true)}
                  />
                  {projectPickerOpen && (
                    <div className="absolute z-30 w-full bg-white rounded-ios shadow-ios-modal border border-ios-separator/30 max-h-56 overflow-y-auto mt-1">
                      {filteredProjectChoices.map(project => (
                        <button
                          key={project.id}
                          type="button"
                          onClick={() => {
                            setForm(prev => ({ ...prev, project_id: project.id }));
                            setProjectSearch('');
                            setProjectPickerOpen(false);
                          }}
                          className="flex items-center w-full px-3 py-2.5 hover:bg-ios-fill text-left gap-2"
                        >
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: project.color || '#007AFF' }} />
                          <div className="min-w-0">
                            <p className="text-subhead font-medium text-ios-primary truncate">{project.name}</p>
                            {project.clients?.name && (
                              <p className="text-caption1 text-ios-secondary truncate">{project.clients.name}</p>
                            )}
                          </div>
                        </button>
                      ))}
                      {filteredProjectChoices.length === 0 && (
                        <p className="px-3 py-2 text-footnote text-ios-tertiary">No projects found</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3 items-start">
              <div>
                <label className="input-label">Title *</label>
                <input
                  className="input"
                  value={form.title}
                  onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="What should we remember here?"
                />
              </div>
              {form.task_id && (
                <div className="pt-6">
                  <span className="badge badge-orange">Linked to task</span>
                </div>
              )}
            </div>

            <div>
              <label className="input-label">Notes</label>
              <div className="rounded-ios border border-ios-separator/40 bg-white overflow-hidden">
                <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b border-ios-separator/30 bg-ios-fill/50">
                  <button type="button" onMouseDown={e => { e.preventDefault(); runEditorCommand('bold'); }} className="p-1.5 rounded-ios hover:bg-white text-ios-secondary hover:text-ios-primary">
                    <Bold className="w-4 h-4" />
                  </button>
                  <button type="button" onMouseDown={e => { e.preventDefault(); runEditorCommand('italic'); }} className="p-1.5 rounded-ios hover:bg-white text-ios-secondary hover:text-ios-primary">
                    <Italic className="w-4 h-4" />
                  </button>
                  <button type="button" onMouseDown={e => { e.preventDefault(); runEditorCommand('insertUnorderedList'); }} className="p-1.5 rounded-ios hover:bg-white text-ios-secondary hover:text-ios-primary">
                    <List className="w-4 h-4" />
                  </button>
                  <button type="button" onMouseDown={e => { e.preventDefault(); runEditorCommand('insertOrderedList'); }} className="p-1.5 rounded-ios hover:bg-white text-ios-secondary hover:text-ios-primary">
                    <ListOrdered className="w-4 h-4" />
                  </button>
                  <div className="h-5 w-px bg-ios-separator/50" />
                  <div className="flex items-center gap-1 rounded-ios bg-white px-2 py-1 border border-ios-separator/30">
                    <Type className="w-3.5 h-3.5 text-ios-tertiary" />
                    <select
                      className="bg-transparent text-footnote text-ios-primary focus:outline-none"
                      value={fontSize}
                      onChange={e => {
                        setFontSize(e.target.value);
                        runEditorCommand('fontSize', e.target.value);
                      }}
                    >
                      <option value="2">S</option>
                      <option value="3">M</option>
                      <option value="5">L</option>
                    </select>
                  </div>
                </div>
                <div
                  ref={editorRef}
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={syncEditorBody}
                  className="min-h-[120px] px-4 py-3 text-body text-ios-primary bg-ios-fill outline-none [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2 [&_li]:my-1"
                  data-placeholder="Write notes, links, action points, mini checklists..."
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="input-label">Quick tools</label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div ref={labelRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setShowLabelDrop(prev => !prev)}
                    className="h-10 w-full rounded-ios bg-ios-fill border border-transparent px-2.5 flex items-center justify-between gap-2 text-left text-footnote text-ios-primary"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <Tag className="w-3.5 h-3.5 text-ios-tertiary shrink-0" />
                      <span className="truncate font-semibold">
                        {form.tags.length > 0
                          ? `${form.tags[0]}${form.tags.length > 1 ? ` +${form.tags.length - 1}` : ''}`
                          : 'Label'}
                      </span>
                    </span>
                    <ChevronDown className="w-4 h-4 text-ios-tertiary shrink-0" />
                  </button>
                  {showLabelDrop && (
                    <div className="absolute top-full left-0 mt-1 bg-white rounded-ios-lg shadow-ios-modal border border-ios-separator/30 z-50 w-64 max-h-56 overflow-y-auto">
                      <div className="p-2 border-b border-ios-separator/30">
                        <input
                          className="input py-1.5 text-footnote"
                          placeholder="Search label..."
                          value={labelSearch}
                          onChange={e => setLabelSearch(e.target.value)}
                          autoFocus
                        />
                      </div>
                      {filteredLabelOptions.map(label => (
                        <div
                          key={label}
                          className="flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-ios-fill"
                        >
                          <button
                            type="button"
                            onClick={() => toggleLabel(label)}
                            className="flex items-center justify-between gap-2 min-w-0 flex-1 text-left"
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <span className="w-3 h-3 rounded-full shrink-0" style={{ background: form.color || '#007AFF' }} />
                              <span className="text-subhead text-ios-primary truncate">{label}</span>
                            </span>
                            {form.tags.includes(label) && <Check className="w-4 h-4 text-ios-blue shrink-0" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteLabel(label)}
                            className="p-1 rounded-md text-ios-tertiary hover:text-ios-red hover:bg-red-50 shrink-0"
                            title={`Delete label ${label}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      {labelSearch.trim() && !labelOptions.some(label => label.toLowerCase() === labelSearch.trim().toLowerCase()) && (
                        <button
                          type="button"
                          onClick={() => {
                            addTag(labelSearch);
                            setLabelSearch('');
                            setShowLabelDrop(false);
                          }}
                          className="flex items-center gap-2 w-full px-3 py-2.5 text-left text-footnote font-semibold text-ios-blue hover:bg-blue-50"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Create label "{labelSearch.trim()}"
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="h-10 rounded-ios bg-ios-fill border border-transparent px-2.5 flex items-center gap-2">
                  <span className="text-footnote shrink-0">🎨</span>
                  <div className="flex items-center justify-center gap-2 min-w-0 flex-1 flex-nowrap">
                    {NOTE_COLORS.map(color => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setForm(prev => ({ ...prev, color }))}
                        className={`w-7 h-7 rounded-full shrink-0 border-2 transition-all ${form.color === color ? 'border-white shadow-ios-sm ring-2 ring-ios-blue/20' : 'border-transparent hover:scale-105'}`}
                        style={{ background: color }}
                        aria-label={`Pick color ${color}`}
                      />
                    ))}
                  </div>
                </div>

                <label className="h-10 rounded-ios bg-ios-fill border border-transparent px-2.5 flex items-center gap-1.5 overflow-hidden">
                  <span className="text-footnote shrink-0">⏰</span>
                  <input
                    className="flex-1 min-w-0 bg-transparent text-footnote text-ios-primary focus:outline-none"
                    type="datetime-local"
                    value={form.reminder_at}
                    onChange={e => setForm(prev => ({ ...prev, reminder_at: e.target.value }))}
                  />
                </label>
              </div>
            </div>

            {form.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {form.tags.map(tag => (
                  <NoteTagPill key={tag} tag={tag} onRemove={removeTag} color={form.color || '#007AFF'} />
                ))}
              </div>
            )}

            {selected && (
              <div>
                <label className="input-label">Status</label>
                <div className="flex gap-2">
                  {[['open', 'Open'], ['resolved', 'Resolved']].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, status: value }))}
                      className={`flex-1 py-2 rounded-ios text-footnote font-semibold ${form.status === value ? 'bg-ios-blue text-white' : 'bg-ios-fill text-ios-secondary'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              {selected && (
                <button onClick={() => deleteNote(selected.id)} className="btn-danger flex items-center gap-1.5">
                  <Trash2 className="w-4 h-4" /> Delete
                </button>
              )}
              <button className="btn-secondary flex-1" onClick={() => setModalOpen(false)}>Cancel</button>
              <button className="btn-primary flex-1" onClick={saveNote} disabled={loading || !form.project_id || !form.title.trim()}>
                {loading ? 'Saving...' : 'Save Note'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
