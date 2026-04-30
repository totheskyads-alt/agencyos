'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Modal from '@/components/Modal';
import { supabase } from '@/lib/supabase';
import { getProjectAccess } from '@/lib/projectAccess';
import { useRole } from '@/lib/useRole';
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Phone,
  Plus,
  Search,
  Users,
} from 'lucide-react';

const DAY_START_HOUR = 0;
const DAY_END_HOUR = 24;
const HOUR_HEIGHT = 56;
const DEFAULT_CALL_DURATION_MINUTES = 30;
const QUICK_DURATIONS = [15, 30, 45, 60];

function startOfWeek(date) {
  const next = new Date(date);
  const day = next.getDay();
  const diff = (day + 6) % 7;
  next.setDate(next.getDate() - diff);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function fmtDayHeader(date) {
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function fmtRange(start, view) {
  const end = addDays(start, view === 'week' ? 6 : 0);
  const startLabel = start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const endLabel = end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return view === 'week' ? `${startLabel} - ${endLabel}` : endLabel;
}

function fmtTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function addMinutes(date, minutes) {
  const next = new Date(date);
  next.setMinutes(next.getMinutes() + minutes);
  return next;
}

function toDateInputValue(date) {
  if (!date || Number.isNaN(date.getTime())) return '';
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toTimeInputValue(date) {
  if (!date || Number.isNaN(date.getTime())) return '';
  const pad = value => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDateAndTime(dateValue, timeValue) {
  if (!dateValue || !timeValue) return null;
  const date = new Date(`${dateValue}T${timeValue}:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getNextRoundedSlot() {
  const base = new Date();
  base.setSeconds(0, 0);
  const roundedMinutes = Math.ceil(base.getMinutes() / 30) * 30;
  if (roundedMinutes === 60) {
    base.setHours(base.getHours() + 1, 0, 0, 0);
  } else {
    base.setMinutes(roundedMinutes, 0, 0);
  }
  return {
    start: base,
    end: addMinutes(base, DEFAULT_CALL_DURATION_MINUTES),
  };
}

function getEffectiveStart(task) {
  if (task?.starts_at) {
    const date = new Date(task.starts_at);
    if (!Number.isNaN(date.getTime())) return date;
  }
  if (task?.task_type === 'call' && task?.reminder_at) {
    const reminder = new Date(task.reminder_at);
    if (!Number.isNaN(reminder.getTime())) return addMinutes(reminder, 10);
  }
  if (task?.task_type === 'call' && task?.due_date) {
    const fallback = new Date(`${task.due_date}T09:00:00`);
    if (!Number.isNaN(fallback.getTime())) return fallback;
  }
  return null;
}

function getEffectiveEnd(task) {
  if (task?.ends_at) {
    const date = new Date(task.ends_at);
    if (!Number.isNaN(date.getTime())) return date;
  }
  const start = getEffectiveStart(task);
  return start ? addMinutes(start, 30) : null;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function eventStyle(task) {
  const start = getEffectiveStart(task);
  const end = getEffectiveEnd(task);
  if (!start || !end) return { top: '0px', height: '0px' };
  const startMinutes = clamp((start.getHours() - DAY_START_HOUR) * 60 + start.getMinutes(), 0, (DAY_END_HOUR - DAY_START_HOUR) * 60);
  const endMinutes = clamp((end.getHours() - DAY_START_HOUR) * 60 + end.getMinutes(), startMinutes + 30, (DAY_END_HOUR - DAY_START_HOUR) * 60);
  return {
    top: `${(startMinutes / 60) * HOUR_HEIGHT}px`,
    height: `${Math.max(((endMinutes - startMinutes) / 60) * HOUR_HEIGHT, 36)}px`,
  };
}

function totalMinutes(tasks) {
  return tasks.reduce((sum, task) => {
    const start = getEffectiveStart(task);
    const end = getEffectiveEnd(task);
    if (!start || !end) return sum;
    return sum + Math.max(30, Math.round((end.getTime() - start.getTime()) / 60000));
  }, 0);
}

export default function CalendarPage() {
  const router = useRouter();
  const { role } = useRole();
  const [view, setView] = useState('week');
  const [anchorDate, setAnchorDate] = useState(() => startOfWeek(new Date()));
  const [projects, setProjects] = useState([]);
  const [members, setMembers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedAssignee, setSelectedAssignee] = useState('');
  const [projectAccess, setProjectAccess] = useState(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const [quickCall, setQuickCall] = useState(null);
  const [savingQuickCall, setSavingQuickCall] = useState(false);
  const [quickProjectSearch, setQuickProjectSearch] = useState('');
  const [showQuickProjectDrop, setShowQuickProjectDrop] = useState(false);
  const quickProjectRef = useRef(null);

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClickOutside(event) {
      if (quickProjectRef.current && !quickProjectRef.current.contains(event.target)) {
        setShowQuickProjectDrop(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function load() {
    setLoading(true);
    const access = await getProjectAccess({ forceRefresh: true });
    setProjectAccess(access);
    const user = access.user;
    setCurrentUser(user);
    setSelectedAssignee(user?.id || '');

    let projectQuery = supabase
      .from('projects')
      .select('id,name,color,client_id,clients(id,name)')
      .eq('status', 'active')
      .order('name');

    if (access.isRestricted) {
      if (!access.projectIds?.length) {
        setProjects([]);
        setTasks([]);
        setLoading(false);
        return;
      }
      projectQuery = projectQuery.in('id', access.projectIds);
    }

    const [{ data: projectData }, { data: memberData }] = await Promise.all([
      projectQuery,
      supabase.from('profiles').select('id,full_name,email,role,avatar_url').or('is_deleted.is.null,is_deleted.eq.false').order('full_name'),
    ]);

    setProjects(projectData || []);
    setMembers(memberData || []);
    setLoading(false);
  }

  useEffect(() => {
    if (!currentUser) return;
    loadScheduledTasks();
  }, [currentUser, selectedAssignee, anchorDate, view, projects.length]);

  useEffect(() => {
    if (!currentUser) return undefined;

    const refresh = () => loadScheduledTasks();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [currentUser, selectedAssignee, anchorDate, view]);

async function loadScheduledTasks() {
  const access = await getProjectAccess();
  const rangeStart = new Date(anchorDate);
  const rangeEnd = addDays(anchorDate, view === 'week' ? 7 : 1);

  const targetAssignee = selectedAssignee || currentUser?.id;
  const buildQuery = (selectClause, orderColumn = 'updated_at') => {
    let query = supabase
      .from('tasks')
      .select(selectClause)
      .or('is_archived.eq.false,is_archived.is.null')
      .neq('status', 'done')
      .order(orderColumn, { ascending: false });

    if (access.isRestricted) query = query.in('project_id', access.projectIds);
    return query;
  };

  let result = await buildQuery('*, profiles!tasks_assigned_to_fkey(id,full_name,email,avatar_url), projects(id,name,color,client_id,clients(id,name))');
  if (result.error && /(starts_at|ends_at)/i.test(result.error.message || '')) {
    result = await buildQuery('id,title,description,status,priority,assigned_to,project_id,column_id,due_date,reminder_at,position,task_type,created_at,is_archived,profiles!tasks_assigned_to_fkey(id,full_name,email,avatar_url),projects(id,name,color,client_id,clients(id,name))', 'created_at');
  }
  if (result.error && /updated_at/i.test(result.error.message || '')) {
    result = await buildQuery('id,title,description,status,priority,assigned_to,project_id,column_id,due_date,reminder_at,position,task_type,created_at,is_archived,profiles!tasks_assigned_to_fkey(id,full_name,email,avatar_url),projects(id,name,color,client_id,clients(id,name))', 'created_at');
  }

  const { data, error } = result;
  if (error) {
    console.warn('Calendar tasks could not be loaded', error);
    setTasks([]);
      return;
    }

    const filtered = (data || []).filter(task => {
      if (targetAssignee && task.assigned_to && task.assigned_to !== targetAssignee) return false;
      if (targetAssignee && !task.assigned_to && task.task_type !== 'call') return false;
      const effectiveStart = getEffectiveStart(task);
      if (!effectiveStart) return false;
      return effectiveStart >= rangeStart && effectiveStart < rangeEnd;
    }).sort((a, b) => {
      const aStart = getEffectiveStart(a)?.getTime() || 0;
      const bStart = getEffectiveStart(b)?.getTime() || 0;
      return aStart - bStart;
    });

    setTasks(filtered);
  }

  function openQuickCall(day, minuteOffset) {
    const start = new Date(day);
    start.setHours(DAY_START_HOUR, 0, 0, 0);
    start.setMinutes(minuteOffset);
    const end = addMinutes(start, DEFAULT_CALL_DURATION_MINUTES);
    setQuickCall({
      title: '',
      project_id: '',
      assigned_to: selectedAssignee || currentUser?.id || '',
      date: toDateInputValue(start),
      start_time: toTimeInputValue(start),
      end_time: toTimeInputValue(end),
      duration: DEFAULT_CALL_DURATION_MINUTES,
      meeting_link: '',
    });
    setQuickProjectSearch('');
    setShowQuickProjectDrop(true);
  }

  function openFreshQuickCall() {
    const { start, end } = getNextRoundedSlot();
    setQuickCall({
      title: '',
      project_id: '',
      assigned_to: selectedAssignee || currentUser?.id || '',
      date: toDateInputValue(start),
      start_time: toTimeInputValue(start),
      end_time: toTimeInputValue(end),
      duration: DEFAULT_CALL_DURATION_MINUTES,
      meeting_link: '',
    });
    setQuickProjectSearch('');
    setShowQuickProjectDrop(true);
  }

  async function saveQuickCall() {
    if (!quickCall?.project_id || !quickCall?.date || !quickCall?.start_time || !quickCall?.end_time) {
      alert('Please choose the project, date, and time first.');
      return;
    }

    const startsAt = fromDateAndTime(quickCall.date, quickCall.start_time);
    const endsAt = fromDateAndTime(quickCall.date, quickCall.end_time);
    if (!startsAt || !endsAt || endsAt <= startsAt) {
      alert('Please choose a valid call time.');
      return;
    }

    const reminderAt = addMinutes(startsAt, -10);
    const payload = {
      title: quickCall.title?.trim() || 'Call',
      task_type: 'call',
      project_id: quickCall.project_id,
      assigned_to: quickCall.assigned_to || currentUser?.id || null,
      priority: 'medium',
      status: 'todo',
      position: 9999,
      due_date: quickCall.date,
      reminder_at: reminderAt.toISOString(),
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      meeting_link: quickCall.meeting_link?.trim() || null,
      column_id: null,
    };

    setSavingQuickCall(true);
    let result = await supabase.from('tasks').insert(payload).select().single();
    if (result.error && /(starts_at|ends_at|meeting_link)/i.test(result.error.message || '')) {
      const { starts_at, ends_at, meeting_link, ...fallbackPayload } = payload;
      result = await supabase.from('tasks').insert(fallbackPayload).select().single();
    }

    if (result.error) {
      setSavingQuickCall(false);
      alert(result.error.message || 'The call could not be saved.');
      return;
    }

    const optimisticTask = {
      ...result.data,
      ...payload,
      projects: projects.find(project => project.id === payload.project_id) || null,
    };

    if (payload.project_id && payload.assigned_to) {
      try {
        const accessModule = await import('@/lib/projectAccess');
        await accessModule.grantProjectAccess(payload.project_id, payload.assigned_to);
      } catch {}
    }

    setSavingQuickCall(false);
    setQuickCall(null);
    setTasks(prev => {
      const next = [optimisticTask, ...prev.filter(task => task.id !== optimisticTask.id)];
      return next.sort((a, b) => {
        const aStart = getEffectiveStart(a)?.getTime() || 0;
        const bStart = getEffectiveStart(b)?.getTime() || 0;
        return aStart - bStart;
      });
    });
    await loadScheduledTasks();
  }

  const visibleDays = useMemo(() => {
    const count = view === 'week' ? 7 : 1;
    return Array.from({ length: count }, (_, index) => addDays(anchorDate, index));
  }, [anchorDate, view]);

  const dayBuckets = useMemo(() => {
    return visibleDays.map(day => ({
      day,
      items: tasks.filter(task => {
        const startsAt = getEffectiveStart(task);
        return startsAt && isSameDay(startsAt, day);
      }),
    }));
  }, [tasks, visibleDays]);

  const todaysTasks = useMemo(() => {
    const today = new Date();
    return tasks.filter(task => {
      const startsAt = getEffectiveStart(task);
      return startsAt && isSameDay(startsAt, today);
    });
  }, [tasks]);

  const callsThisWeek = useMemo(() => tasks.filter(task => task.task_type === 'call').length, [tasks]);
  const busyHours = useMemo(() => (totalMinutes(tasks) / 60).toFixed(1), [tasks]);
  const freeHours = useMemo(() => {
    const totalHours = (view === 'week' ? 7 : 1) * (DAY_END_HOUR - DAY_START_HOUR);
    return Math.max(0, totalHours - totalMinutes(tasks) / 60).toFixed(1);
  }, [tasks, view]);

  const selectableMembers = useMemo(() => {
    if (role === 'operator') return members.filter(member => member.id === currentUser?.id);
    if (role === 'manager') return members.filter(member => member.role !== 'admin');
    return members;
  }, [members, role, currentUser]);

  const selectedQuickProject = useMemo(
    () => projects.find(project => project.id === quickCall?.project_id) || null,
    [projects, quickCall?.project_id]
  );

  const filteredQuickProjects = useMemo(() => {
    const needle = quickProjectSearch.trim().toLowerCase();
    if (!needle) return projects;
    return projects.filter(project => {
      const clientName = project.clients?.name || '';
      return project.name.toLowerCase().includes(needle) || clientName.toLowerCase().includes(needle);
    });
  }, [projects, quickProjectSearch]);

  useEffect(() => {
    if (!quickCall) {
      setQuickProjectSearch('');
      setShowQuickProjectDrop(false);
      return;
    }
    if (selectedQuickProject && quickProjectSearch !== selectedQuickProject.name && !showQuickProjectDrop) {
      setQuickProjectSearch(selectedQuickProject.name);
    }
  }, [quickCall, selectedQuickProject, quickProjectSearch, showQuickProjectDrop]);

  const nowLine = useMemo(() => {
    if (now.getHours() < DAY_START_HOUR || now.getHours() >= DAY_END_HOUR) return null;
    const minutes = (now.getHours() - DAY_START_HOUR) * 60 + now.getMinutes();
    return `${(minutes / 60) * HOUR_HEIGHT}px`;
  }, [now]);

  const nowLabel = useMemo(() => {
    return now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }, [now]);

  const quickCallEndPreview = useMemo(() => {
    if (!quickCall?.end_time) return '';
    const end = fromDateAndTime(quickCall.date, quickCall.end_time);
    return end ? fmtTime(end) : '';
  }, [quickCall]);

  const quickDurationSelection = useMemo(() => {
    if (!quickCall?.date || !quickCall?.start_time || !quickCall?.end_time) return null;
    const start = fromDateAndTime(quickCall.date, quickCall.start_time);
    const end = fromDateAndTime(quickCall.date, quickCall.end_time);
    if (!start || !end || end <= start) return null;
    const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
    return QUICK_DURATIONS.includes(minutes) ? minutes : null;
  }, [quickCall]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-title2 font-bold text-ios-primary">Calendar</h1>
            <p className="text-subhead text-ios-secondary">See your calls and scheduled work at a glance.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {(role === 'admin' || role === 'manager') && (
              <div className="flex items-center gap-2 rounded-ios bg-ios-fill px-3 py-2">
                <Users className="w-4 h-4 text-ios-tertiary" />
                <select
                  className="bg-transparent text-footnote text-ios-primary focus:outline-none"
                  value={selectedAssignee}
                  onChange={e => setSelectedAssignee(e.target.value)}
                >
                  {selectableMembers.map(member => (
                    <option key={member.id} value={member.id}>
                      {member.full_name || member.email}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button onClick={openFreshQuickCall} className="btn-primary flex items-center gap-1.5">
              <Phone className="w-4 h-4" /> New Call
            </button>
            <button onClick={() => router.push('/dashboard/tasks')} className="btn-secondary flex items-center gap-1.5 text-footnote">
              <Plus className="w-3.5 h-3.5" /> New Task
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="card p-4">
            <p className="text-caption1 font-semibold uppercase tracking-wide text-ios-tertiary">Today</p>
            <p className="mt-1 text-title2 font-bold text-ios-primary">{todaysTasks.length}</p>
            <p className="text-footnote text-ios-secondary">scheduled items</p>
          </div>
          <div className="card p-4">
            <p className="text-caption1 font-semibold uppercase tracking-wide text-ios-tertiary">Calls</p>
            <p className="mt-1 text-title2 font-bold text-ios-primary">{callsThisWeek}</p>
            <p className="text-footnote text-ios-secondary">{view === 'week' ? 'this week' : 'today'}</p>
          </div>
          <div className="card p-4">
            <p className="text-caption1 font-semibold uppercase tracking-wide text-ios-tertiary">Free time</p>
            <p className="mt-1 text-title2 font-bold text-ios-primary">{freeHours}h</p>
            <p className="text-footnote text-ios-secondary">busy {busyHours}h in this view</p>
          </div>
        </div>
      </div>

      <div className="card p-4 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <button onClick={() => setAnchorDate(prev => addDays(prev, view === 'week' ? -7 : -1))} className="p-2 rounded-ios hover:bg-ios-fill text-ios-secondary">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => setAnchorDate(view === 'week' ? startOfWeek(new Date()) : new Date())} className="btn-secondary text-footnote">
              Today
            </button>
            <button onClick={() => setAnchorDate(prev => addDays(prev, view === 'week' ? 7 : 1))} className="p-2 rounded-ios hover:bg-ios-fill text-ios-secondary">
              <ChevronRight className="w-4 h-4" />
            </button>
            <div>
              <p className="text-subhead font-semibold text-ios-primary">{fmtRange(anchorDate, view)}</p>
            </div>
          </div>

          <div className="flex gap-1 rounded-ios bg-ios-fill p-1">
            {['day', 'week'].map(option => (
              <button
                key={option}
                onClick={() => setView(option)}
                className={`px-3 py-1.5 rounded-ios-sm text-footnote font-semibold transition-all ${
                  view === option ? 'bg-white text-ios-primary shadow-ios-sm' : 'text-ios-secondary'
                }`}
              >
                {option === 'day' ? 'Day' : 'Week'}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-ios-secondary">Loading calendar...</div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-4">
            <div className="overflow-x-auto">
              <div className="min-w-[760px]">
                <div className={`grid ${view === 'week' ? 'grid-cols-[72px_repeat(7,minmax(0,1fr))]' : 'grid-cols-[72px_minmax(0,1fr)]'} gap-0`}>
                  <div />
                  {visibleDays.map(day => (
                    <div key={day.toISOString()} className="px-2 pb-3 text-center border-b border-ios-separator/30">
                      <p className="text-caption1 font-semibold uppercase tracking-wide text-ios-tertiary">{day.toLocaleDateString('en-GB', { weekday: 'short' })}</p>
                      <p className="text-footnote font-semibold text-ios-primary">{day.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
                    </div>
                  ))}

                  <div className="border-r border-ios-separator/30">
                    {Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }).map((_, index) => (
                      <div key={index} className="h-14 pr-3 text-right text-caption2 text-ios-tertiary">
                        {`${String(DAY_START_HOUR + index).padStart(2, '0')}:00`}
                      </div>
                    ))}
                  </div>

                  {dayBuckets.map(({ day, items }) => (
                    <div
                      key={day.toISOString()}
                      className="relative border-r border-ios-separator/20 last:border-r-0"
                      style={{ height: `${(DAY_END_HOUR - DAY_START_HOUR) * HOUR_HEIGHT}px` }}
                    >
                      {Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }).map((_, index) => (
                        <div key={index} className="h-14 border-b border-ios-separator/20" />
                      ))}

                      {Array.from({ length: (DAY_END_HOUR - DAY_START_HOUR) * 2 }).map((_, slotIndex) => {
                        const top = slotIndex * (HOUR_HEIGHT / 2);
                        return (
                          <button
                            key={`slot-${slotIndex}`}
                            type="button"
                            onClick={() => openQuickCall(day, slotIndex * 30)}
                            className="absolute left-0 right-0 z-0 hover:bg-ios-blue/5 transition-colors group"
                            style={{ top: `${top}px`, height: `${HOUR_HEIGHT / 2}px` }}
                            title="Add call here"
                          >
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-[10px] font-semibold text-ios-blue">
                              + Call
                            </span>
                          </button>
                        );
                      })}

                      {isSameDay(day, now) && nowLine && (
                        <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: nowLine }}>
                          <div className="relative">
                            <span className="absolute -left-[62px] -top-3 rounded-full bg-ios-red px-2 py-0.5 text-[10px] font-semibold text-white shadow-ios-sm">
                              {nowLabel}
                            </span>
                            <span className="absolute -left-1.5 -top-1.5 w-3 h-3 rounded-full bg-ios-red shadow-ios-sm" />
                            <div className="h-[2px] bg-ios-red/90" />
                          </div>
                        </div>
                      )}

                      {items.map(task => {
                        const projectColor = task.projects?.color || (task.task_type === 'call' ? '#007AFF' : '#8E8E93');
                        const call = task.task_type === 'call';
                        const effectiveStart = getEffectiveStart(task);
                        const effectiveEnd = getEffectiveEnd(task);
                        return (
                          <button
                            key={task.id}
                            type="button"
                            onClick={() => router.push(`/dashboard/tasks?task=${task.id}&mode=list${task.project_id ? `&project=${task.project_id}` : ''}`)}
                            className="absolute left-1.5 right-1.5 z-10 rounded-ios p-2 text-left shadow-ios-sm border overflow-hidden"
                            style={{
                              ...eventStyle(task),
                              background: call ? `${projectColor}18` : '#F4F4F7',
                              borderColor: `${projectColor}55`,
                            }}
                          >
                            <div className="flex items-center gap-1.5">
                              {call ? <Phone className="w-3.5 h-3.5 text-ios-blue shrink-0" /> : <CalendarDays className="w-3.5 h-3.5 text-ios-secondary shrink-0" />}
                              <span className="text-[11px] font-semibold text-ios-primary truncate">{task.title}</span>
                            </div>
                            <p className="mt-1 text-[10px] text-ios-secondary truncate">
                              {fmtTime(effectiveStart)} - {fmtTime(effectiveEnd)}
                              {task.projects?.name ? ` · ${task.projects.name}` : ''}
                            </p>
                            {task.projects?.clients?.name && (
                              <p className="text-[10px] text-ios-tertiary truncate">{task.projects.clients.name}</p>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-ios-lg border border-ios-separator/30 bg-ios-bg/60 p-3">
                <div className="flex items-center gap-2">
                  <Clock3 className="w-4 h-4 text-ios-blue" />
                  <p className="text-footnote font-semibold text-ios-primary">Upcoming calls</p>
                </div>
                <div className="mt-3 space-y-2">
                  {tasks.filter(task => task.task_type === 'call').slice(0, 6).map(task => (
                    <button
                      key={task.id}
                      onClick={() => router.push(`/dashboard/tasks?task=${task.id}&mode=list${task.project_id ? `&project=${task.project_id}` : ''}`)}
                      className="w-full rounded-ios bg-white border border-ios-separator/30 p-3 text-left hover:border-ios-blue/30 hover:bg-blue-50/30 transition-all"
                    >
                      <p className="text-footnote font-semibold text-ios-primary truncate">{task.title}</p>
                      <p className="text-caption1 text-ios-secondary">{fmtTime(getEffectiveStart(task))} - {fmtTime(getEffectiveEnd(task))}</p>
                      <p className="text-caption2 text-ios-tertiary truncate">{task.projects?.clients?.name || task.projects?.name || 'No project yet'}</p>
                    </button>
                  ))}
                  {tasks.filter(task => task.task_type === 'call').length === 0 && (
                    <p className="text-caption1 text-ios-tertiary">No calls scheduled in this range yet.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {quickCall && (
        <Modal title="New Call" onClose={() => setQuickCall(null)} size="md">
          <div className="space-y-4">
            <div ref={quickProjectRef} className="space-y-1.5 relative">
              <label className="text-caption1 font-semibold uppercase tracking-wide text-ios-tertiary">Project *</label>
              <div className={`h-11 w-full rounded-ios bg-ios-fill border px-3.5 flex items-center gap-3 transition-all ${
                !quickCall.project_id ? 'border-ios-red/30' : 'border-transparent focus-within:border-ios-blue/40'
              }`}>
                {selectedQuickProject && (
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: selectedQuickProject.color || '#007AFF' }}
                  />
                )}
                {!selectedQuickProject && <Search className="w-4 h-4 text-ios-tertiary shrink-0" />}
                <input
                  className="flex-1 bg-transparent text-body text-ios-primary placeholder:text-ios-tertiary focus:outline-none"
                  placeholder="Search project..."
                  value={quickProjectSearch}
                  onFocus={() => setShowQuickProjectDrop(true)}
                  onChange={e => {
                    const nextValue = e.target.value;
                    setQuickProjectSearch(nextValue);
                    setShowQuickProjectDrop(true);
                    if (!selectedQuickProject || nextValue !== selectedQuickProject.name) {
                      setQuickCall(prev => ({ ...prev, project_id: '' }));
                    }
                  }}
                />
                <ChevronDown className="w-4 h-4 text-ios-tertiary shrink-0" />
              </div>
              {showQuickProjectDrop && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-ios-lg shadow-ios-modal border border-ios-separator/30 z-50 max-h-60 overflow-y-auto">
                  {filteredQuickProjects.map(project => (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => {
                        setQuickCall(prev => ({ ...prev, project_id: project.id }));
                        setQuickProjectSearch(project.name);
                        setShowQuickProjectDrop(false);
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-2.5 hover:bg-ios-fill text-left ${
                        quickCall.project_id === project.id ? 'bg-blue-50' : ''
                      }`}
                    >
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: project.color || '#007AFF' }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-subhead font-medium truncate">{project.name}</p>
                        {project.clients?.name && <p className="text-caption1 text-ios-secondary truncate">{project.clients.name}</p>}
                      </div>
                      {quickCall.project_id === project.id && <Check className="w-4 h-4 text-ios-blue shrink-0" />}
                    </button>
                  ))}
                  {filteredQuickProjects.length === 0 && (
                    <p className="px-3 py-2 text-footnote text-ios-tertiary">No projects found</p>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-caption1 font-semibold uppercase tracking-wide text-ios-tertiary">Call title</label>
              <input
                className="input-compact h-11"
                placeholder="Who is the call with?"
                value={quickCall.title}
                onChange={e => setQuickCall(prev => ({ ...prev, title: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-caption1 font-semibold uppercase tracking-wide text-ios-tertiary">Date</label>
                <input
                  type="date"
                  className="input-compact h-11"
                  value={quickCall.date}
                  onChange={e => setQuickCall(prev => ({ ...prev, date: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-caption1 font-semibold uppercase tracking-wide text-ios-tertiary">Start</label>
                <input
                  type="time"
                  className="input-compact h-11"
                  value={quickCall.start_time}
                  onChange={e => setQuickCall(prev => {
                    const nextStartTime = e.target.value;
                    const start = fromDateAndTime(prev.date, nextStartTime);
                    const currentEnd = fromDateAndTime(prev.date, prev.end_time);
                    const currentDuration = start && currentEnd && currentEnd > start
                      ? Math.round((currentEnd.getTime() - start.getTime()) / 60000)
                      : Math.max(15, Number(prev.duration) || DEFAULT_CALL_DURATION_MINUTES);
                    const nextEnd = start ? addMinutes(start, currentDuration) : currentEnd;
                    return {
                      ...prev,
                      start_time: nextStartTime,
                      end_time: nextEnd ? toTimeInputValue(nextEnd) : prev.end_time,
                    };
                  })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-caption1 font-semibold uppercase tracking-wide text-ios-tertiary">End</label>
                <input
                  type="time"
                  className="input-compact h-11"
                  value={quickCall.end_time}
                  onChange={e => setQuickCall(prev => ({ ...prev, end_time: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-caption1 font-semibold uppercase tracking-wide text-ios-tertiary">Quick duration</label>
              <div className="grid grid-cols-4 gap-1 rounded-ios bg-ios-fill p-1">
                {QUICK_DURATIONS.map(duration => (
                  <button
                    key={duration}
                    type="button"
                    onClick={() => setQuickCall(prev => {
                      const start = fromDateAndTime(prev.date, prev.start_time);
                      const end = start ? addMinutes(start, duration) : null;
                      return {
                        ...prev,
                        duration,
                        end_time: end ? toTimeInputValue(end) : prev.end_time,
                      };
                    })}
                    className={`rounded-ios-sm px-1 py-2 text-[11px] font-semibold transition-all ${
                      quickDurationSelection === duration
                        ? 'bg-white text-ios-primary shadow-ios-sm'
                        : 'text-ios-secondary'
                    }`}
                  >
                    {duration}m
                  </button>
                ))}
              </div>
            </div>

            {quickCallEndPreview && (
              <div className="rounded-ios bg-ios-fill px-3 py-2">
                <p className="text-footnote text-ios-secondary">
                  Scheduled until <span className="font-semibold text-ios-primary">{quickCallEndPreview}</span>
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-caption1 font-semibold uppercase tracking-wide text-ios-tertiary">Meeting link</label>
              <input
                className="input-compact h-11"
                placeholder="Optional"
                value={quickCall.meeting_link}
                onChange={e => setQuickCall(prev => ({ ...prev, meeting_link: e.target.value }))}
              />
            </div>

            <div className="flex items-center justify-between rounded-ios bg-ios-fill px-3 py-2.5">
              <div>
                <p className="text-footnote font-semibold text-ios-primary">Reminder</p>
                <p className="text-caption1 text-ios-secondary">We will remind you 10 minutes before the call.</p>
              </div>
              <Clock3 className="w-4 h-4 text-ios-blue" />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setQuickCall(null)} className="btn-secondary">
                Cancel
              </button>
              <button type="button" onClick={saveQuickCall} disabled={savingQuickCall} className="btn-primary">
                {savingQuickCall ? 'Saving...' : 'Save Call'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
