import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: 'Supabase public environment variables are missing.' }, { status: 500 });
  }

  if (!supabaseServiceRoleKey) {
    return NextResponse.json({
      error: 'SUPABASE_SERVICE_ROLE_KEY is missing. Add it in local env and Vercel to fully delete auth users.',
    }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return unauthorized('Missing access token.');

  const { userId } = await request.json();
  if (!userId) return badRequest('Missing userId.');

  const sessionClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: requesterData, error: requesterError } = await sessionClient.auth.getUser();
  const requester = requesterData?.user;
  if (requesterError || !requester) return unauthorized('Invalid access token.');
  if (requester.id === userId) return forbidden('You cannot delete your own account.');

  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: requesterProfile } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', requester.id)
    .single();

  if (requesterProfile?.role !== 'admin') {
    return forbidden('Only admins can delete members.');
  }

  const cleanupOps = [
    adminClient.from('tasks').update({ assigned_to: null }).eq('assigned_to', userId),
    adminClient.from('task_columns').delete().eq('user_id', userId),
    adminClient.from('project_members').delete().eq('user_id', userId),
    adminClient.from('notifications').delete().eq('user_id', userId),
    adminClient.from('bugs').update({ reported_by: null }).eq('reported_by', userId),
    adminClient.from('ideas').update({ reported_by: null }).eq('reported_by', userId),
    adminClient.from('profiles').update({ reviewed_by: null }).eq('reviewed_by', userId),
  ];

  const cleanupResults = await Promise.all(cleanupOps);
  const cleanupError = cleanupResults.find(result => result.error)?.error;
  if (cleanupError) {
    return NextResponse.json({ error: cleanupError.message || 'Cleanup failed.' }, { status: 500 });
  }

  const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(userId);
  if (deleteAuthError) {
    return NextResponse.json({ error: deleteAuthError.message || 'Auth deletion failed.' }, { status: 500 });
  }

  const { error: archiveProfileError } = await adminClient
    .from('profiles')
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      approval_status: 'rejected',
      reviewed_at: new Date().toISOString(),
      reviewed_by: requester.id,
    })
    .eq('id', userId);
  if (archiveProfileError) {
    return NextResponse.json({ error: archiveProfileError.message || 'Profile archive failed after auth deletion.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
