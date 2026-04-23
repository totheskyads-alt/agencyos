import { supabase } from '@/lib/supabase';

const ACCESS_CACHE_TTL = 15000;
let accessCache = null;
let accessCacheAt = 0;

export function invalidateProjectAccessCache() {
  accessCache = null;
  accessCacheAt = 0;
}

export async function getProjectAccess(options = {}) {
  const { forceRefresh = false } = options;
  if (!forceRefresh && accessCache && Date.now() - accessCacheAt < ACCESS_CACHE_TTL) {
    return accessCache;
  }

  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) {
    accessCache = { user: null, profile: null, role: 'operator', projectIds: [], isRestricted: true, tableMissing: false };
    accessCacheAt = Date.now();
    return accessCache;
  }

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  const role = profile?.role || 'operator';

  if (role === 'admin') {
    accessCache = { user, profile, role, projectIds: null, isRestricted: false, tableMissing: false };
    accessCacheAt = Date.now();
    return accessCache;
  }

  const { data: memberships, error } = await supabase
    .from('project_members')
    .select('project_id, role_on_project')
    .eq('user_id', user.id);

  if (error) {
    console.warn('Project access table not available yet', error);
    accessCache = { user, profile, role, memberships: [], projectIds: [], isRestricted: true, tableMissing: true };
    accessCacheAt = Date.now();
    return accessCache;
  }

  accessCache = {
    user,
    profile,
    role,
    memberships: memberships || [],
    projectIds: (memberships || []).map(m => m.project_id).filter(Boolean),
    isRestricted: true,
    tableMissing: false,
  };
  accessCacheAt = Date.now();
  return accessCache;
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

  const result = await supabase.from('project_members').upsert({
    project_id: projectId,
    user_id: userId,
    role_on_project: roleOnProject,
  }, {
    onConflict: 'project_id,user_id',
  });

  invalidateProjectAccessCache();
  return result;
}
