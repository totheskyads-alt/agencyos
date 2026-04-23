import { supabase } from '@/lib/supabase';

export async function createNotification({
  userId,
  type,
  title,
  body = '',
  entityType = null,
  entityId = null,
  entityUrl = null,
  eventKey = null,
}) {
  if (!userId || !type || !title) return { error: null };

  const payload = {
    user_id: userId,
    type,
    title,
    body,
    entity_type: entityType,
    entity_id: entityId,
    entity_url: entityUrl,
    event_key: eventKey,
  };

  const query = eventKey
    ? supabase.from('notifications').upsert(payload, { onConflict: 'user_id,event_key', ignoreDuplicates: true })
    : supabase.from('notifications').insert(payload);

  const result = await query;
  if (result.error) console.warn('Notification could not be saved', result.error);
  return result;
}

export async function createTaskAssignedNotification({ task, assignedUserId, actorId }) {
  if (!task?.id || !assignedUserId || assignedUserId === actorId) return;

  return createNotification({
    userId: assignedUserId,
    type: 'task_assigned',
    title: 'New task assigned',
    body: task.title || 'You received a new task.',
    entityType: 'task',
    entityId: task.id,
    entityUrl: `/dashboard/tasks?task=${task.id}&mode=list${task.project_id ? `&project=${task.project_id}` : ''}`,
    eventKey: `task_assigned:${task.id}:${assignedUserId}`,
  });
}

export async function createProjectAssignedNotification({ projectId, projectName, userId, actorId }) {
  if (!projectId || !userId || userId === actorId) return;

  return createNotification({
    userId,
    type: 'project_assigned',
    title: 'Project access added',
    body: projectName ? `You were added to ${projectName}.` : 'You were added to a project.',
    entityType: 'project',
    entityId: projectId,
    entityUrl: `/dashboard/projects?project=${projectId}`,
    eventKey: `project_assigned:${projectId}:${userId}`,
  });
}

export async function createCommentMentionNotification({ task, commentId, mentionedUserId, actorId }) {
  if (!task?.id || !commentId || !mentionedUserId || mentionedUserId === actorId) return;

  return createNotification({
    userId: mentionedUserId,
    type: 'comment_mention',
    title: 'You were mentioned',
    body: task.title || 'A task comment mentioned you.',
    entityType: 'task_comment',
    entityId: commentId,
    entityUrl: `/dashboard/tasks?task=${task.id}&tab=comments&comment=${commentId}&mode=list${task.project_id ? `&project=${task.project_id}` : ''}`,
    eventKey: `comment_mention:${commentId}:${mentionedUserId}`,
  });
}

export function findMentionedUsers(text, members = []) {
  if (!text) return [];
  const tags = [...text.matchAll(/@([\p{L}\p{N}._-]+)/gu)]
    .map(match => match[1]?.toLowerCase())
    .filter(Boolean);

  if (tags.length === 0) return [];

  const found = new Map();
  tags.forEach(tag => {
    members.forEach(member => {
      const fullName = (member.full_name || '').toLowerCase();
      const firstName = fullName.split(/\s+/)[0];
      const emailName = (member.email || '').split('@')[0].toLowerCase();
      const nickname = (member.nickname || '').toLowerCase();
      if ([fullName, firstName, emailName, nickname].filter(Boolean).includes(tag)) {
        found.set(member.id, member);
      }
    });
  });

  return [...found.values()];
}

export async function ensureBillingReminderNotifications(adminUserId) {
  if (!adminUserId) return;

  const today = new Date();
  const billingDay = today.getDate();
  const month = today.getMonth() + 1;
  const year = today.getFullYear();

  const { data: projects, error: projectError } = await supabase
    .from('projects')
    .select('id,name,client_id,monthly_amount,billing_day,clients(name)')
    .eq('status', 'active')
    .eq('billing_day', billingDay);

  if (projectError || !projects?.length) {
    if (projectError) console.warn('Billing reminder projects could not be loaded', projectError);
    return;
  }

  const clientIds = [...new Set(projects.map(p => p.client_id).filter(Boolean))];
  const { data: existingBills, error: billingError } = await supabase
    .from('billing')
    .select('client_id,month,year')
    .in('client_id', clientIds)
    .eq('month', month)
    .eq('year', year);

  if (billingError) {
    console.warn('Billing reminders could not check invoices', billingError);
    return;
  }

  const billedClients = new Set((existingBills || []).map(b => b.client_id));
  await Promise.all(projects
    .filter(p => p.client_id && !billedClients.has(p.client_id))
    .map(p => createNotification({
      userId: adminUserId,
      type: 'invoice_due',
      title: 'Invoice to issue today',
      body: `${p.clients?.name || 'Client'}${p.name ? ` · ${p.name}` : ''}`,
      entityType: 'project',
      entityId: p.id,
      entityUrl: `/dashboard/billing?newInvoice=1&client=${p.client_id}${p.id ? `&project=${p.id}` : ''}`,
      eventKey: `invoice_due:${year}:${month}:${p.id}`,
    })));
}
