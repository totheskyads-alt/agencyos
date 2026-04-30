import { supabase } from '@/lib/supabase';
import { embedCallMetadata } from '@/lib/callMetadata';

export const RECURRENCE_TYPES = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

export const RECURRENCE_END_TYPES = [
  { value: 'never', label: 'No end date' },
  { value: 'on_date', label: 'End on date' },
];

export const RECURRENCE_WEEKDAYS = [
  { value: 0, short: 'S', label: 'Sunday' },
  { value: 1, short: 'M', label: 'Monday' },
  { value: 2, short: 'T', label: 'Tuesday' },
  { value: 3, short: 'W', label: 'Wednesday' },
  { value: 4, short: 'T', label: 'Thursday' },
  { value: 5, short: 'F', label: 'Friday' },
  { value: 6, short: 'S', label: 'Saturday' },
];

export const RECURRENCE_MONTH_WEEKS = [
  { value: 'first', label: 'First' },
  { value: 'second', label: 'Second' },
  { value: 'third', label: 'Third' },
  { value: 'fourth', label: 'Fourth' },
  { value: 'last', label: 'Last' },
];

function pad(value) {
  return String(value).padStart(2, '0');
}

function dateOnlyToLocal(dateStr) {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function toDateOnly(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function addMonths(date, amount) {
  const next = new Date(date);
  const wantedDay = next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + amount);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(wantedDay, lastDay));
  return next;
}

export function normalizeWeekdays(values, fallbackDay = 1) {
  const raw = Array.isArray(values) ? values : [];
  const cleaned = [...new Set(raw
    .map(value => Number(value))
    .filter(value => Number.isInteger(value) && value >= 0 && value <= 6))]
    .sort((a, b) => a - b);
  if (cleaned.length > 0) return cleaned;
  return [fallbackDay];
}

export function getWeekdayOnlyValues() {
  return RECURRENCE_WEEKDAYS.filter(day => day.value >= 1 && day.value <= 5).map(day => day.value);
}

export function getOrdinalWeekOfMonth(date) {
  const day = date.getDate();
  const week = Math.ceil(day / 7);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  if (day + 7 > lastDay) return 'last';
  return ['first', 'second', 'third', 'fourth'][Math.min(week, 4) - 1] || 'first';
}

function getDateForOrdinalWeekday(year, month, ordinal, weekday) {
  const firstDay = new Date(year, month, 1);
  const firstWeekdayOffset = (weekday - firstDay.getDay() + 7) % 7;
  if (ordinal === 'last') {
    const lastDay = new Date(year, month + 1, 0);
    const offset = (lastDay.getDay() - weekday + 7) % 7;
    return new Date(year, month, lastDay.getDate() - offset, 12, 0, 0, 0);
  }
  const ordinalIndex = RECURRENCE_MONTH_WEEKS.findIndex(item => item.value === ordinal);
  const dayOfMonth = 1 + firstWeekdayOffset + Math.max(0, ordinalIndex) * 7;
  return new Date(year, month, dayOfMonth, 12, 0, 0, 0);
}

function getBaseDate(task) {
  if (task?.due_date) {
    const date = dateOnlyToLocal(task.due_date);
    if (date) return date;
  }
  if (task?.reminder_at) {
    const date = new Date(task.reminder_at);
    if (!Number.isNaN(date.getTime())) {
      return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
    }
  }
  return new Date();
}

function getReminderOffset(task, baseDate) {
  if (!task?.reminder_at) return null;
  const reminderDate = new Date(task.reminder_at);
  if (Number.isNaN(reminderDate.getTime())) return null;
  return reminderDate.getTime() - baseDate.getTime();
}

function parseDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function shiftDateTimeKeepingClock(original, fromBaseDate, toBaseDate) {
  const source = parseDateTime(original);
  if (!source || !fromBaseDate || !toBaseDate) return null;
  const shifted = new Date(toBaseDate);
  shifted.setHours(
    source.getHours(),
    source.getMinutes(),
    source.getSeconds(),
    source.getMilliseconds()
  );
  return shifted.toISOString();
}

export function getNextOccurrenceBaseDate(task) {
  const type = task?.recurrence_type || 'none';
  if (type === 'none') return null;

  const baseDate = getBaseDate(task);
  const interval = Math.max(1, Number(task?.recurrence_interval) || 1);

  if (type === 'daily') {
    if (task?.recurrence_daily_mode === 'weekday') {
      let next = addDays(baseDate, 1);
      while (next.getDay() === 0 || next.getDay() === 6) {
        next = addDays(next, 1);
      }
      return next;
    }
    return addDays(baseDate, interval);
  }

  if (type === 'weekly') {
    const weekdays = normalizeWeekdays(task?.recurrence_weekdays, baseDate.getDay());
    const currentWeekday = baseDate.getDay();
    for (const weekday of weekdays) {
      if (weekday > currentWeekday) {
        return addDays(baseDate, weekday - currentWeekday);
      }
    }
    return addDays(baseDate, interval * 7 - currentWeekday + weekdays[0]);
  }

  if (type === 'monthly') {
    if (task?.recurrence_monthly_mode === 'ordinal_weekday') {
      const next = addMonths(baseDate, interval);
      return getDateForOrdinalWeekday(
        next.getFullYear(),
        next.getMonth(),
        task?.recurrence_monthly_week || getOrdinalWeekOfMonth(baseDate),
        Number(task?.recurrence_monthly_weekday ?? baseDate.getDay())
      );
    }
    return addMonths(baseDate, interval);
  }

  return null;
}

export function buildNextRecurringPayload(task) {
  const baseDate = getBaseDate(task);
  const nextBaseDate = getNextOccurrenceBaseDate(task);
  if (!nextBaseDate) return null;

  if ((task?.recurrence_end_type || 'never') === 'on_date' && task?.recurrence_until) {
    if (toDateOnly(nextBaseDate) > task.recurrence_until) {
      return null;
    }
  }

  const reminderOffset = getReminderOffset(task, baseDate);
  const nextReminderAt = reminderOffset == null ? null : new Date(nextBaseDate.getTime() + reminderOffset).toISOString();
  const nextStartsAt = shiftDateTimeKeepingClock(task?.starts_at, baseDate, nextBaseDate);
  const nextEndsAt = shiftDateTimeKeepingClock(task?.ends_at, baseDate, nextBaseDate);
  const rootId = task?.recurrence_origin_task_id || task?.id || null;

  return {
    title: task.title,
    description: task.description || '',
    assigned_to: task.assigned_to || null,
    priority: task.priority || 'medium',
    due_date: task.due_date ? toDateOnly(nextBaseDate) : null,
    reminder_at: nextReminderAt,
    starts_at: nextStartsAt,
    ends_at: nextEndsAt,
    all_day: Boolean(task.all_day),
    meeting_link: task.meeting_link || null,
    call_note_template: task.call_note_template || null,
    column_id: task.column_id || null,
    project_id: task.project_id,
    task_type: task.task_type || 'general',
    status: 'todo',
    position: task.position ?? 9999,
    is_archived: false,
    archived_at: null,
    recurrence_type: task.recurrence_type || 'none',
    recurrence_interval: Math.max(1, Number(task.recurrence_interval) || 1),
    recurrence_weekdays: normalizeWeekdays(task.recurrence_weekdays, nextBaseDate.getDay()),
    recurrence_daily_mode: task.recurrence_daily_mode || 'interval',
    recurrence_end_type: task.recurrence_end_type || 'never',
    recurrence_until: task.recurrence_until || null,
    recurrence_monthly_mode: task.recurrence_monthly_mode || 'day_of_month',
    recurrence_monthly_week: task.recurrence_monthly_week || null,
    recurrence_monthly_weekday: task.recurrence_monthly_weekday ?? null,
    recurrence_generated_task_id: null,
    recurrence_origin_task_id: rootId,
  };
}

export async function createNextRecurringTask(task) {
  if (!task?.id || !task?.project_id) return null;
  if (!task.recurrence_type || task.recurrence_type === 'none') return null;
  if (task.recurrence_generated_task_id) return null;

  let existingOpenQuery = supabase
    .from('tasks')
    .select('id')
    .eq('project_id', task.project_id)
    .eq('title', task.title)
    .eq('recurrence_type', task.recurrence_type)
    .neq('status', 'done')
    .or('is_archived.eq.false,is_archived.is.null')
    .limit(1);

  if (task.assigned_to) existingOpenQuery = existingOpenQuery.eq('assigned_to', task.assigned_to);
  else existingOpenQuery = existingOpenQuery.is('assigned_to', null);

  const { data: existingOpen } = await existingOpenQuery;
  if (existingOpen?.length) return existingOpen[0];

  const nextPayload = buildNextRecurringPayload(task);
  if (!nextPayload) return null;

  let insertResult = await supabase
    .from('tasks')
    .insert(nextPayload)
    .select()
    .single();

  if (insertResult.error && /(starts_at|ends_at|all_day|meeting_link|call_note_template|recurrence_generated_task_id|recurrence_origin_task_id)/i.test(insertResult.error.message || '')) {
    const {
      starts_at,
      ends_at,
      all_day,
      meeting_link,
      call_note_template,
      recurrence_generated_task_id,
      recurrence_origin_task_id,
      ...fallbackPayload
    } = nextPayload;

    fallbackPayload.description = nextPayload.task_type === 'call'
      ? embedCallMetadata(nextPayload.description || '', { starts_at, ends_at, meeting_link, call_note_template })
      : (nextPayload.description || '');

    insertResult = await supabase
      .from('tasks')
      .insert(fallbackPayload)
      .select()
      .single();
  }

  if (insertResult.error) {
    const minimalPayload = {
      title: nextPayload.title,
      description: nextPayload.task_type === 'call'
        ? embedCallMetadata(nextPayload.description || '', {
            starts_at: nextPayload.starts_at,
            ends_at: nextPayload.ends_at,
            meeting_link: nextPayload.meeting_link,
            call_note_template: nextPayload.call_note_template,
          })
        : (nextPayload.description || ''),
      assigned_to: nextPayload.assigned_to || null,
      priority: nextPayload.priority || 'medium',
      due_date: nextPayload.due_date || null,
      reminder_at: nextPayload.reminder_at || null,
      column_id: nextPayload.column_id || null,
      project_id: nextPayload.project_id,
      task_type: nextPayload.task_type || 'general',
      status: 'todo',
      position: nextPayload.position ?? 9999,
      is_archived: false,
      archived_at: null,
      recurrence_type: nextPayload.recurrence_type || 'none',
      recurrence_interval: Math.max(1, Number(nextPayload.recurrence_interval) || 1),
      recurrence_weekdays: nextPayload.recurrence_weekdays || null,
      recurrence_daily_mode: nextPayload.recurrence_daily_mode || 'interval',
      recurrence_end_type: nextPayload.recurrence_end_type || 'never',
      recurrence_until: nextPayload.recurrence_until || null,
    };

    insertResult = await supabase
      .from('tasks')
      .insert(minimalPayload)
      .select()
      .single();
  }

  const { data: newTask, error } = insertResult;

  if (error || !newTask) {
    console.warn('Could not create next recurring task', error);
    return null;
  }

  const updateLinkResult = await supabase
    .from('tasks')
    .update({ recurrence_generated_task_id: newTask.id })
    .eq('id', task.id);

  if (updateLinkResult.error && !/recurrence_generated_task_id/i.test(updateLinkResult.error.message || '')) {
    console.warn('Could not link recurring task to source task', updateLinkResult.error);
  }

  const { data: labelRows } = await supabase
    .from('task_labels')
    .select('label_id')
    .eq('task_id', task.id);

  if (labelRows?.length) {
    await supabase.from('task_labels').insert(
      labelRows.map(row => ({
        task_id: newTask.id,
        label_id: row.label_id,
      }))
    );
  }

  return newTask;
}
