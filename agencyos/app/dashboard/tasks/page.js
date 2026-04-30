'use client';
import { useMemo, useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/Modal';
import { embedCallMetadata, getCallField, stripCallMetadata } from '@/lib/callMetadata';
import { fmtDate, fmtClock } from '@/lib/utils';
import { useRole } from '@/lib/useRole';
import { useTimer } from '@/lib/timerContext';
import { getProjectAccess, grantProjectAccess } from '@/lib/projectAccess';
import { createTaskAssignedByUserNotification, createCommentMentionNotification, findMentionedUsers } from '@/lib/notifications';
import { emitMomentProgress } from '@/lib/teamMoments';
import { createNextRecurringTask, getOrdinalWeekOfMonth, getWeekdayOnlyValues, normalizeWeekdays, RECURRENCE_END_TYPES, RECURRENCE_MONTH_WEEKS, RECURRENCE_TYPES, RECURRENCE_WEEKDAYS } from '@/lib/taskRecurrence';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Bell, Plus, Search, ChevronDown, ArrowLeft, MessageSquare,
  Paperclip, Trash2, Send, Archive, Kanban, MoreHorizontal,
  Edit2, X, Check, LayoutList, User, Users, Tag, RotateCcw,
  Play, Square, Pause, Timer, Repeat2, Clock3
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
const ARCHIVED_PAGE_SIZE = 10;
const REPEAT_INTERVALS = Array.from({ length: 12 }, (_, index) => index + 1);
const TASK_TYPE_OPTIONS = [
  { value: 'general', label: 'Task' },
  { value: 'call', label: 'Call' },
];

function renderCommentText(content) {
  return content.split(/(\s+)/).map((part, i) => {
    if (!part) return null;
    if (part.startsWith('http://') || part.startsWith('https://')) {
      return (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-ios-blue underline">
          {part}
        </a>
      );
    }
    if (/^@[\p{L}\p{N}._-]+$/u.test(part)) {
      return <span key={i} className="font-semibold text-ios-blue bg-blue-50 px-1 rounded">{part}</span>;
    }
    return <span key={i}>{part}</span>;
  });
}

function mentionTagFor(member) {
  const firstName = (member.full_name || '').trim().split(/\s+/)[0];
  return (firstName || (member.email || '').split('@')[0] || '').replace(/[^\p{L}\p{N}._-]/gu, '');
}

function activeMentionQuery(value) {
  const match = value.match(/(?:^|\s)@([\p{L}\p{N}._-]*)$/u);
  return match ? match[1].toLowerCase() : null;
}

function toDateTimeLocalValue(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '';
  const pad = value => value.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function padDatePart(value) {
  return String(value).padStart(2, '0');
}

function combineDateAndTime(dateValue, timeValue) {
  if (!dateValue || !timeValue) return '';
  return `${dateValue}T${timeValue}`;
}

function datePartFromDateTime(value) {
  if (!value) return '';
  return value.includes('T') ? value.split('T')[0] : '';
}

function timePartFromDateTime(value) {
  if (!value) return '';
  return value.includes('T') ? value.split('T')[1]?.slice(0, 5) || '' : '';
}

function addMinutesToLocalDateTime(localValue, minutes) {
  if (!localValue) return '';
  const date = new Date(localValue);
  if (Number.isNaN(date.getTime())) return '';
  date.setMinutes(date.getMinutes() + minutes);
  return toDateTimeLocalValue(date.toISOString());
}

function minutesBetweenLocalDateTimes(startValue, endValue) {
  if (!startValue || !endValue) return 30;
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 30;
  return Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000));
}

function buildTaskPayloadFallback(payload, form, errorMessage = '') {
  const fallbackPayload = { ...payload };
  const needsCallFallback = /(starts_at|ends_at|meeting_link|call_note_template|all_day)/i.test(errorMessage);
  const needsRecurrenceFallback = /recurrence_/i.test(errorMessage);
  const needsReminderFallback = /reminder_at/i.test(errorMessage);

  if (needsCallFallback) {
    const startsAt = fallbackPayload.starts_at;
    const endsAt = fallbackPayload.ends_at;
    const meetingLink = fallbackPayload.meeting_link;
    const callNoteTemplate = fallbackPayload.call_note_template;
    delete fallbackPayload.starts_at;
    delete fallbackPayload.ends_at;
    delete fallbackPayload.meeting_link;
    delete fallbackPayload.call_note_template;
    delete fallbackPayload.all_day;
    fallbackPayload.description = form.task_type === 'call'
      ? embedCallMetadata(form.description, { starts_at: startsAt, ends_at: endsAt, meeting_link: meetingLink, call_note_template: callNoteTemplate })
      : form.description;
  }

  if (needsRecurrenceFallback) {
    delete fallbackPayload.recurrence_type;
    delete fallbackPayload.recurrence_interval;
    delete fallbackPayload.recurrence_weekdays;
    delete fallbackPayload.recurrence_daily_mode;
    delete fallbackPayload.recurrence_end_type;
    delete fallbackPayload.recurrence_until;
    delete fallbackPayload.recurrence_monthly_mode;
    delete fallbackPayload.recurrence_monthly_week;
    delete fallbackPayload.recurrence_monthly_weekday;
  }

  if (needsReminderFallback) {
    delete fallbackPayload.reminder_at;
  }

  return fallbackPayload;
}

function getDefaultCallWindow() {
  const now = new Date();
  const next = new Date(now);
  next.setSeconds(0, 0);
  const roundedMinutes = Math.ceil(next.getMinutes() / 30) * 30;
  if (roundedMinutes === 60) {
    next.setHours(next.getHours() + 1, 0, 0, 0);
  } else {
    next.setMinutes(roundedMinutes, 0, 0);
  }
  const end = new Date(next);
  end.setMinutes(end.getMinutes() + 30);
  return {
    starts_at: toDateTimeLocalValue(next.toISOString()),
    ends_at: toDateTimeLocalValue(end.toISOString()),
  };
}

function scheduleDayFromTask(task) {
  if (task?.due_date) return new Date(`${task.due_date}T12:00:00`).getDay();
  if (task?.reminder_at) return new Date(task.reminder_at).getDay();
  return new Date().getDay();
}

function recurrenceSummary(form) {
  if (form.recurrence_type === 'none') return 'Does not repeat';
  if (form.recurrence_type === 'daily') {
    if (form.recurrence_daily_mode === 'weekday') return 'Every weekday';
    return form.recurrence_interval === 1 ? 'Repeats daily' : `Repeats every ${form.recurrence_interval} days`;
  }
  if (form.recurrence_type === 'monthly') {
    if (form.recurrence_monthly_mode === 'ordinal_weekday') {
      const weekLabel = RECURRENCE_MONTH_WEEKS.find(item => item.value === form.recurrence_monthly_week)?.label || 'First';
      const weekdayLabel = RECURRENCE_WEEKDAYS.find(item => item.value === Number(form.recurrence_monthly_weekday))?.label || 'Sunday';
      return `${weekLabel} ${weekdayLabel} of every ${form.recurrence_interval} month${form.recurrence_interval === 1 ? '' : 's'}`;
    }
    return form.recurrence_interval === 1 ? 'Repeats monthly' : `Repeats every ${form.recurrence_interval} months`;
  }
  const weekdays = normalizeWeekdays(form.recurrence_weekdays, new Date().getDay())
    .map(day => RECURRENCE_WEEKDAYS.find(item => item.value === day)?.label?.slice(0, 3))
    .filter(Boolean)
    .join(', ');
  if (form.recurrence_interval === 1) return `Repeats weekly on ${weekdays}`;
  return `Repeats every ${form.recurrence_interval} weeks on ${weekdays}`;
}


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
function TaskDetail({ task, members, boardColumns, projects, labels: allLabels, existingTasks = [], activeTimer, elapsed, isPaused, initialTab, onClose, onSave, onDelete, onStartTimer, onStopTimer, onPauseTimer, onProjectCreated, onLabelsChange, currentUser, actorProfile }) {
  const isNew = !task?.id;
  const isTimerActive = activeTimer?.task_id === task?.id;
  const defaultScheduleDay = scheduleDayFromTask(task);
  const taskCallStartsAt = getCallField(task, 'starts_at');
  const taskCallEndsAt = getCallField(task, 'ends_at');
  const taskMeetingLink = getCallField(task, 'meeting_link');
  const taskCallTemplate = getCallField(task, 'call_note_template');

  const [form, setForm] = useState({
    task_type: task?.task_type || 'general',
    title: task?.title || '',
    description: stripCallMetadata(task?.description || ''),
    assigned_to: task?.assigned_to || currentUser?.id || '',
    priority: task?.priority || 'medium',
    due_date: task?.due_date || '',
    reminder_at: toDateTimeLocalValue(task?.reminder_at),
    starts_at: toDateTimeLocalValue(taskCallStartsAt),
    ends_at: toDateTimeLocalValue(taskCallEndsAt),
    meeting_link: taskMeetingLink || '',
    call_note_template: taskCallTemplate || '',
    column_id: task?.column_id || boardColumns[0]?.id || '',
    project_id: task?.project_id || '',
    recurrence_type: task?.recurrence_type || 'none',
    recurrence_interval: Math.max(1, Number(task?.recurrence_interval) || 1),
    recurrence_weekdays: normalizeWeekdays(task?.recurrence_weekdays, defaultScheduleDay),
    recurrence_daily_mode: task?.recurrence_daily_mode || 'interval',
    recurrence_end_type: task?.recurrence_end_type || 'never',
    recurrence_until: task?.recurrence_until || '',
    recurrence_monthly_mode: task?.recurrence_monthly_mode || 'day_of_month',
    recurrence_monthly_week: task?.recurrence_monthly_week || getOrdinalWeekOfMonth(task?.due_date ? new Date(`${task.due_date}T12:00:00`) : new Date()),
    recurrence_monthly_weekday: Number(task?.recurrence_monthly_weekday ?? defaultScheduleDay),
  });
  const [comments, setComments] = useState([]);
  const [taskLabels, setTaskLabels] = useState([]);
  const [mentionMembers, setMentionMembers] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [mentionQuery, setMentionQuery] = useState(null);
  const [commentFile, setCommentFile] = useState(null);
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingCommentText, setEditingCommentText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [tab, setTab] = useState(initialTab || 'details');
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
  const commentRef = useRef(null);

  useEffect(() => {
    if (task?.id) { loadComments(); loadLabels(); }
  }, [task?.id]);

  useEffect(() => {
    loadMentionMembers();
  }, [task?.id, task?.project_id, form.project_id, form.assigned_to, members]);

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab, task?.id]);

  useEffect(() => {
    const project = projects.find(p => p.id === form.project_id);
    if (project) {
      setProjSearch(project.name || '');
    } else {
      setProjSearch('');
    }
  }, [form.project_id, projects]);

  useEffect(() => {
    if (!form.column_id && boardColumns.length > 0)
      setForm(p => ({ ...p, column_id: boardColumns[0].id }));
  }, [boardColumns]);

  useEffect(() => {
    if (form.task_type !== 'call') return;
    if (form.starts_at && form.ends_at) return;
    const defaults = getDefaultCallWindow();
    setForm(prev => ({
      ...prev,
      starts_at: prev.starts_at || defaults.starts_at,
      ends_at: prev.ends_at || defaults.ends_at,
      due_date: prev.due_date || datePartFromDateTime(prev.starts_at || defaults.starts_at),
      reminder_at: prev.reminder_at || addMinutesToLocalDateTime(prev.starts_at || defaults.starts_at, -10),
    }));
  }, [form.task_type, form.starts_at, form.ends_at, form.due_date, form.reminder_at]);

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
      .select('*, profiles(full_name,email,id,avatar_url)')
      .eq('task_id', task.id).order('created_at');
    setComments(data || []);
  }

  async function loadLabels() {
    const { data } = await supabase.from('task_labels').select('*, labels(*)').eq('task_id', task.id);
    setTaskLabels((data || []).map(tl => tl.labels).filter(Boolean));
  }

  async function loadMentionMembers() {
    const projectId = task?.project_id || form.project_id;
    if (!projectId) {
      setMentionMembers(members.filter(member => member.id !== currentUser?.id));
      return;
    }

    const { data: projectMembers } = await supabase
      .from('project_members')
      .select('user_id')
      .eq('project_id', projectId);

    const allowedIds = new Set((projectMembers || []).map(member => member.user_id).filter(Boolean));
    members.forEach(member => {
      if (member.role === 'admin') allowedIds.add(member.id);
    });
    if (form.assigned_to) allowedIds.add(form.assigned_to);
    if (task?.assigned_to) allowedIds.add(task.assigned_to);
    if (currentUser?.id) allowedIds.add(currentUser.id);

    setMentionMembers(members.filter(member => allowedIds.has(member.id) && member.id !== currentUser?.id));
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
    if (data) onLabelsChange?.(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setNewLabelName(''); setShowNewLabel(false); onSave();
  }

  async function deleteLabelEverywhere(labelId) {
    await supabase.from('task_labels').delete().eq('label_id', labelId);
    await supabase.from('labels').delete().eq('id', labelId);
    setTaskLabels(prev => prev.filter(label => label.id !== labelId));
    setPendingLabels(prev => prev.filter(label => label.id !== labelId));
    onLabelsChange?.(prev => prev.filter(label => label.id !== labelId));
  }

  async function save() {
    if (!form.title.trim() || !form.project_id) return;
    if (form.task_type === 'call') {
      if (!form.starts_at || !form.ends_at) {
        alert('Please choose the call date and time.');
        return;
      }
      const starts = new Date(form.starts_at);
      const ends = new Date(form.ends_at);
      if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime()) || ends <= starts) {
        alert('End time needs to be after the start time.');
        return;
      }
    }
    if (form.recurrence_type !== 'none' && form.recurrence_end_type === 'on_date' && !form.recurrence_until) {
      alert('Please choose an end date for this recurring task.');
      return;
    }
    setLoading(true);
    const previousAssignee = task?.id ? task.assigned_to : null;
    const normalizedDueDate = form.task_type === 'call'
      ? datePartFromDateTime(form.starts_at)
      : (form.due_date || null);
    const normalizedReminder = form.task_type === 'call'
      ? (form.reminder_at || addMinutesToLocalDateTime(form.starts_at, -10))
      : form.reminder_at;
    const normalizedAssignee = form.task_type === 'call'
      ? (form.assigned_to || currentUser?.id || null)
      : (form.assigned_to || null);
    const payload = {
      ...form,
      assigned_to: normalizedAssignee,
      due_date: normalizedDueDate,
      reminder_at: normalizedReminder ? new Date(normalizedReminder).toISOString() : null,
      starts_at: form.task_type === 'call' && form.starts_at ? new Date(form.starts_at).toISOString() : null,
      ends_at: form.task_type === 'call' && form.ends_at ? new Date(form.ends_at).toISOString() : null,
      meeting_link: form.task_type === 'call' ? (form.meeting_link.trim() || null) : null,
      call_note_template: form.task_type === 'call' ? (form.call_note_template.trim() || null) : null,
      column_id: form.column_id || boardColumns[0]?.id || null,
      recurrence_interval: Math.max(1, Number(form.recurrence_interval) || 1),
      recurrence_daily_mode: form.recurrence_type === 'daily' ? form.recurrence_daily_mode : 'interval',
      recurrence_weekdays: form.recurrence_type === 'weekly'
        ? normalizeWeekdays(form.recurrence_weekdays, normalizedDueDate ? new Date(`${normalizedDueDate}T12:00:00`).getDay() : new Date().getDay())
        : null,
      recurrence_end_type: form.recurrence_type === 'none' ? 'never' : form.recurrence_end_type || 'never',
      recurrence_until: form.recurrence_type !== 'none' && form.recurrence_end_type === 'on_date' ? (form.recurrence_until || null) : null,
      recurrence_monthly_mode: form.recurrence_type === 'monthly' ? form.recurrence_monthly_mode : 'day_of_month',
      recurrence_monthly_week: form.recurrence_type === 'monthly' && form.recurrence_monthly_mode === 'ordinal_weekday' ? form.recurrence_monthly_week : null,
      recurrence_monthly_weekday: form.recurrence_type === 'monthly' && form.recurrence_monthly_mode === 'ordinal_weekday' ? Number(form.recurrence_monthly_weekday) : null,
    };
    let savedTask = task?.id ? { ...task, ...payload } : null;
    if (task?.id) {
      let { error } = await supabase.from('tasks').update(payload).eq('id', task.id);
      if (error && /(reminder_at|recurrence_|starts_at|ends_at|meeting_link|call_note_template)/i.test(error.message || '')) {
        const fallbackPayload = buildTaskPayloadFallback(payload, form, error.message || '');
        ({ error } = await supabase.from('tasks').update(fallbackPayload).eq('id', task.id));
      }
      if (error) {
        setLoading(false);
        return;
      }
    } else {
      let insertResult = await supabase.from('tasks')
        .insert({ ...payload, status: 'todo', position: nextTaskPosition })
        .select().single();
      if (insertResult.error && /(reminder_at|recurrence_|starts_at|ends_at|meeting_link|call_note_template)/i.test(insertResult.error.message || '')) {
        const fallbackPayload = buildTaskPayloadFallback(payload, form, insertResult.error.message || '');
        insertResult = await supabase.from('tasks')
          .insert({ ...fallbackPayload, status: 'todo', position: nextTaskPosition })
          .select().single();
      }
      if (insertResult.error) {
        setLoading(false);
        return;
      }
      const saved = insertResult.data;
      savedTask = saved;
      // Apply pending labels
      if (saved && pendingLabels.length > 0) {
        await Promise.all(pendingLabels.map(l =>
          supabase.from('task_labels').insert({ task_id: saved.id, label_id: l.id })
        ));
      }
    }
    if (payload.project_id && payload.assigned_to) {
      const { error } = await grantProjectAccess(payload.project_id, payload.assigned_to);
      if (error) console.warn('Could not grant project access from task assignment', error);
    }
    if (savedTask && payload.assigned_to && payload.assigned_to !== previousAssignee) {
      await createTaskAssignedByUserNotification({
        task: savedTask,
        assignedUserId: payload.assigned_to,
        actorId: currentUser?.id,
        actorName: actorProfile?.full_name || actorProfile?.nickname || actorProfile?.email || currentUser?.email?.split('@')[0],
      });
    }
    setLoading(false); onSave();
  }

  async function createProject() {
    if (!newProjName.trim()) return;
    // Project requires client too - use first available or skip
    const payload = { name: newProjName.trim(), color: newProjColor, status: 'active' };
    if (newProjClientId) payload.client_id = newProjClientId;
    const { data } = await supabase.from('projects').insert(payload).select('*, clients(name)').single();
    if (data) {
      onProjectCreated?.(data);
      setForm(p => ({ ...p, project_id: data.id }));
      setShowProjDrop(false);
    }
    setShowNewProj(false);
    setNewProjName('');
    setNewProjClientId('');
  }

  async function addComment() {
    if (!newComment.trim() && !commentFile) return;
    setSending(true);
    let fileData = null;
    const commentText = newComment.trim();
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
    const content = commentText || (fileData ? `📎 ${fileData.name}` : '');
    const { data: savedComment } = await supabase.from('task_comments').insert({
      task_id: task.id, user_id: currentUser?.id,
      content,
      ...(fileData ? { file_name: fileData.name, file_url: fileData.url, file_type: fileData.type } : {}),
    }).select('id,content').single();
    const mentionedUsers = findMentionedUsers(content, mentionMembers);
    if (savedComment && mentionedUsers.length) {
      await Promise.all(mentionedUsers.map(member => createCommentMentionNotification({
        task,
        commentId: savedComment.id,
        mentionedUserId: member.id,
        actorId: currentUser?.id,
      })));
    }
    setNewComment(''); setMentionQuery(null); setCommentFile(null); setSending(false); loadComments();
  }

  async function saveCommentEdit(commentId) {
    if (!editingCommentText.trim()) return;
    const content = editingCommentText.trim();
    const { data: savedComment } = await supabase.from('task_comments')
      .update({ content })
      .eq('id', commentId)
      .select('id,content')
      .single();
    const mentionedUsers = findMentionedUsers(content, mentionMembers);
    if (savedComment && mentionedUsers.length) {
      await Promise.all(mentionedUsers.map(member => createCommentMentionNotification({
        task,
        commentId: savedComment.id,
        mentionedUserId: member.id,
        actorId: currentUser?.id,
      })));
    }
    setEditingCommentId(null); setEditingCommentText(''); loadComments();
  }

  async function deleteComment(id) {
    await supabase.from('task_comments').delete().eq('id', id); loadComments();
  }

  function updateCommentText(value) {
    setNewComment(value);
    setMentionQuery(activeMentionQuery(value));
  }

  function insertMention(member) {
    const tag = mentionTagFor(member);
    if (!tag) return;
    setNewComment(prev => prev.replace(/(^|\s)@[\p{L}\p{N}._-]*$/u, `$1@${tag} `));
    setMentionQuery(null);
    setTimeout(() => commentRef.current?.focus(), 0);
  }

  const mentionSuggestions = mentionQuery === null ? [] : mentionMembers
    .filter(member => {
      const tag = mentionTagFor(member).toLowerCase();
      const name = (member.full_name || '').toLowerCase();
      const email = (member.email || '').toLowerCase();
      return !mentionQuery || tag.includes(mentionQuery) || name.includes(mentionQuery) || email.includes(mentionQuery);
    })
    .slice(0, 6);

  async function archiveTask() {
    await supabase.from('tasks').update({ is_archived: true, archived_at: new Date().toISOString() }).eq('id', task.id);
    onSave();
  }

  async function unarchiveTask() {
    await supabase.from('tasks').update({ is_archived: false, archived_at: null }).eq('id', task.id);
    onSave();
  }

  const selectedProject = projects.find(p => p.id === form.project_id);
  const isCall = form.task_type === 'call';
  const callDate = datePartFromDateTime(form.starts_at) || form.due_date || '';
  const callStartTime = timePartFromDateTime(form.starts_at);
  const callEndTime = timePartFromDateTime(form.ends_at);
  const callDurationMinutes = minutesBetweenLocalDateTimes(form.starts_at, form.ends_at);
  const nextTaskPosition = useMemo(() => {
    const targetColumnId = form.column_id || boardColumns[0]?.id || null;
    const relevantTasks = existingTasks.filter(existingTask => (existingTask.column_id || null) === targetColumnId);
    if (relevantTasks.length === 0) return 0;
    return Math.max(...relevantTasks.map(existingTask => Number(existingTask.position) || 0)) + 1;
  }, [existingTasks, form.column_id, boardColumns]);
  const filteredProjects = projects.filter(p =>
    p.name.toLowerCase().includes(projSearch.toLowerCase()) ||
    p.clients?.name?.toLowerCase().includes(projSearch.toLowerCase())
  );
  const filteredLabels = allLabels.filter(l => l.name.toLowerCase().includes(labelSearch.toLowerCase()));

  return (
    <Modal title={isNew ? (isCall ? 'New Call' : 'New Task') : task.title} onClose={onClose} size="lg">
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
        <div className="space-y-3">
          <div className="bg-white px-4 pb-4 space-y-3">
            <div ref={projRef} className="relative">
              <label className="input-label">Project *</label>
              <div className={`h-12 w-full rounded-ios bg-ios-fill border px-3.5 flex items-center gap-3 transition-all ${
                !form.project_id ? 'border-ios-red/30' : 'border-transparent focus-within:border-ios-blue/40'
              }`}>
                {selectedProject && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: selectedProject.color }} />}
                <input
                  className="flex-1 bg-transparent text-body text-ios-primary placeholder:text-ios-tertiary focus:outline-none"
                  placeholder="Search project..."
                  value={projSearch}
                  onFocus={() => setShowProjDrop(true)}
                  onChange={e => {
                    const nextValue = e.target.value;
                    setProjSearch(nextValue);
                    setShowProjDrop(true);
                    if (!selectedProject || nextValue !== selectedProject.name) {
                      setForm(prev => ({ ...prev, project_id: '' }));
                    }
                  }}
                />
                <ChevronDown className="w-4 h-4 text-ios-tertiary shrink-0" />
              </div>
              {showProjDrop && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-ios-lg shadow-ios-modal border border-ios-separator/30 z-50 max-h-60 overflow-y-auto">
                  {actorProfile?.role !== 'operator' && (
                    <div className="p-2 border-b border-ios-separator/30 space-y-1">
                      <button onClick={async () => {
                          setShowNewProj(true); setShowProjDrop(false);
                          const { data: cl } = await supabase.from('clients').select('id,name').order('name');
                          setProjClients(cl || []);
                        }}
                        className="flex items-center gap-2 w-full px-2 py-1.5 text-footnote text-ios-blue hover:bg-blue-50 rounded-ios font-semibold">
                        <Plus className="w-3.5 h-3.5" /> New Project
                      </button>
                    </div>
                  )}
                  {filteredProjects.map(p => (
                    <button key={p.id} onClick={() => { setForm(prev => ({ ...prev, project_id: p.id })); setShowProjDrop(false); setProjSearch(p.name); }}
                      className={`w-full flex items-center gap-2 px-3 py-2.5 hover:bg-ios-fill text-left ${form.project_id === p.id ? 'bg-blue-50' : ''}`}>
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
              <div className="rounded-ios-lg border border-blue-100 bg-blue-50/70 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-footnote font-semibold text-ios-blue">New project</p>
                  <button onClick={() => setShowNewProj(false)} className="text-ios-tertiary text-caption1">Cancel</button>
                </div>
                <input className="input bg-white" placeholder="Project name *" value={newProjName} onChange={e => setNewProjName(e.target.value)} autoFocus />
                <div>
                  <p className="input-label">Client (required)</p>
                  <select className="input bg-white" value={newProjClientId} onChange={e => setNewProjClientId(e.target.value)}>
                    <option value="">— Select client —</option>
                    {projClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="flex gap-2">{COL_COLORS.slice(0, 6).map(c => <button key={c} onClick={() => setNewProjColor(c)} style={{ background: c }} className={`w-6 h-6 rounded-full ${newProjColor === c ? 'ring-2 ring-offset-1 ring-ios-blue' : ''}`} />)}</div>
                <button className="btn-primary w-full py-1.5 text-footnote" onClick={createProject} disabled={!newProjName.trim()}>
                  Create Project & Select
                </button>
              </div>
            )}

            <div className="space-y-2">
              <label className="input-label !mb-0">Type</label>
              <div className="flex gap-1 rounded-ios bg-ios-fill p-1">
                {TASK_TYPE_OPTIONS.map(option => {
                  const active = form.task_type === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setForm(prev => {
                        if (option.value === 'call') {
                          const defaults = prev.starts_at && prev.ends_at
                            ? { starts_at: prev.starts_at, ends_at: prev.ends_at }
                            : getDefaultCallWindow();
                          const startsAt = prev.starts_at || defaults.starts_at;
                          return {
                            ...prev,
                            task_type: 'call',
                            starts_at: startsAt,
                            ends_at: prev.ends_at || defaults.ends_at,
                            due_date: datePartFromDateTime(startsAt),
                            reminder_at: prev.reminder_at || addMinutesToLocalDateTime(startsAt, -10),
                          };
                        }
                        return {
                          ...prev,
                          task_type: 'general',
                          starts_at: '',
                          ends_at: '',
                          meeting_link: '',
                          call_note_template: '',
                        };
                      })}
                      className={`flex-1 rounded-ios-sm px-3 py-2 text-footnote font-semibold transition-all ${
                        active ? 'bg-white text-ios-primary shadow-ios-sm' : 'text-ios-secondary'
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="input-label">Title *</label>
              <input
                className="h-12 w-full rounded-ios bg-ios-fill border border-transparent px-3.5 text-body text-ios-primary placeholder:text-ios-tertiary focus:outline-none focus:ring-2 focus:ring-ios-blue/20 focus:border-ios-blue/40"
                value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                placeholder={isCall ? 'Who is the call with?' : 'What needs to be done?'}
                autoFocus={isNew}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div>
                <label className="input-label-compact">Column</label>
                <select className="input-compact h-10" value={form.column_id} onChange={e => setForm(p => ({ ...p, column_id: e.target.value }))}>
                  {boardColumns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="input-label-compact">Priority</label>
                <select className="input-compact h-10" value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}>
                  {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="input-label-compact">Assignee</label>
                <select className="input-compact h-10" value={form.assigned_to} onChange={e => setForm(p => ({ ...p, assigned_to: e.target.value }))}>
                  <option value="">Nobody</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
                </select>
              </div>
            </div>

            {isCall && (
              <div className="rounded-ios border border-ios-separator/40 bg-ios-bg/60 p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Clock3 className="w-4 h-4 text-ios-blue" />
                    <p className="text-footnote font-semibold text-ios-primary">Schedule call quickly</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {[15, 30, 45, 60].map(minutes => {
                      const active = callDurationMinutes === minutes;
                      return (
                        <button
                          key={minutes}
                          type="button"
                          onClick={() => setForm(prev => {
                            const baseStart = prev.starts_at || combineDateAndTime(callDate || prev.due_date || datePartFromDateTime(prev.ends_at) || datePartFromDateTime(getDefaultCallWindow().starts_at), callStartTime || '09:00');
                            return {
                              ...prev,
                              starts_at: baseStart,
                              ends_at: addMinutesToLocalDateTime(baseStart, minutes),
                              due_date: datePartFromDateTime(baseStart),
                              reminder_at: addMinutesToLocalDateTime(baseStart, -10),
                            };
                          })}
                          className={`px-3 py-1.5 rounded-ios text-footnote font-semibold transition-all ${
                            active ? 'bg-ios-blue text-white shadow-ios-sm' : 'bg-white text-ios-secondary border border-ios-separator/50 hover:border-ios-blue/40 hover:text-ios-blue'
                          }`}
                        >
                          {minutes} min
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div>
                    <label className="input-label-compact">Date</label>
                    <input
                      className="input-compact h-10"
                      type="date"
                      value={callDate}
                      onChange={e => {
                        const nextDate = e.target.value;
                        setForm(prev => {
                          const nextStartsAt = combineDateAndTime(nextDate, timePartFromDateTime(prev.starts_at) || '09:00');
                          const nextEndsAt = combineDateAndTime(nextDate, timePartFromDateTime(prev.ends_at) || '09:30');
                          return {
                            ...prev,
                            due_date: nextDate,
                            starts_at: nextStartsAt,
                            ends_at: nextEndsAt,
                            reminder_at: prev.reminder_at ? combineDateAndTime(nextDate, timePartFromDateTime(prev.reminder_at)) : addMinutesToLocalDateTime(nextStartsAt, -10),
                          };
                        });
                      }}
                    />
                  </div>
                  <div>
                    <label className="input-label-compact">Start</label>
                    <input
                      className="input-compact h-10"
                      type="time"
                      value={callStartTime}
                      onChange={e => {
                        const nextTime = e.target.value;
                        setForm(prev => {
                          const nextStartsAt = combineDateAndTime(callDate || prev.due_date || datePartFromDateTime(prev.starts_at), nextTime);
                          const duration = minutesBetweenLocalDateTimes(prev.starts_at, prev.ends_at);
                          return {
                            ...prev,
                            due_date: datePartFromDateTime(nextStartsAt),
                            starts_at: nextStartsAt,
                            ends_at: addMinutesToLocalDateTime(nextStartsAt, duration),
                            reminder_at: addMinutesToLocalDateTime(nextStartsAt, -10),
                          };
                        });
                      }}
                    />
                  </div>
                  <div>
                    <label className="input-label-compact">End</label>
                    <input
                      className="input-compact h-10"
                      type="time"
                      value={callEndTime}
                      onChange={e => {
                        const nextTime = e.target.value;
                        setForm(prev => ({
                          ...prev,
                          ends_at: combineDateAndTime(callDate || prev.due_date || datePartFromDateTime(prev.starts_at), nextTime),
                        }));
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between gap-3 mb-1">
                <label className="input-label !mb-0">Description</label>
                <span className="text-caption2 text-ios-tertiary">Optional</span>
              </div>
              <textarea className="min-h-[76px] w-full rounded-ios bg-ios-fill border border-transparent px-3.5 py-3 text-body text-ios-primary placeholder:text-ios-tertiary focus:outline-none focus:ring-2 focus:ring-ios-blue/20 focus:border-ios-blue/40" rows={2} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder={isCall ? 'Agenda, key goals, prep notes...' : 'Context, links, notes...'} />
            </div>

            {isCall && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div>
                  <label className="input-label-compact">Meeting link</label>
                  <input
                    className="input-compact h-10"
                    value={form.meeting_link}
                    onChange={e => setForm(p => ({ ...p, meeting_link: e.target.value }))}
                    placeholder="https://meet.google.com/..."
                  />
                </div>
                <div>
                  <label className="input-label-compact">Call note prompt</label>
                  <input
                    className="input-compact h-10"
                    value={form.call_note_template}
                    onChange={e => setForm(p => ({ ...p, call_note_template: e.target.value }))}
                    placeholder="Follow-up, blockers, next steps..."
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <div ref={labelRef} className="relative">
                  <label className="input-label-compact flex items-center gap-1.5"><Tag className="w-3.5 h-3.5 text-ios-tertiary" />Label</label>
                  <button
                    onClick={() => setShowLabelDrop(!showLabelDrop)}
                    className="h-10 w-full rounded-ios bg-ios-fill border border-transparent px-3 flex items-center justify-between gap-2 text-left text-footnote text-ios-primary focus:outline-none focus:ring-2 focus:ring-ios-blue/20 focus:border-ios-blue/40"
                  >
                    <span className="truncate">
                      {(isNew ? pendingLabels : taskLabels).length > 0
                        ? `${(isNew ? pendingLabels : taskLabels)[0].name}${(isNew ? pendingLabels : taskLabels).length > 1 ? ` +${(isNew ? pendingLabels : taskLabels).length - 1}` : ''}`
                        : 'Label'
                      }
                    </span>
                    <ChevronDown className="w-4 h-4 text-ios-tertiary shrink-0" />
                  </button>
                  {showLabelDrop && (
                    <div className="absolute top-full left-0 mt-1 bg-white rounded-ios-lg shadow-ios-modal border border-ios-separator/30 z-50 w-60 max-h-56 overflow-y-auto">
                      <div className="p-2 border-b border-ios-separator/30">
                        <input className="input py-1.5 text-footnote" placeholder="Search..." value={labelSearch} onChange={e => setLabelSearch(e.target.value)} autoFocus />
                      </div>
                      {filteredLabels.map(l => (
                        <div key={l.id} className="flex items-center gap-1 pr-1 hover:bg-ios-fill">
                          <button onClick={() => {
                            if (isNew) {
                              setPendingLabels(p => p.some(x => x.id === l.id) ? p.filter(x => x.id !== l.id) : [...p, l]);
                            } else {
                              toggleLabel(l);
                            }
                          }} className="flex items-center justify-between flex-1 px-3 py-2.5 text-left">
                            <span className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full" style={{ background: l.color }} />
                              <span className="text-subhead">{l.name}</span>
                            </span>
                            {(isNew ? pendingLabels : taskLabels).some(tl => tl.id === l.id) && <Check className="w-4 h-4 text-ios-blue" />}
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); deleteLabelEverywhere(l.id); }}
                            className="p-1.5 rounded-ios text-ios-tertiary hover:text-ios-red hover:bg-red-50 shrink-0"
                            title="Delete label"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      <div className="border-t border-ios-separator/30 p-2">
                        {showNewLabel ? (
                          <div className="space-y-2 overflow-y-auto flex-1" style={{ maxHeight: 'calc(100vh - 260px)' }}>
                            <input className="input py-1.5 text-footnote" placeholder="Label name" value={newLabelName} onChange={e => setNewLabelName(e.target.value)} autoFocus />
                            <div className="flex gap-1.5 flex-wrap">{COL_COLORS.map(c => <button key={c} onClick={() => setNewLabelColor(c)} style={{ background: c }} className={`w-5 h-5 rounded-full ${newLabelColor === c ? 'ring-2 ring-offset-1 ring-gray-400' : ''}`} />)}</div>
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
                <div>
                  <label className="input-label-compact flex items-center gap-1.5"><Timer className="w-3.5 h-3.5 text-ios-tertiary" />{isCall ? 'Date' : 'Due date'}</label>
                  <input
                    className="input-compact h-10"
                    type="date"
                    value={isCall ? callDate : form.due_date}
                    onChange={e => {
                      const nextDate = e.target.value;
                      if (isCall) {
                        setForm(prev => {
                          const nextStartsAt = combineDateAndTime(nextDate, timePartFromDateTime(prev.starts_at) || '09:00');
                          const nextEndsAt = combineDateAndTime(nextDate, timePartFromDateTime(prev.ends_at) || '09:30');
                          return {
                            ...prev,
                            due_date: nextDate,
                            starts_at: nextStartsAt,
                            ends_at: nextEndsAt,
                            reminder_at: prev.reminder_at ? combineDateAndTime(nextDate, timePartFromDateTime(prev.reminder_at)) : addMinutesToLocalDateTime(nextStartsAt, -10),
                          };
                        });
                        return;
                      }
                      setForm(p => ({ ...p, due_date: nextDate }));
                    }}
                  />
                </div>
                <div>
                  <label className="input-label-compact flex items-center gap-1.5"><Bell className="w-3.5 h-3.5 text-ios-tertiary" />Reminder</label>
                  <input
                    className="input-compact h-10"
                    type="datetime-local"
                    value={form.reminder_at}
                    onChange={e => setForm(p => ({ ...p, reminder_at: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="input-label-compact flex items-center gap-1.5"><Repeat2 className="w-3.5 h-3.5 text-ios-tertiary" />Recurrence</label>
                  <select
                    className="input-compact h-10"
                    value={form.recurrence_type}
                    onChange={e => {
                      const nextType = e.target.value;
                      setForm(prev => ({
                        ...prev,
                        recurrence_type: nextType,
                        recurrence_daily_mode: nextType === 'daily' ? prev.recurrence_daily_mode : 'interval',
                        recurrence_weekdays: nextType === 'weekly'
                          ? normalizeWeekdays(prev.recurrence_weekdays, prev.due_date ? new Date(`${prev.due_date}T12:00:00`).getDay() : new Date().getDay())
                          : prev.recurrence_weekdays,
                      }));
                    }}
                  >
                    {RECURRENCE_TYPES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
              </div>

              {(isNew ? pendingLabels : taskLabels).length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {(isNew ? pendingLabels : taskLabels).map(l => (
                    <LabelPill key={l.id} label={l} onRemove={() => { if (isNew) setPendingLabels(p => p.filter(x => x.id !== l.id)); else toggleLabel(l); }} />
                  ))}
                </div>
              )}

              {form.reminder_at && (
                <p className="text-caption2 text-ios-tertiary">
                  Reminder sends a notification to the assignee.
                </p>
              )}

              {form.recurrence_type !== 'none' && (
                <div className="rounded-ios border border-blue-100 bg-blue-50/55 p-3 space-y-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Repeat2 className="w-4 h-4 text-ios-blue shrink-0" />
                  <span className="text-footnote font-semibold text-ios-primary shrink-0">{recurrenceSummary(form)}</span>
                </div>

                {form.recurrence_type === 'daily' && (
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-footnote text-ios-primary flex-wrap">
                      <input
                        type="radio"
                        className="w-4 h-4 accent-[#007AFF]"
                        checked={form.recurrence_daily_mode === 'interval'}
                        onChange={() => setForm(prev => ({ ...prev, recurrence_daily_mode: 'interval' }))}
                      />
                      <span>Recur every</span>
                      <select
                        className="input-compact !w-[84px] bg-white"
                        value={form.recurrence_interval}
                        onChange={e => setForm(prev => ({ ...prev, recurrence_interval: Number(e.target.value) }))}
                      >
                        {REPEAT_INTERVALS.map(value => <option key={value} value={value}>{value}</option>)}
                      </select>
                      <span>day(s)</span>
                    </label>
                    <label className="flex items-center gap-2 text-footnote text-ios-primary">
                      <input
                        type="radio"
                        className="w-4 h-4 accent-[#007AFF]"
                        checked={form.recurrence_daily_mode === 'weekday'}
                        onChange={() => setForm(prev => ({ ...prev, recurrence_daily_mode: 'weekday', recurrence_weekdays: getWeekdayOnlyValues() }))}
                      />
                      <span>Every weekday</span>
                    </label>
                  </div>
                )}

                {form.recurrence_type === 'weekly' && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-footnote">
                      <span className="text-ios-secondary shrink-0">Recur every</span>
                      <select
                        className="input-compact !w-[84px] bg-white"
                        value={form.recurrence_interval}
                        onChange={e => setForm(prev => ({ ...prev, recurrence_interval: Number(e.target.value) }))}
                      >
                        {REPEAT_INTERVALS.map(value => <option key={value} value={value}>{value}</option>)}
                      </select>
                      <span className="text-ios-secondary shrink-0">week(s) on</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {RECURRENCE_WEEKDAYS.map(day => {
                        const active = form.recurrence_weekdays.includes(day.value);
                        return (
                          <button
                            key={day.value}
                            type="button"
                            onClick={() => setForm(prev => {
                              const exists = prev.recurrence_weekdays.includes(day.value);
                              const nextDays = exists
                                ? prev.recurrence_weekdays.filter(value => value !== day.value)
                                : [...prev.recurrence_weekdays, day.value];
                              return {
                                ...prev,
                                recurrence_weekdays: normalizeWeekdays(nextDays, day.value),
                              };
                            })}
                            className={`w-9 h-9 rounded-full border text-footnote font-semibold transition-all ${
                              active
                                ? 'bg-ios-blue border-ios-blue text-white shadow-ios-sm'
                                : 'bg-white border-ios-separator/60 text-ios-secondary hover:border-ios-blue/40 hover:text-ios-blue'
                            }`}
                            title={day.label}
                          >
                            {day.short}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {form.recurrence_type === 'monthly' && (
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-footnote text-ios-primary flex-wrap">
                      <input
                        type="radio"
                        className="w-4 h-4 accent-[#007AFF]"
                        checked={form.recurrence_monthly_mode === 'day_of_month'}
                        onChange={() => setForm(prev => ({ ...prev, recurrence_monthly_mode: 'day_of_month' }))}
                      />
                      <span>Day</span>
                      <span className="inline-flex items-center rounded-ios bg-white px-2.5 py-1 text-footnote font-semibold text-ios-primary border border-ios-separator/30">
                        {form.due_date ? new Date(`${form.due_date}T12:00:00`).getDate() : 1}
                      </span>
                      <span>of every</span>
                      <select
                        className="input-compact !w-[84px] bg-white"
                        value={form.recurrence_interval}
                        onChange={e => setForm(prev => ({ ...prev, recurrence_interval: Number(e.target.value) }))}
                      >
                        {REPEAT_INTERVALS.map(value => <option key={value} value={value}>{value}</option>)}
                      </select>
                      <span>month(s)</span>
                    </label>
                    <label className="flex items-center gap-2 text-footnote text-ios-primary flex-wrap">
                      <input
                        type="radio"
                        className="w-4 h-4 accent-[#007AFF]"
                        checked={form.recurrence_monthly_mode === 'ordinal_weekday'}
                        onChange={() => setForm(prev => ({ ...prev, recurrence_monthly_mode: 'ordinal_weekday' }))}
                      />
                      <span>On</span>
                      <select
                        className="input-compact !w-auto min-w-[110px] bg-white"
                        value={form.recurrence_monthly_week}
                        onChange={e => setForm(prev => ({ ...prev, recurrence_monthly_week: e.target.value }))}
                        disabled={form.recurrence_monthly_mode !== 'ordinal_weekday'}
                      >
                        {RECURRENCE_MONTH_WEEKS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                      <select
                        className="input-compact !w-auto min-w-[118px] bg-white"
                        value={form.recurrence_monthly_weekday}
                        onChange={e => setForm(prev => ({ ...prev, recurrence_monthly_weekday: Number(e.target.value) }))}
                        disabled={form.recurrence_monthly_mode !== 'ordinal_weekday'}
                      >
                        {RECURRENCE_WEEKDAYS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                      <span>of every</span>
                      <select
                        className="input-compact !w-[84px] bg-white"
                        value={form.recurrence_interval}
                        onChange={e => setForm(prev => ({ ...prev, recurrence_interval: Number(e.target.value) }))}
                      >
                        {REPEAT_INTERVALS.map(value => <option key={value} value={value}>{value}</option>)}
                      </select>
                      <span>month(s)</span>
                    </label>
                  </div>
                )}

                {form.recurrence_type !== 'none' && (
                  <div className="flex flex-wrap items-center gap-2 text-footnote">
                    <span className="text-ios-secondary shrink-0">Ends</span>
                    <select
                      className="input-compact !w-auto min-w-[170px] bg-white"
                      value={form.recurrence_end_type}
                      onChange={e => setForm(prev => ({ ...prev, recurrence_end_type: e.target.value }))}
                    >
                      {RECURRENCE_END_TYPES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    {form.recurrence_end_type === 'on_date' && (
                      <input
                        className="input-compact !w-auto min-w-[160px] bg-white"
                        type="date"
                        value={form.recurrence_until}
                        onChange={e => setForm(prev => ({ ...prev, recurrence_until: e.target.value }))}
                      />
                    )}
                  </div>
                )}

                {form.recurrence_type !== 'none' && (
                  <p className="text-caption2 text-ios-tertiary">
                    When this task is marked done, the next one is created automatically using the rule above.
                  </p>
                )}
                </div>
              )}
            </div>
          </div>

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
              <button
                onClick={() => window.location.assign(`/dashboard/notes?project=${form.project_id || task.project_id || ''}&task=${task.id}&newNote=1${isCall ? '&source=call' : ''}`)}
                className="btn-secondary flex items-center gap-1.5 text-footnote"
              >
                <Tag className="w-3.5 h-3.5" /> {isCall ? 'Call notes' : 'Notes'}
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
                      {c.profiles?.avatar_url ? (
                        <img src={c.profiles.avatar_url} alt="avatar" className="w-7 h-7 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-7 h-7 bg-ios-blue rounded-full flex items-center justify-center text-white text-caption2 font-bold shrink-0">
                          {(c.profiles?.full_name || c.profiles?.email || '?')[0].toUpperCase()}
                        </div>
                      )}
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
                            {c.content && (
                              <p className="text-subhead whitespace-pre-wrap break-words">{renderCommentText(c.content)}</p>
                      )}
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
            {mentionSuggestions.length > 0 && (
              <div className="ml-12 mb-1 max-w-sm rounded-ios bg-white border border-ios-separator/40 shadow-ios overflow-hidden">
                {mentionSuggestions.map(member => (
                  <button key={member.id} type="button" onMouseDown={e => { e.preventDefault(); insertMention(member); }}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-blue-50 text-left transition-colors">
                    {member.avatar_url ? (
                      <img src={member.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                    ) : (
                      <span className="w-7 h-7 rounded-full bg-ios-blue text-white text-caption2 font-bold flex items-center justify-center shrink-0">
                        {(member.full_name || member.email || '?')[0].toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block text-footnote font-semibold text-ios-primary truncate">{member.full_name || member.email}</span>
                      <span className="block text-caption2 text-ios-tertiary truncate">@{mentionTagFor(member)}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input ref={fileRef} type="file" className="hidden" onChange={e => setCommentFile(e.target.files?.[0] || null)} />
              <button onClick={() => fileRef.current?.click()} className="p-2 rounded-ios hover:bg-ios-fill text-ios-tertiary hover:text-ios-blue" title="Attach file">
                <Paperclip className="w-4 h-4" />
              </button>
              <textarea ref={commentRef} className="input flex-1 resize-none" rows={1} placeholder="Add comment... use @name to tag"
                value={newComment} onChange={e => updateCommentText(e.target.value)}
                style={{minHeight:'38px', maxHeight:'120px', overflowY:'auto'}}
                onInput={e => { e.target.style.height='auto'; e.target.style.height=e.target.scrollHeight+'px'; }}
                onKeyDown={e => {
                  if (e.key === 'Escape') setMentionQuery(null);
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (mentionSuggestions.length > 0) insertMention(mentionSuggestions[0]);
                    else addComment();
                  }
                }} />
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
  const isCall = task.task_type === 'call';

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
        {stripCallMetadata(task.description) && (
          <p className="mt-0.5 text-caption1 text-ios-secondary overflow-hidden"
            style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {stripCallMetadata(task.description)}
          </p>
        )}
        {labels.length > 0 && (
          <div className="flex gap-1 mt-0.5 flex-wrap">
            {labels.slice(0,3).map(l => <span key={l.id} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-white" style={{ background: l.color }}>{l.name}</span>)}
          </div>
        )}
      </div>
      {col && <span className="text-caption2 font-semibold px-2 py-0.5 rounded-full shrink-0 hidden lg:inline" style={{ background: col.color+'25', color: col.color }}>{col.name}</span>}
      <div className="flex items-center gap-2 shrink-0">
        {isCall && <div className="flex items-center gap-0.5 text-ios-blue"><Clock3 className="w-3 h-3" /><span className="text-caption2">Call</span></div>}
        {task.comment_count > 0 && <div className="flex items-center gap-0.5 text-ios-tertiary"><MessageSquare className="w-3 h-3" /><span className="text-caption2">{task.comment_count}</span></div>}
        {task.reminder_at && !done && <div className="flex items-center gap-0.5 text-ios-orange"><Bell className="w-3 h-3" /><span className="text-caption2">Reminder</span></div>}
        {task.recurrence_type && task.recurrence_type !== 'none' && <div className="flex items-center gap-0.5 text-ios-blue"><Repeat2 className="w-3 h-3" /><span className="text-caption2">Repeat</span></div>}
        {isCall && getCallField(task, 'starts_at')
          ? <span className="text-caption1 font-medium text-ios-secondary">{new Date(getCallField(task, 'starts_at')).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</span>
          : task.due_date && <span className={`text-caption1 font-medium ${isOverdue ? 'text-ios-red' : 'text-ios-tertiary'}`}>{new Date(task.due_date).toLocaleDateString('en-US',{day:'numeric',month:'short'})}</span>}
        <QuickTimer task={task} activeTimer={activeTimer} elapsed={elapsed} isPaused={isPaused} onStart={onStartTimer} onStop={onStopTimer} onPause={onPauseTimer} />
        {/* Quick archive button */}
        <button onClick={e => { e.stopPropagation(); onQuickArchive(); }}
          className="p-1 rounded text-ios-tertiary hover:text-ios-orange opacity-0 group-hover:opacity-100 transition-opacity"
          title="Archive">
          <Archive className="w-3.5 h-3.5" />
        </button>
        {assignee && (assignee.avatar_url ? (
          <img src={assignee.avatar_url} alt="avatar" className="w-6 h-6 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-6 h-6 bg-ios-blue rounded-full flex items-center justify-center text-white text-caption2 font-bold">{(assignee.full_name||assignee.email)[0].toUpperCase()}</div>
        ))}
      </div>
    </div>
  );
}



// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function TasksPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlClientId = searchParams.get('client') || '';
  const urlProjectId = searchParams.get('project') || '';
  const urlMode = searchParams.get('mode') || '';
  const urlTaskId = searchParams.get('task') || '';
  const urlTab = searchParams.get('tab') || '';
  const urlNewCall = searchParams.get('newCall') === '1';
  const urlStartsAt = searchParams.get('startsAt') || '';
  const urlEndsAt = searchParams.get('endsAt') || '';
  const taskOpenProcessedRef = useRef(false);
  const newCallProcessedRef = useRef(false);
  // Persist view in localStorage
  const [mode, setMode] = useState(() => {
    try { return localStorage.getItem(VIEW_KEY) || 'list'; } catch { return 'list'; }
  });
  const modeRef = useRef(mode);
  const updateMode = m => { setMode(m); try { localStorage.setItem(VIEW_KEY, m); } catch {} };

  const [projects, setProjects] = useState([]);
  const [access, setAccess] = useState(null);
  const [boardColumns, setBoardColumns] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [archivedTasks, setArchivedTasks] = useState([]);
  const [tasksLoaded, setTasksLoaded] = useState(false);
  const [members, setMembers] = useState([]);
  const [labels, setLabels] = useState([]);
  const [taskLabels, setTaskLabels] = useState({});
  const [currentUser, setCurrentUser] = useState(null);
  const [mainFilter, setMainFilter] = useState(() => {
    try { return localStorage.getItem('sm_member_filter') || 'all'; } catch { return 'all'; }
  });
  const updateMainFilter = (v) => { setMainFilter(v); try { localStorage.setItem('sm_member_filter', v); } catch {} };
  const [filterProject, setFilterProject] = useState('');
  const [viewingUserId, setViewingUserId] = useState(null);
  const viewingUserIdRef = useRef(null);
  const currentUserRef2 = useRef(null); // null = own board
  const [allMembers, setAllMembers] = useState([]);
  const [filterLabel, setFilterLabel] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [search, setSearch] = useState('');
  const [archiveSearch, setArchiveSearch] = useState('');
  const [collapsed, setCollapsed] = useState({});
  const [expandedArchived, setExpandedArchived] = useState({});
  const [archivedVisibleCounts, setArchivedVisibleCounts] = useState({});
  const [archivePageCount, setArchivePageCount] = useState(ARCHIVED_PAGE_SIZE);
  const [dragOver, setDragOver] = useState(null);
  const [dragCol, setDragCol] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [dragTaskId, setDragTaskId] = useState(null);
  const [dragOverTaskId, setDragOverTaskId] = useState(null);
  const [dragOverPosition, setDragOverPosition] = useState('after');
  const [dragTopColId, setDragTopColId] = useState(null);
  const dragPointerRef = useRef({ x: 0, y: 0 });
  const autoScrollColumnIdRef = useRef(null);
  const boardColumnRefs = useRef({});
  const [taskModal, setTaskModal] = useState(null);
  const [newColModal, setNewColModal] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColColor, setNewColColor] = useState('#007AFF');
  const [editColModal, setEditColModal] = useState(null);
  const [editColName, setEditColName] = useState('');
  const [showMemberDrop, setShowMemberDrop] = useState(false);
  const memberRef = useRef(null);

  const { activeTimer, elapsed, isPaused, startTimer, stopTimer, pauseTimer, loadTimer } = useTimer();
  const { isManager, role, profile: userProfile } = useRole();

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    if (urlMode === 'list' || urlMode === 'board' || urlMode === 'archive') updateMode(urlMode);
    if (urlProjectId) setFilterProject(urlProjectId);
    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user;
      setCurrentUser(user);
      currentUserRef2.current = user;
      loadTimer();
    });
    loadAll();
    const interval = setInterval(() => loadTasks(), 45000);
    const onStorage = (e) => { if (e.key === 'sm_tasks_updated') loadTasks(); };
    window.addEventListener('storage', onStorage);
    return () => { clearInterval(interval); window.removeEventListener('storage', onStorage); };
  }, []);

  useEffect(() => {
    if (!tasksLoaded) return;
    loadTasks();
  }, [mode]);

  useEffect(() => {
    if (!dragTaskId) return;

    const onPointerMove = (event) => {
      dragPointerRef.current = { x: event.clientX, y: event.clientY };
    };

    const interval = setInterval(() => {
      const { y } = dragPointerRef.current;
      if (!y) return;

      const viewportMargin = 90;
      const viewportStep = 18;
      if (y > window.innerHeight - viewportMargin) window.scrollBy({ top: viewportStep, behavior: 'auto' });
      if (y < viewportMargin) window.scrollBy({ top: -viewportStep, behavior: 'auto' });

      const activeColumnId = autoScrollColumnIdRef.current;
      const scrollEl = activeColumnId ? boardColumnRefs.current[activeColumnId] : null;
      if (!scrollEl) return;
      const rect = scrollEl.getBoundingClientRect();
      const columnMargin = 70;
      const columnStep = 14;
      if (y > rect.bottom - columnMargin) scrollEl.scrollTop += columnStep;
      else if (y < rect.top + columnMargin) scrollEl.scrollTop -= columnStep;
    }, 32);

    window.addEventListener('dragover', onPointerMove);
    window.addEventListener('pointermove', onPointerMove);
    return () => {
      clearInterval(interval);
      window.removeEventListener('dragover', onPointerMove);
      window.removeEventListener('pointermove', onPointerMove);
      autoScrollColumnIdRef.current = null;
    };
  }, [dragTaskId]);

  useEffect(() => {
    const h = e => { if (memberRef.current && !memberRef.current.contains(e.target)) setShowMemberDrop(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    if (!tasksLoaded || !urlTaskId) return;
    if (taskOpenProcessedRef.current) return;
    const target = [...tasks, ...archivedTasks].find(t => t.id === urlTaskId);
    if (!target) return;
    taskOpenProcessedRef.current = true;
    setTaskModal(target);
    if (target.project_id) setFilterProject(target.project_id);
    if (target.is_archived) updateMode('archive');
    else if (urlMode === 'board') updateMode('board');
    else updateMode('list');
    router.replace('/dashboard/tasks');
  }, [tasksLoaded, urlTaskId, urlMode, tasks, archivedTasks]);

  useEffect(() => {
    if (!tasksLoaded || !urlNewCall || newCallProcessedRef.current) return;
    newCallProcessedRef.current = true;
    const startsAt = urlStartsAt ? toDateTimeLocalValue(urlStartsAt) : '';
    const endsAt = urlEndsAt ? toDateTimeLocalValue(urlEndsAt) : '';
    setTaskModal({
      task_type: 'call',
      assigned_to: viewingUserId || currentUser?.id || '',
      project_id: urlProjectId || '',
      starts_at: startsAt,
      ends_at: endsAt,
      due_date: startsAt ? datePartFromDateTime(startsAt) : '',
      reminder_at: startsAt ? addMinutesToLocalDateTime(startsAt, -10) : '',
    });
    updateMode('list');
    router.replace('/dashboard/tasks');
  }, [tasksLoaded, urlNewCall, urlProjectId, urlStartsAt, urlEndsAt, viewingUserId, currentUser, router]);

  async function loadAll(targetUserId) {
    const accessInfo = await getProjectAccess({ forceRefresh: true });
    setAccess(accessInfo);
    const myUid = accessInfo.user?.id;
    const targetUid = targetUserId || myUid;

    let projectQuery = supabase.from('projects').select('*, clients(id,name)').eq('status','active').order('name');
    if (accessInfo.isRestricted) {
      if (accessInfo.projectIds.length === 0) {
        setProjects([]);
      } else {
        projectQuery = projectQuery.in('id', accessInfo.projectIds);
      }
    }

    const [{ data: proj }, { data: mem }, { data: lbl }] = await Promise.all([
      accessInfo.isRestricted && accessInfo.projectIds.length === 0 ? Promise.resolve({ data: [] }) : projectQuery,
      supabase.from('profiles').select('id,full_name,email,role,avatar_url').or('is_deleted.is.null,is_deleted.eq.false').order('full_name'),
      supabase.from('labels').select('*').order('name'),
    ]);
    setProjects(proj||[]); setMembers(mem||[]); setLabels(lbl||[]);
    setAllMembers(mem||[]);

    await loadColumnsForUser(targetUid, myUid);
    await loadTasks(accessInfo, mem || []);
  }

  async function loadColumnsForUser(targetUid, myUid) {
    const uid = targetUid || myUid;
    if (!uid) return;

    const { data: cols } = await supabase.from('task_columns')
      .select('*').eq('user_id', uid).order('position');

    let finalCols = cols || [];

    // Create default columns for this user if none exist
    if (finalCols.length === 0) {
      const { data: created } = await supabase.from('task_columns')
        .insert(DEFAULT_COLS.map((c, i) => ({ ...c, position: i, user_id: uid }))).select();
      finalCols = created || [];
    }
    setBoardColumns(finalCols);
  }

  async function loadTasks(cachedAccess = null, cachedMembers = null) {
    const accessInfo = cachedAccess || access || await getProjectAccess();
    setAccess(accessInfo);
    const currentUid = accessInfo.user?.id;
    const myRole = accessInfo.role || 'operator';
    const memberList = cachedMembers || allMembers;

    if (accessInfo.isRestricted && accessInfo.projectIds.length === 0) {
      setTasks([]);
      setArchivedTasks([]);
      setTaskLabels({});
      setTasksLoaded(true);
      return;
    }

    // Get role hierarchy for filtering
    let activeQ = supabase.from('tasks').select('*, profiles!tasks_assigned_to_fkey(id,full_name,email,role,avatar_url), projects(id,name,color,client_id,clients(id,name))').or('is_archived.eq.false,is_archived.is.null').order('position');
    const shouldLoadArchived = modeRef.current !== 'board';
    let archivedQ = shouldLoadArchived
      ? supabase.from('tasks').select('*, profiles!tasks_assigned_to_fkey(id,full_name,email,role,avatar_url), projects(id,name,color,client_id,clients(id,name))').eq('is_archived',true).order('archived_at',{ascending:false}).limit(60)
      : null;

    if (accessInfo.isRestricted) {
      activeQ = activeQ.in('project_id', accessInfo.projectIds);
      if (archivedQ) archivedQ = archivedQ.in('project_id', accessInfo.projectIds);
    }

    // Operator: only own tasks
    if (myRole === 'operator') {
      activeQ = activeQ.eq('assigned_to', currentUid);
      if (archivedQ) archivedQ = archivedQ.eq('assigned_to', currentUid);
    }

    const [{ data: activeRaw }, archivedResult] = await Promise.all([
      activeQ,
      archivedQ || Promise.resolve({ data: [] }),
    ]);
    const archivedRaw = archivedResult?.data;

    // Manager: filter out tasks assigned to admins
    let active = activeRaw || [];
    let archived = archivedRaw || [];
    if (myRole === 'manager') {
      const adminSet = new Set((memberList || []).filter(member => member.role === 'admin').map(member => member.id));
      active = active.filter(t => !adminSet.has(t.assigned_to));
      archived = archived.filter(t => !adminSet.has(t.assigned_to));
    }
    const activeIds = (active || []).map(t => t.id);
    let cc = {}, tl = {};
    if (activeIds.length > 0) {
      const [{ data: comments }, { data: tlData }] = await Promise.all([
        supabase.from('task_comments').select('task_id').in('task_id', activeIds),
        supabase.from('task_labels').select('task_id, labels(*)').in('task_id', activeIds),
      ]);
      (comments||[]).forEach(c => cc[c.task_id] = (cc[c.task_id]||0)+1);
      (tlData||[]).forEach(row => { if (!tl[row.task_id]) tl[row.task_id]=[]; if (row.labels) tl[row.task_id].push(row.labels); });
    }
    const meta = t => ({ ...t, comment_count: cc[t.id]||0 });
    setTasks((active||[]).filter(t => t.project_id).map(meta));
    setArchivedTasks((archived||[]).filter(t => t.project_id).map(meta));
    setTaskLabels(tl);
    setTasksLoaded(true);
  }

  async function quickArchive(taskId) {
    // Remove from UI immediately
    setTasks(prev => prev.filter(t => t.id !== taskId));
    await supabase.from('tasks').update({ is_archived: true, archived_at: new Date().toISOString() }).eq('id', taskId);
  }

  async function restoreTask(taskId) {
    await supabase.from('tasks').update({ is_archived: false, archived_at: null }).eq('id', taskId);
    await loadTasks();
  }

  function moveTaskToPosition(srcId, targetColId, beforeTaskId = null) {
    const srcTask = tasks.find(t => t.id === srcId);
    if (!srcTask || !targetColId) return;

    const knownColIds = new Set(boardColumns.map(c => c.id));
    const isFirstCol = boardColumns[0]?.id === targetColId;
    const targetItems = boardTasks
      .filter(t => t.id !== srcId && (t.column_id === targetColId || (isFirstCol && (!t.column_id || !knownColIds.has(t.column_id)))))
      .sort((a, b) => (a.position ?? 9999) - (b.position ?? 9999));
    const foundIndex = beforeTaskId ? targetItems.findIndex(t => t.id === beforeTaskId) : -1;
    const insertAt = beforeTaskId === '__top__' ? 0 : beforeTaskId && foundIndex >= 0 ? foundIndex : targetItems.length;
    const reordered = [...targetItems];
    reordered.splice(insertAt, 0, { ...srcTask, column_id: targetColId });

    flushSync(() => setTasks(prev => {
      const reorderedMap = new Map(reordered.map((t, i) => [t.id, { ...t, column_id: targetColId, position: i }]));
      return prev.map(t => reorderedMap.get(t.id) || t);
    }));

    setTimeout(() => {
      Promise.all(reordered.map((t, i) =>
        supabase.from('tasks').update({ column_id: targetColId, position: i }).eq('id', t.id)
      )).catch(err => {
        console.error('Failed to save task order', err);
        loadTasks();
      });
    }, 120);
  }

  async function addColumn() {
    if (!newColName.trim()) return;
    // Column belongs to the board being viewed
    const colUserId = viewingUserId || currentUser?.id;
    const { data } = await supabase.from('task_columns').insert({
      name: newColName.trim(), color: newColColor,
      position: boardColumns.length,
      user_id: colUserId
    }).select().single();
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
    if (newStatus === 'done') {
      emitMomentProgress({ source: 'task_done', taskId: task.id });
      if (task.recurrence_type && task.recurrence_type !== 'none') {
        await createNextRecurringTask(task);
        await loadTasks();
      }
    }
  }

  async function deleteTask(taskId) {
    if (!confirm('Delete task permanently?')) return;
    await supabase.from('tasks').delete().eq('id', taskId);
    setTaskModal(null);
    loadTasks();
    try { localStorage.setItem('sm_tasks_updated', Date.now().toString()); } catch {}
  }

  async function handleStartTimer(task) { await startTimer({ projectId: task.project_id, taskId: task.id, description: task.title }); }

  // Filters
  const hasFilters = mainFilter!=='all'||filterProject||filterPriority||filterLabel||search||urlClientId;
  const selectedMember = useMemo(() => members.find(m => m.id===mainFilter), [members, mainFilter]);

  const visible = useMemo(() => {
    let next = tasks;
    if (urlClientId) next = next.filter(t => t.projects?.client_id === urlClientId);
    if (mainFilter !== 'all') next = next.filter(t => t.assigned_to===mainFilter);
    if (filterProject) next = next.filter(t => t.project_id===filterProject);
    if (filterPriority) next = next.filter(t => t.priority===filterPriority);
    if (filterLabel) next = next.filter(t => (taskLabels[t.id]||[]).some(l => l.id===filterLabel));
    if (search) {
      const query = search.toLowerCase();
      next = next.filter(t => t.title?.toLowerCase().includes(query));
    }
    return next;
  }, [tasks, urlClientId, mainFilter, filterProject, filterPriority, filterLabel, taskLabels, search]);

  const byProject = useMemo(() => {
    const grouped = {};
    visible.forEach(t => {
      if (!grouped[t.project_id]) grouped[t.project_id] = { project: t.projects, tasks: [] };
      grouped[t.project_id].tasks.push(t);
    });
    return grouped;
  }, [visible]);

  const boardOwner = viewingUserId || currentUser?.id;
  const boardTasks = useMemo(() => {
    let next = boardOwner ? tasks.filter(t => t.assigned_to === boardOwner) : tasks;
    if (urlClientId) next = next.filter(t => t.projects?.client_id === urlClientId);
    if (filterProject) next = next.filter(t => t.project_id===filterProject);
    if (filterPriority) next = next.filter(t => t.priority===filterPriority);
    if (filterLabel) next = next.filter(t => (taskLabels[t.id]||[]).some(l => l.id===filterLabel));
    if (search) {
      const query = search.toLowerCase();
      next = next.filter(t => t.title?.toLowerCase().includes(query));
    }
    return next;
  }, [boardOwner, tasks, urlClientId, filterProject, filterPriority, filterLabel, taskLabels, search]);

  const visibleArchived = useMemo(() => {
    let next = archivedTasks;
    if (urlClientId) next = next.filter(t => t.projects?.client_id === urlClientId);
    if (mainFilter !== 'all') next = next.filter(t => t.assigned_to===mainFilter);
    if (filterProject) next = next.filter(t => t.project_id===filterProject);
    if (filterPriority) next = next.filter(t => t.priority===filterPriority);
    if (filterLabel) next = next.filter(t => (taskLabels[t.id]||[]).some(l => l.id===filterLabel));
    if (search) {
      const query = search.toLowerCase();
      next = next.filter(t => t.title?.toLowerCase().includes(query));
    }
    if (archiveSearch) {
      const q = archiveSearch.toLowerCase();
      next = next.filter(t =>
        t.title?.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.projects?.name?.toLowerCase().includes(q) ||
        t.projects?.clients?.name?.toLowerCase().includes(q)
      );
    }
    return next;
  }, [archivedTasks, urlClientId, mainFilter, filterProject, filterPriority, filterLabel, taskLabels, search, archiveSearch]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
          <h1 className="text-title2 font-bold text-ios-primary">{mode==='archive' ? 'Archive' : 'Tasks'}</h1>
          <p className="text-subhead text-ios-secondary">{mode==='archive' ? `${archivedTasks.length} archived` : hasFilters ? `${visible.length} of ${tasks.length}` : `${tasks.length} tasks`}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-start max-w-full">
          {/* Back or New Task */}
          {mode === 'archive' ? (
            <button onClick={() => updateMode('list')} className="btn-secondary flex items-center gap-1.5 text-footnote">
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
          ) : (
            <>
              <button onClick={() => setTaskModal({})} className="btn-primary flex items-center gap-1.5">
                <Plus className="w-4 h-4" strokeWidth={2.5} /> New Task
              </button>
              <button onClick={() => setTaskModal({ task_type: 'call' })} className="btn-secondary flex items-center gap-1.5 text-footnote">
                <Clock3 className="w-3.5 h-3.5" /> New Call
              </button>
            </>
          )}
          {/* Column button — only in board */}
          {mode === 'board' && (
            <button onClick={() => setNewColModal(true)} className="btn-secondary flex items-center gap-1.5 text-footnote">
              <Plus className="w-3.5 h-3.5" /> Column
            </button>
          )}
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
        </div>
        {mode === 'board' && (role === 'admin' || role === 'manager') && allMembers.length > 1 && (
          <div className="flex flex-col gap-1.5 border-t border-ios-separator/30 pt-3">
            <p className="text-caption2 font-bold uppercase text-ios-tertiary">Boards</p>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full">
              {[{ id: currentUser?.id, label: 'My Board' }, ...allMembers
                .filter(m => m.id !== currentUser?.id && (role === 'admin' || m.role !== 'admin'))
                .map(m => ({ id: m.id, label: m.full_name?.split(' ')[0] || m.email }))
              ].map(item => {
                const effectiveViewing = viewingUserId || currentUser?.id;
                const active = effectiveViewing === item.id;
                return (
                  <button key={item.id} onClick={async () => {
                      const newVid = item.id === currentUser?.id ? null : item.id; setViewingUserId(newVid); viewingUserIdRef.current = newVid;
                      await loadColumnsForUser(item.id, currentUser?.id);
                      await loadTasks();
                    }}
                    className={`px-3.5 py-1.5 rounded-full text-footnote font-semibold whitespace-nowrap transition-all ${active ? 'bg-ios-blue text-white shadow-ios-sm' : 'bg-white border border-ios-separator/40 text-ios-secondary hover:bg-ios-fill'}`}>
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      {mode !== 'archive' && (
        <div className="flex items-stretch sm:items-center gap-2 flex-wrap">
          {mode === 'list' && role !== 'operator' && (
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
            <input className="input pl-9 w-full sm:w-36 py-2 text-footnote" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}/>
          </div>
          <select className="input py-2 text-footnote w-full sm:w-36" value={filterProject} onChange={e => setFilterProject(e.target.value)}>
            <option value="">All projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className="input py-2 text-footnote w-full sm:w-36" value={filterLabel} onChange={e => setFilterLabel(e.target.value)}>
            <option value="">All labels</option>
            {labels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select className="input py-2 text-footnote w-full sm:w-32" value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
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

      {!tasksLoaded && (
        <div className="card p-10 text-center">
          <p className="text-subhead font-semibold text-ios-secondary">Loading tasks...</p>
        </div>
      )}

      {/* LIST */}
      {tasksLoaded && mode === 'list' && (
        <div className="card overflow-hidden">
          {Object.keys(byProject).length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-subhead text-ios-secondary mb-4">{hasFilters ? 'No tasks match filters' : 'No tasks yet'}</p>
              <div className="flex items-center justify-center gap-2">
                <button onClick={() => setTaskModal({})} className="btn-primary">New Task</button>
                <button onClick={() => setTaskModal({ task_type: 'call' })} className="btn-secondary">New Call</button>
              </div>
            </div>
          ) : Object.entries(byProject).map(([pid, { project, tasks: projTasks }]) => {
            const openTasks = projTasks.filter(t => t.status!=='done');
            const doneTasks = projTasks.filter(t => t.status==='done');
            const archivedForProject = visibleArchived.filter(t => t.project_id === pid);
            const archivedOpen = expandedArchived[pid] === true;
            const archivedCount = archivedVisibleCounts[pid] || ARCHIVED_PAGE_SIZE;
            const shownArchived = archivedForProject.slice(0, archivedCount);
            const isCollapsed = collapsed[pid];
            return (
              <div key={pid}>
                <div className="task-project-sticky flex items-center justify-between px-4 py-2.5 bg-ios-bg border-b border-ios-separator/30 sticky top-0 z-10">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setCollapsed(p => ({ ...p, [pid]: !isCollapsed }))} className="text-ios-tertiary hover:text-ios-primary">
                      <ChevronDown className={`w-4 h-4 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}/>
                    </button>
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: project?.color||'#007AFF' }}/>
                    <span className="text-subhead font-bold text-ios-primary">{project?.name}</span>
                    {project?.clients?.name && <span className="text-footnote text-ios-secondary">· {project.clients.name}</span>}
                    <span className="text-caption1 text-ios-tertiary bg-white border border-ios-separator px-1.5 py-0.5 rounded-full font-semibold">{openTasks.length}</span>
                  </div>
                  <button onClick={() => setTaskModal({})} className="p-1.5 rounded-ios hover:bg-ios-fill text-ios-tertiary hover:text-ios-blue">
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
                {!isCollapsed && archivedForProject.length > 0 && (
                  <div className="border-t border-ios-separator/20 bg-orange-50/30">
                    <button onClick={() => setExpandedArchived(p => ({ ...p, [pid]: !archivedOpen }))}
                      className="flex items-center gap-2 w-full px-4 py-2 text-footnote text-ios-orange hover:bg-orange-50">
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${!archivedOpen ? '-rotate-90' : ''}`}/>
                      {archivedOpen ? `Hide ${archivedForProject.length} archived tasks` : `Show ${archivedForProject.length} archived tasks`}
                    </button>
                    {archivedOpen && (
                      <>
                        {shownArchived.map(t => (
                          <div key={t.id} onClick={() => setTaskModal(t)}
                            className="flex items-center gap-3 px-4 py-3 border-t border-ios-separator/20 hover:bg-orange-50/60 cursor-pointer opacity-80">
                            <Archive className="w-4 h-4 text-ios-orange shrink-0"/>
                            <div className="flex-1 min-w-0">
                              <p className="text-subhead text-ios-secondary line-through truncate">{t.title}</p>
                              <p className="text-caption1 text-ios-tertiary">Archived {fmtDate(t.archived_at)}</p>
                            </div>
                            <button onClick={e => { e.stopPropagation(); restoreTask(t.id); }}
                              className="px-2.5 py-1.5 rounded-ios bg-white text-caption1 font-semibold text-ios-blue hover:bg-blue-50">
                              Restore
                            </button>
                          </div>
                        ))}
                        {archivedCount < archivedForProject.length && (
                          <button onClick={() => setArchivedVisibleCounts(p => ({ ...p, [pid]: archivedCount + ARCHIVED_PAGE_SIZE }))}
                            className="w-full px-4 py-2.5 border-t border-ios-separator/20 text-footnote font-semibold text-ios-orange hover:bg-orange-50">
                            Show 10 more archived tasks
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* BOARD */}
      {tasksLoaded && mode === 'board' && (
        <div className="flex gap-3 overflow-x-auto pb-4 h-[calc(100vh-230px)] min-h-[520px]">
          {boardColumns.map(col => {
            const knownColIds = new Set(boardColumns.map(c => c.id));
            const isFirstCol = boardColumns[0]?.id === col.id;
            const orphanTasks = isFirstCol
              ? boardTasks.filter(t => !t.column_id || !knownColIds.has(t.column_id))
              : [];
            const colTasks = [...boardTasks.filter(t => t.column_id === col.id), ...orphanTasks]
              .sort((a, b) => (a.position ?? 9999) - (b.position ?? 9999));
            const isDragTarget = dragOver===col.id;
            return (
              <div key={col.id}
                className={`shrink-0 w-72 rounded-ios-lg p-3 transition-all flex flex-col min-h-0 ${isDragTarget ? 'bg-blue-50 ring-2 ring-ios-blue' : dragOverCol === col.id && dragCol !== col.id ? 'ring-2 ring-ios-orange ring-dashed' : 'bg-ios-bg'}`}
                onDragOver={e => {
                  e.preventDefault();
                  autoScrollColumnIdRef.current = col.id;
                  if (dragCol) {
                    if (dragOverCol !== col.id) setDragOverCol(col.id);
                  } else if (dragOver !== col.id) {
                    setDragOver(col.id);
                  }
                }}
                onDragLeave={() => { setDragOver(null); setDragOverCol(null); }}
                onDrop={e => { if (dragCol) { reorderColumns(dragCol, col.id); setDragCol(null); setDragOverCol(null); } else { moveTaskToPosition(e.dataTransfer.getData('taskId'), col.id); setDragOver(null); } }}>
                <ColHeader col={col}
                  onRename={() => { setEditColModal(col); setEditColName(col.name); }}
                  onDelete={() => deleteColumn(col)}
                  onAdd={colId => setTaskModal({ column_id: colId, assigned_to: viewingUserId || currentUser?.id || '' })}
                  onDragStart={() => setDragCol(col.id)}
                  onDragEnd={() => { setDragCol(null); setDragOverCol(null); }} />
                <div
                  ref={el => { if (el) boardColumnRefs.current[col.id] = el; else delete boardColumnRefs.current[col.id]; }}
                  className="space-y-2 flex-1 overflow-y-auto pr-1 min-h-0"
                >
                  {colTasks.length > 0 && (
                    <div className={`rounded-ios border-2 border-dashed flex items-center justify-center transition-all ${dragTopColId === col.id ? 'h-10 border-ios-blue bg-blue-50 text-ios-blue' : dragTaskId ? 'h-8 border-ios-blue/30 bg-blue-50/40 text-ios-blue/70' : 'h-4 border-transparent text-transparent'}`}
                      onDragEnter={e => { e.preventDefault(); if (!dragCol && dragTopColId !== col.id) setDragTopColId(col.id); }}
                      onDragOver={e => {
                        e.preventDefault();
                        autoScrollColumnIdRef.current = col.id;
                        if (!dragCol) {
                          if (dragTopColId !== col.id) setDragTopColId(col.id);
                          if (dragOver !== col.id) setDragOver(col.id);
                        }
                      }}
                      onDragLeave={() => setDragTopColId(null)}
                      onDrop={async e => {
                        e.preventDefault(); e.stopPropagation();
                        const srcId = e.dataTransfer.getData('taskId');
                        if (srcId) moveTaskToPosition(srcId, col.id, '__top__');
                        setDragTopColId(null); setDragOver(null); setDragTaskId(null); setDragOverTaskId(null);
                      }}>
                      <span className="text-caption2 font-semibold">Drop as first</span>
                    </div>
                  )}
                  {colTasks.map(task => {
                    const pri = PRIORITY[task.priority];
                    const assignee = members.find(m => m.id===task.assigned_to);
                    const labels = taskLabels[task.id]||[];
                    const isDone = task.status==='done';
                    const isTimerActive = activeTimer?.task_id===task.id;
                    const isCall = task.task_type === 'call';
                    return (
                      <div key={task.id} draggable
                        onDragStart={e => { e.dataTransfer.setData('taskId', task.id); setDragTaskId(task.id); autoScrollColumnIdRef.current = col.id; }}
                        onDragEnd={() => { setDragOver(null); setDragTaskId(null); setDragOverTaskId(null); setDragOverPosition('after'); setDragTopColId(null); autoScrollColumnIdRef.current = null; }}
                        onDragOver={e => {
                          e.preventDefault();
                          autoScrollColumnIdRef.current = col.id;
                          const rect = e.currentTarget.getBoundingClientRect();
                          const nextPosition = e.clientY > rect.top + rect.height / 2 ? 'after' : 'before';
                          if (dragOverTaskId !== task.id) setDragOverTaskId(task.id);
                          if (dragOverPosition !== nextPosition) setDragOverPosition(nextPosition);
                        }}
                        onDrop={async e => {
                          e.preventDefault(); e.stopPropagation();
                          const srcId = e.dataTransfer.getData('taskId');
                          if (!srcId || srcId === task.id) { setDragOverTaskId(null); return; }
                          const rect = e.currentTarget.getBoundingClientRect();
                          const dropAfter = e.clientY > rect.top + rect.height / 2;
                          const ordered = colTasks
                            .filter(t => t.id !== srcId)
                            .sort((a, b) => (a.position ?? 9999) - (b.position ?? 9999));
                          const targetIndex = ordered.findIndex(t => t.id === task.id);
                          const beforeTaskId = dropAfter ? ordered[targetIndex + 1]?.id || null : task.id;
                          moveTaskToPosition(srcId, col.id, beforeTaskId);
                          setDragOver(null); setDragOverTaskId(null); setDragTaskId(null); setDragOverPosition('after'); setDragTopColId(null);
                        }}
                        onClick={() => setTaskModal(task)}
                        className={`relative bg-white rounded-ios border p-2.5 cursor-pointer hover:shadow-ios transition-all select-none group ${dragOverTaskId === task.id && dragTaskId !== task.id ? 'border-ios-blue shadow-ios-lg scale-[1.01]' : ''} ${isDone ? 'opacity-50' : isTimerActive ? 'border-ios-blue bg-blue-50/30' : 'border-ios-separator/50'}`}>

                        {dragOverTaskId === task.id && dragTaskId !== task.id && (
                          <div className={`absolute left-2 right-2 h-1 rounded-full bg-ios-blue shadow-ios ${dragOverPosition === 'before' ? '-top-1.5' : '-bottom-1.5'}`} />
                        )}

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

                        {stripCallMetadata(task.description) && (
                          <p className="mt-1.5 text-[11px] leading-snug text-ios-secondary overflow-hidden"
                            style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                            {stripCallMetadata(task.description)}
                          </p>
                        )}

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
                            {isCall && (
                              <div className="flex items-center gap-0.5 text-ios-blue shrink-0">
                                <Clock3 className="w-3 h-3"/><span className="text-[10px]">Call</span>
                              </div>
                            )}
                            {task.reminder_at && !isDone && (
                              <div className="flex items-center gap-0.5 text-ios-orange shrink-0">
                                <Bell className="w-3 h-3"/><span className="text-[10px]">Reminder</span>
                              </div>
                            )}
                            {task.recurrence_type && task.recurrence_type !== 'none' && (
                              <div className="flex items-center gap-0.5 text-ios-blue shrink-0">
                                <Repeat2 className="w-3 h-3"/><span className="text-[10px]">Repeat</span>
                              </div>
                            )}
                            {pri && task.priority !== 'medium' && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{background:pri.dot}}>{pri.label}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {isCall && getCallField(task, 'starts_at')
                              ? <span className="text-[10px] text-ios-tertiary">{new Date(getCallField(task, 'starts_at')).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</span>
                              : task.due_date && <span className="text-[10px] text-ios-tertiary">{new Date(task.due_date).toLocaleDateString('en-US',{day:'numeric',month:'short'})}</span>}
                            {assignee && (assignee.avatar_url ? (
                              <img src={assignee.avatar_url} alt="avatar" className="w-5 h-5 rounded-full object-cover shrink-0" />
                            ) : (
                              <div className="w-5 h-5 bg-ios-blue rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0">
                                {(assignee.full_name||assignee.email)[0].toUpperCase()}
                              </div>
                            ))}
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
                  <div className={`rounded-ios border-2 border-dashed flex flex-col items-center justify-center gap-1 transition-all ${isDragTarget ? 'border-ios-blue bg-blue-50 h-20' : colTasks.length === 0 ? 'h-20 border-ios-separator/50 opacity-50' : 'h-3 border-transparent'}`}
                    onDragOver={e => { e.preventDefault(); if (dragOver !== col.id) setDragOver(col.id); }}
                    onDrop={async e => {
                      e.preventDefault();
                      const srcId = e.dataTransfer.getData('taskId');
                      if (srcId) {
                        moveTaskToPosition(srcId, col.id);
                        setDragOver(null); setDragTaskId(null); setDragTopColId(null);
                      }
                    }}>
                    {(isDragTarget || colTasks.length === 0) && (
                      <>
                        <Kanban className={`w-4 h-4 ${isDragTarget ? 'text-ios-blue' : 'text-ios-label4'}`} />
                        <p className={`text-caption2 font-medium ${isDragTarget ? 'text-ios-blue' : 'text-ios-label4'}`}>{isDragTarget ? 'Drop here' : 'Drop tasks here'}</p>
                      </>
                    )}
                  </div>
                  <button onClick={() => setTaskModal({
                      column_id: col.id,
                      assigned_to: viewingUserId || currentUser?.id || '',
                    })}
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
      {tasksLoaded && mode === 'archive' && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-tertiary" />
            <input className="input pl-10" placeholder="Search archived tasks..." value={archiveSearch} onChange={e => setArchiveSearch(e.target.value)} />
          </div>
          <div className="card overflow-hidden">
            {visibleArchived.length === 0 ? (
              <div className="p-12 text-center"><Archive className="w-8 h-8 text-ios-label4 mx-auto mb-3"/><p className="text-subhead text-ios-secondary">{archiveSearch ? 'No archived tasks found' : 'No archived tasks'}</p></div>
            ) : (
              <>
                {visibleArchived.slice(0, archivePageCount).map(task => {
            const assignee = members.find(m => m.id===task.assigned_to);
            return (
              <div key={task.id} onClick={() => setTaskModal(task)}
                className="flex items-center gap-3 px-4 py-3 border-b border-ios-separator/20 hover:bg-ios-bg/50 cursor-pointer opacity-70">
                <Archive className="w-4 h-4 text-ios-tertiary shrink-0"/>
                <div className="flex-1 min-w-0">
                  <p className="text-subhead text-ios-secondary line-through truncate">{task.title}</p>
                  <p className="text-caption1 text-ios-tertiary">{task.projects?.name} · Archived {fmtDate(task.archived_at)}</p>
                </div>
                {assignee && (assignee.avatar_url ? (
                  <img src={assignee.avatar_url} alt="avatar" className="w-6 h-6 rounded-full object-cover shrink-0 opacity-80" />
                ) : (
                  <div className="w-6 h-6 bg-ios-fill rounded-full flex items-center justify-center text-ios-tertiary text-caption2 font-bold">{(assignee.full_name||assignee.email)[0].toUpperCase()}</div>
                ))}
              </div>
            );
              })}
              {archivePageCount < visibleArchived.length && (
                <button onClick={() => setArchivePageCount(c => c + ARCHIVED_PAGE_SIZE)}
                  className="w-full px-4 py-3 text-footnote font-semibold text-ios-blue hover:bg-blue-50 border-t border-ios-separator/20">
                  Show 10 more archived tasks
                </button>
              )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {taskModal !== null && (
        <TaskDetail task={taskModal} members={members} boardColumns={boardColumns} projects={projects} labels={labels} existingTasks={tasks}
          activeTimer={activeTimer} elapsed={elapsed} currentUser={currentUser}
          actorProfile={userProfile}
          initialTab={urlTab === 'comments' ? 'comments' : undefined}
          onClose={() => setTaskModal(null)}
          onSave={() => { setTaskModal(null); loadTasks(); try { localStorage.setItem('sm_tasks_updated', Date.now().toString()); } catch {} }}
          onDelete={() => deleteTask(taskModal.id)}
          onProjectCreated={project => setProjects(prev => [...prev, project].sort((a,b) => a.name.localeCompare(b.name)))}
          onLabelsChange={setLabels}
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
