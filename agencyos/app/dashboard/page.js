'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { fmtDuration, fmtCurrency, getElapsed, fmtClock } from '@/lib/utils';
import { Clock, TrendingUp, Users, FolderOpen, CheckSquare, Play, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useRef } from 'react';

function StatCard({ label, value, sub, icon: Icon, color, href }) {
  const content = (
    <div className={`card p-4 ${href ? 'hover:shadow-ios-lg transition-shadow cursor-pointer' : ''}`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-ios flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5" strokeWidth={2} />
        </div>
        {href && <ArrowRight className="w-4 h-4 text-ios-tertiary" />}
      </div>
      <p className="text-title3 font-bold text-ios-primary">{value}</p>
      <p className="text-footnote text-ios-secondary mt-0.5">{label}</p>
      {sub && <p className="text-caption1 text-ios-tertiary mt-1">{sub}</p>}
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

export default function DashboardPage() {
  const [stats, setStats] = useState({ clients: 0, projects: 0, tasks: 0, todayS: 0, weekS: 0, monthS: 0 });
  const [activeTimer, setActiveTimer] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [recent, setRecent] = useState([]);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      setUser(user);
      const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      setProfile(p);
      loadData(user);
    });
    return () => clearInterval(intervalRef.current);
  }, []);

  useEffect(() => {
    clearInterval(intervalRef.current);
    if (!activeTimer?.start_time) return;
    const tick = () => setElapsed(getElapsed(activeTimer.start_time));
    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => clearInterval(intervalRef.current);
  }, [activeTimer]);

  async function loadData(u) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekStart = new Date(now.getTime() - 7 * 86400000).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [
      { count: clients }, { count: projects }, { count: tasks },
      { data: todayEnt }, { data: weekEnt }, { data: monthEnt },
      { data: act }, { data: recentEnt },
    ] = await Promise.all([
      supabase.from('clients').select('*', { count: 'exact', head: true }),
      supabase.from('projects').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('tasks').select('*', { count: 'exact', head: true }).neq('status', 'done'),
      supabase.from('time_entries').select('duration_seconds').eq('user_id', u.id).gte('created_at', todayStart).not('end_time', 'is', null),
      supabase.from('time_entries').select('duration_seconds').eq('user_id', u.id).gte('created_at', weekStart).not('end_time', 'is', null),
      supabase.from('time_entries').select('duration_seconds').eq('user_id', u.id).gte('created_at', monthStart).not('end_time', 'is', null),
      supabase.from('time_entries').select('*, projects(name,color), tasks(title)').eq('user_id', u.id).is('end_time', null).maybeSingle(),
      supabase.from('time_entries').select('*, projects(name,color), tasks(title)').eq('user_id', u.id).not('end_time', 'is', null).order('created_at', { ascending: false }).limit(5),
    ]);

    const sum = arr => (arr || []).reduce((a, e) => a + (e.duration_seconds || 0), 0);
    setStats({ clients: clients || 0, projects: projects || 0, tasks: tasks || 0, todayS: sum(todayEnt), weekS: sum(weekEnt), monthS: sum(monthEnt) });
    setActiveTimer(act || null);
    setRecent(recentEnt || []);
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bună dimineața' : hour < 18 ? 'Bună ziua' : 'Bună seara';
  const name = profile?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || '';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-title2 font-bold text-ios-primary">{greeting}, {name}! 👋</h1>
        <p className="text-subhead text-ios-secondary mt-0.5">
          {new Date().toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* Active timer banner */}
      {activeTimer && (
        <Link href="/dashboard/timer">
          <div className="bg-ios-blue rounded-ios-lg p-4 flex items-center justify-between shadow-ios cursor-pointer hover:opacity-95 transition-opacity">
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 bg-white rounded-full animate-pulse" />
              <div>
                <p className="text-subhead font-semibold text-white">
                  {activeTimer.projects?.name || 'Timer activ'}
                </p>
                <p className="text-caption1 text-blue-100">
                  {activeTimer.tasks?.title || activeTimer.description || 'Apasă pentru a opri'}
                </p>
              </div>
            </div>
            <div className="font-mono text-title3 font-bold text-white">{fmtClock(elapsed)}</div>
          </div>
        </Link>
      )}

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-3 text-center">
          <p className="text-headline font-bold text-ios-blue">{fmtDuration(stats.todayS)}</p>
          <p className="text-caption1 text-ios-secondary">Azi</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-headline font-bold text-ios-purple">{fmtDuration(stats.weekS)}</p>
          <p className="text-caption1 text-ios-secondary">Săptămâna</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-headline font-bold text-ios-green">{fmtDuration(stats.monthS)}</p>
          <p className="text-caption1 text-ios-secondary">Luna</p>
        </div>
      </div>

      {/* Main stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard icon={Users}      label="Clienți activi"  value={stats.clients}  color="bg-orange-50 text-ios-orange" href="/dashboard/clients" />
        <StatCard icon={FolderOpen} label="Proiecte active" value={stats.projects} color="bg-green-50 text-ios-green"  href="/dashboard/projects" />
        <StatCard icon={CheckSquare}label="Taskuri deschise" value={stats.tasks}   color="bg-blue-50 text-ios-blue"    href="/dashboard/tasks" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Recent activity */}
        <div className="card">
          <div className="px-4 py-3 border-b border-ios-separator/50">
            <p className="text-headline font-semibold text-ios-primary">Activitate recentă</p>
          </div>
          {recent.length === 0 ? (
            <div className="p-8 text-center">
              <Clock className="w-8 h-8 text-ios-label4 mx-auto mb-2" />
              <p className="text-subhead text-ios-secondary">Nicio înregistrare încă</p>
              <Link href="/dashboard/timer" className="btn-primary inline-block mt-3 text-footnote">
                Pornește timerul
              </Link>
            </div>
          ) : (
            recent.map(e => (
              <div key={e.id} className="list-row">
                <div className="w-2 h-2 rounded-full mr-3 shrink-0" style={{ background: e.projects?.color || '#007AFF' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-subhead font-medium text-ios-primary truncate">{e.projects?.name || 'Fără proiect'}</p>
                  <p className="text-caption1 text-ios-secondary">{e.tasks?.title || e.description || '—'}</p>
                </div>
                <span className="text-footnote font-semibold text-ios-secondary ml-2">{fmtDuration(e.duration_seconds)}</span>
              </div>
            ))
          )}
        </div>

        {/* Quick actions */}
        <div className="card">
          <div className="px-4 py-3 border-b border-ios-separator/50">
            <p className="text-headline font-semibold text-ios-primary">Acțiuni rapide</p>
          </div>
          <div className="p-3 grid grid-cols-2 gap-2">
            {[
              { href: '/dashboard/timer',    icon: Play,        label: 'Pornește timer',  bg: 'bg-blue-50', text: 'text-ios-blue' },
              { href: '/dashboard/clients',  icon: Users,       label: 'Client nou',      bg: 'bg-orange-50', text: 'text-ios-orange' },
              { href: '/dashboard/projects', icon: FolderOpen,  label: 'Proiect nou',     bg: 'bg-green-50', text: 'text-ios-green' },
              { href: '/dashboard/tasks',    icon: CheckSquare, label: 'Task nou',        bg: 'bg-purple-50', text: 'text-ios-purple' },
            ].map(({ href, icon: Icon, label, bg, text }) => (
              <Link key={href} href={href}
                className={`flex flex-col items-center gap-2 p-4 rounded-ios ${bg} ${text} hover:opacity-80 transition-opacity text-center`}>
                <Icon className="w-5 h-5" />
                <span className="text-footnote font-semibold">{label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
