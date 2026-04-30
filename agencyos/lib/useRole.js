'use client';
import { useState, useEffect } from 'react';
import { getProjectAccess } from '@/lib/projectAccess';

export const ROLE_PERMISSIONS = {
  admin: {
    canManageTeam: true,
    canViewBilling: true,
    canViewReports: true,
    canViewClients: true,
    canViewCRM: true,
    canViewProjects: true,
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
    canViewClients: true,
    canViewCRM: false,
    canViewProjects: true,
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
    canViewClients: true,
    canViewCRM: false,
    canViewProjects: true,
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
    let mounted = true;
    getProjectAccess().then((access) => {
      if (!mounted) return;
      setProfile(access?.profile || null);
      setLoading(false);
    });
    return () => { mounted = false; };
  }, []);

  const role = profile?.role || 'operator';
  const permissions = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.operator;
  const can = (permission) => permissions[permission] === true;
  const isAdmin = role === 'admin';
  const isManager = role === 'manager' || role === 'admin';

  return { profile, role, permissions, can, isAdmin, isManager, loading };
}
