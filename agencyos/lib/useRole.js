'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export const ROLE_PERMISSIONS = {
  admin: {
    canManageTeam: true,
    canViewBilling: true,
    canViewReports: true,
    canManageClients: true,
    canManageProjects: true,
    canDeleteAny: true,
    canViewAllTasks: true,
    canManageColumns: true,
  },
  manager: {
    canManageTeam: false,
    canViewBilling: false,
    canViewReports: true,
    canManageClients: true,
    canManageProjects: true,
    canDeleteAny: false,
    canViewAllTasks: true,
    canManageColumns: true,
  },
  operator: {
    canManageTeam: false,
    canViewBilling: false,
    canViewReports: false,
    canManageClients: false,
    canManageProjects: false,
    canDeleteAny: false,
    canViewAllTasks: false,
    canManageColumns: false,
  },
};

export function useRole() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoading(false); return; }
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      setProfile(data);
      setLoading(false);
    });
  }, []);

  const role = profile?.role || 'operator';
  const permissions = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.operator;
  const can = (permission) => permissions[permission] === true;
  const isAdmin = role === 'admin';
  const isManager = role === 'manager' || role === 'admin';

  return { profile, role, permissions, can, isAdmin, isManager, loading };
}
