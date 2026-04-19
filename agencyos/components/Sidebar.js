'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useRole } from '@/lib/useRole';
import { LayoutDashboard, Timer, Users, FolderOpen, CheckSquare, BarChart3, UsersRound, LogOut, Menu, X, Clock, Receipt } from 'lucide-react';
import { useState } from 'react';

const ALL_NAV = [
  { href: '/dashboard',          icon: LayoutDashboard, label: 'Dashboard',  permission: null },
  { href: '/dashboard/timer',    icon: Timer,           label: 'Timer',      permission: null },
  { href: '/dashboard/clients',  icon: Users,           label: 'Clients',    permission: 'canManageClients' },
  { href: '/dashboard/projects', icon: FolderOpen,      label: 'Projects',   permission: 'canManageProjects' },
  { href: '/dashboard/tasks',    icon: CheckSquare,     label: 'Tasks',      permission: null },
  { href: '/dashboard/billing',  icon: Receipt,         label: 'Billing',    permission: 'canViewBilling' },
  { href: '/dashboard/reports',  icon: BarChart3,       label: 'Reports',    permission: 'canViewReports' },
  { href: '/dashboard/team',     icon: UsersRound,      label: 'Team',       permission: 'canManageTeam' },
];

export default function Sidebar({ user, profile }) {
  const pathname = usePathname();
  const router = useRouter();
  const { can, role } = useRole();
  const [open, setOpen] = useState(false);

  const nav = ALL_NAV.filter(item => !item.permission || can(item.permission));

  const logout = async () => { await supabase.auth.signOut(); router.push('/login'); };
  const initials = (profile?.full_name || user?.email || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const roleBadge = { admin: 'bg-purple-100 text-ios-purple', manager: 'bg-blue-100 text-ios-blue', operator: 'bg-ios-fill2 text-ios-secondary' };

  return (
    <>
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white/80 backdrop-blur-ios border-b border-ios-separator/50 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-ios-blue rounded-ios-sm flex items-center justify-center">
            <Clock className="w-4 h-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-headline font-bold">Agency OS</span>
        </div>
        <button onClick={() => setOpen(!open)} className="p-2 rounded-ios hover:bg-ios-fill">
          {open ? <X className="w-5 h-5 text-ios-secondary" /> : <Menu className="w-5 h-5 text-ios-secondary" />}
        </button>
      </div>
      {open && <div className="lg:hidden fixed inset-0 bg-black/30 z-30 backdrop-blur-sm" onClick={() => setOpen(false)} />}
      <aside className={`fixed left-0 top-0 h-full w-60 bg-white/95 backdrop-blur-ios border-r border-ios-separator/30 z-40 transition-transform duration-300 lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full">
          <div className="px-5 py-5 border-b border-ios-separator/30">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-ios-blue rounded-ios flex items-center justify-center shadow-ios-sm">
                <Clock className="w-5 h-5 text-white" strokeWidth={2.5} />
              </div>
              <div>
                <p className="text-headline font-bold text-ios-primary">Agency OS</p>
                <p className="text-caption1 text-ios-secondary">v2.0</p>
              </div>
            </div>
          </div>
          <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
            {nav.map(({ href, icon: Icon, label }) => {
              const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
              return (
                <Link key={href} href={href} onClick={() => setOpen(false)}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-ios text-subhead font-medium transition-all ${active ? 'bg-ios-blue text-white shadow-ios-sm' : 'text-ios-secondary hover:bg-ios-fill hover:text-ios-primary'}`}>
                  <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-white' : 'text-ios-tertiary'}`} strokeWidth={active ? 2.5 : 2} />
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="p-3 border-t border-ios-separator/30">
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-ios bg-ios-fill mb-1">
              <div className="w-8 h-8 bg-ios-blue rounded-full flex items-center justify-center text-white text-caption1 font-bold shrink-0">{initials}</div>
              <div className="flex-1 min-w-0">
                <p className="text-subhead font-semibold text-ios-primary truncate">{profile?.full_name || 'User'}</p>
                <span className={`text-caption2 font-semibold px-1.5 py-0.5 rounded-full ${roleBadge[role] || roleBadge.operator}`}>
                  {role?.charAt(0).toUpperCase() + role?.slice(1)}
                </span>
              </div>
            </div>
            <button onClick={logout} className="flex items-center gap-3 w-full px-3.5 py-2.5 rounded-ios text-subhead font-medium text-ios-red hover:bg-red-50 transition-colors">
              <LogOut className="w-4 h-4" /> Sign Out
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
