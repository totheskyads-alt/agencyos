'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useRole } from '@/lib/useRole';
import { LayoutDashboard, Timer, Users, FolderOpen, CheckSquare, BarChart3, UsersRound, LogOut, Receipt, Bug, NotebookText, TrendingUp, CalendarDays, X, HeartPulse } from 'lucide-react';

const ALL_NAV = [
  { href: '/dashboard',          icon: LayoutDashboard, label: 'Dashboard',    permission: null },
  { href: '/dashboard/timer',    icon: Timer,           label: 'Timer',        permission: null },
  { href: '/dashboard/clients',  icon: Users,           label: 'Clients',      permission: 'canViewClients' },
  { href: '/dashboard/crm',      icon: TrendingUp,      label: 'Sales Pipeline', permission: 'canViewCRM' },
  { href: '/dashboard/projects', icon: FolderOpen,      label: 'Projects',     permission: 'canViewProjects' },
  { href: '/dashboard/tasks',    icon: CheckSquare,     label: 'Tasks',        permission: null },
  { href: '/dashboard/calendar', icon: CalendarDays,    label: 'Calendar',     permission: null },
  { href: '/dashboard/notes',    icon: NotebookText,    label: 'Notes',        permission: null },
  { href: '/dashboard/client-health', icon: HeartPulse, label: 'Client Health', permission: 'canViewClientHealth' },
  { href: '/dashboard/billing',  icon: Receipt,         label: 'Billing',      permission: 'canViewBilling' },
  { href: '/dashboard/reports',  icon: BarChart3,       label: 'Reports',      permission: 'canViewReports' },
  { href: '/dashboard/team',     icon: UsersRound,      label: 'Team',         permission: 'canManageTeam' },
  { href: '/dashboard/bugs',     icon: Bug,             label: 'Bug Tracker',  permission: null },
];

export default function Sidebar({ user, profile, open = false, setOpen = () => {} }) {
  const pathname = usePathname();
  const router = useRouter();
  const { can, role } = useRole();

  const nav = ALL_NAV.filter(item => !item.permission || can(item.permission));
  const logout = async () => { await supabase.auth.signOut(); router.push('/login'); };
  const initials = (profile?.full_name || user?.email || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const roleBadge = { admin: 'bg-purple-100 text-purple-700', manager: 'bg-blue-100 text-blue-700', operator: 'bg-gray-100 text-gray-500' };
  const displayName = profile?.nickname || profile?.full_name || 'User';

  return (
    <>
      {open && <div className="lg:hidden fixed inset-0 bg-black/36 z-40" onClick={() => setOpen(false)} />}

      <aside
        className={`fixed inset-y-0 left-0 w-64 bg-white border-r border-ios-separator/40 z-50 transition-transform duration-300 lg:bg-white/94 lg:backdrop-blur-ios lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex flex-col h-full">
          <div className="dashboard-sidebar-brand h-12 px-4 lg:px-5 border-b border-ios-separator/40 flex items-center justify-between bg-white shrink-0 lg:bg-white/92 lg:backdrop-blur-ios">
            <Link href="/dashboard" onClick={() => setOpen(false)} className="flex items-center gap-3 min-w-0 rounded-ios hover:opacity-90 transition-opacity">
              <img src="/logo.jpg" alt="Sky Metrics" className="w-9 h-9 rounded-full object-cover shadow-ios-sm ring-2 ring-ios-blue/15 shrink-0" />
              <div className="min-w-0">
                <p className="text-headline font-bold text-ios-primary truncate">Sky Metrics</p>
                <p className="text-caption1 text-ios-secondary">v2.0</p>
              </div>
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="lg:hidden w-9 h-9 rounded-full bg-ios-fill flex items-center justify-center text-ios-secondary hover:bg-ios-fill2 transition-colors shrink-0"
            >
              <X className="w-4.5 h-4.5" strokeWidth={2.5} />
            </button>
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

          <div className="p-3 border-t border-ios-separator/40 bg-white shrink-0 lg:bg-white/86 lg:backdrop-blur-ios">
            <Link href="/dashboard/profile" onClick={() => setOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-ios hover:bg-ios-fill transition-colors mb-1 ${pathname === '/dashboard/profile' ? 'bg-ios-fill' : ''}`}>
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="avatar" className="w-8 h-8 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-8 h-8 bg-ios-blue rounded-full flex items-center justify-center text-white text-caption1 font-bold shrink-0">{initials}</div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-subhead font-semibold text-ios-primary truncate">{displayName}</p>
                <span className={`text-caption2 font-semibold px-1.5 py-0.5 rounded-full ${roleBadge[role] || roleBadge.operator}`}>
                  {role?.charAt(0).toUpperCase() + role?.slice(1)}
                </span>
              </div>
            </Link>
            <button onClick={logout} className="flex items-center gap-3 w-full px-3.5 py-2.5 rounded-ios text-subhead font-medium text-ios-red hover:bg-red-50 transition-colors">
              <LogOut className="w-4 h-4" /> Sign Out
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
