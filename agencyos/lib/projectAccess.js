import { supabase } from '@/lib/supabase';

export async function getProjectAccess() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, profile: null, role: 'operator', projectIds: [], isRestricted: true, tableMissing: false };

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  const role = profile?.role || 'operator';

  if (role === 'admin') {
    return { user, profile, role, projectIds: null, isRestricted: false, tableMissing: false };
  }

  const { data: memberships, error } = await supabase
    .from('project_members')
    .select('project_id, role_on_project')
    .eq('user_id', user.id);

  if (error) {
    console.warn('Project access table not available yet', error);
    return { user, profile, role, memberships: [], projectIds: [], isRestricted: true, tableMissing: true };
  }

  return {
    user,
    profile,
    role,
    memberships: memberships || [],
    projectIds: (memberships || []).map(m => m.project_id).filter(Boolean),
    isRestricted: true,
    tableMissing: false,
  };
}

export function canSeeProject(access, projectId) {
  if (!access?.isRestricted) return true;
  return access.projectIds?.includes(projectId);
}

export function visibleClientIdsFromProjects(projects) {
  return [...new Set((projects || []).map(p => p.client_id).filter(Boolean))];
}

export async function grantProjectAccess(projectId, userId, roleOnProject = 'member') {
  if (!projectId || !userId) return { error: null };

  return supabase.from('project_members').upsert({
    project_id: projectId,
    user_id: userId,
    role_on_project: roleOnProject,
  }, {
    onConflict: 'project_id,user_id',
  });
}
