import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ALLOWED_TYPES = new Set([
  'invoice_due',
  'task_assigned',
  'project_assigned',
  'comment_mention',
  'broadcast',
  'task_reminder',
  'approval_request',
]);

function unauthorized(message = 'Unauthorized') {
  return NextResponse.json({ error: message }, { status: 401 });
}

function forbidden(message = 'Forbidden') {
  return NextResponse.json({ error: message }, { status: 403 });
}

function badRequest(message = 'Bad request') {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request) {
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return NextResponse.json({ error: 'Supabase environment variables are missing.' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return unauthorized('Missing access token.');

  const sessionClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: requesterData, error: requesterError } = await sessionClient.auth.getUser();
  const requester = requesterData?.user;
  if (requesterError || !requester) return unauthorized('Invalid access token.');

  const {
    userId,
    type,
    title,
    body = '',
    entityType = null,
    entityId = null,
    entityUrl = null,
    eventKey = null,
  } = await request.json();

  if (!userId || !type || !title) return badRequest('Missing notification payload.');
  if (!ALLOWED_TYPES.has(type)) return badRequest('Unsupported notification type.');

  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: requesterProfile } = await adminClient
    .from('profiles')
    .select('id, role')
    .eq('id', requester.id)
    .single();

  if (!requesterProfile) return forbidden('Profile not found.');

  const canNotifyOthers = ['admin', 'manager'].includes(requesterProfile.role);
  if (userId !== requester.id && !canNotifyOthers) {
    return forbidden('You cannot create notifications for other users.');
  }

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
    ? adminClient.from('notifications').upsert(payload, { onConflict: 'user_id,event_key', ignoreDuplicates: true })
    : adminClient.from('notifications').insert(payload);

  const result = await query.select?.();
  const error = result?.error || null;
  if (error) {
    return NextResponse.json({ error: error.message || 'Could not create notification.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
