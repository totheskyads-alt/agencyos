'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { fmtDuration } from '@/lib/utils';
import Link from 'next/link';
import { Play, Users, FolderOpen, CheckSquare, ArrowRight, Clock } from 'lucide-react';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function DonutChart({ data, total }) {
  if (!data.length || total === 0) return (
    <div className="flex items-center justify-center h-40 text-ios-tertiary text-footnote">No time tracked today</div>
  );
  const SIZE = 160, CX = 80, CY = 80, R = 60, STROKE = 22;
  const circ = 2 * Math.PI * R;
  let offset = 0;
  const slices = data.map(d => {
    const pct = d.secs / total;
    const dash = pct * circ;
    const gap = circ - dash;
    const slice = { ...d, dash, gap, offset };
    offset += dash;
    return slice;
  });

  return (
    <div className="flex items-center gap-6">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="#F2F2F7" strokeWidth={STROKE} />
        {slices.map((s, i) => (
          <circle key={i} cx={CX} cy={CY} r={R} fill="none"
            stroke={s.color || '#007AFF'} strokeWidth={STROKE}
            strokeDasharray={`${s.dash} ${s.gap}`}
            strokeDashoffset={-s.offset}
            strokeLinecap="butt" />
        ))}
        <text x={CX} y={CY} textAnchor="middle" dominantBaseline="central"
          fontSize="13" fontWeight="700" fill="#1C1C1E"
          style={{ transform: 'rotate(90deg)', transformOrigin: `${CX}px ${CY}px` }}>
          {fmtDuration(total)}
        </text>
      </svg>
      <div className="flex-1 space-y-2 min-w-0">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
              <span className="text-footnote font-medium text-ios-primary truncate">{s.name}</span>
            </div>
            <span className="text-caption1 text-ios-secondary font-semibold shrink-0">{fmtDuration(s.secs)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [profile, setProfile] = useState(null);
  const [todaySecs, setTodaySecs] = useState(0);
  const [weekSecs, setWeekSecs] = useState(0);
  const [monthSecs, setMonthSecs] = useState(0);
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [openTasks, setOpenTasks] = useState(0);
  const [recentEntries, setRecentEntries] = useState([]);
  const [todayByProject, setTodayByProject] = useState([]);
  const [todayTotal, setTodayTotal] = useState(0);
  const [weekByProject, setWeekByProject] = useState([]);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    setProfile(p);

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekStart = new Date(now.getTime() - 6 * 86400000).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [{ data: todayEnt }, { data: weekEnt }, { data: monthEnt }, { data: cli }, { data: proj }, { data: tasks }, { data: recent }] = await Promise.all([
      supabase.from('time_entries').select('duration_seconds, project_id, projects(name,color,clients(name))').eq('user_id', user.id).not('end_time','is',null).gte('created_at', todayStart),
      supabase.from('time_entries').select('duration_seconds, project_id').eq('user_id', user.id).not('end_time','is',null).gte('created_at', weekStart),
      supabase.from('time_entries').select('duration_seconds').eq('user_id', user.id).not('end_time','is',null).gte('created_at', monthStart),
      supabase.from('clients').select('id').eq('status', null).or('status.is.null,status.eq.active'),
      supabase.from('projects').select('id').eq('status','active'),
      supabase.from('tasks').select('id').eq('is_archived',false).neq('status','done'),
      supabase.from('time_entries').select('*, projects(name,color,clients(name))').eq('user_id', user.id).not('end_time','is',null).order('created_at',{ascending:false}).limit(8),
    ]);

    const todayTotal = (todayEnt||[]).reduce((a,e) => a+(e.duration_seconds||0), 0);
    const weekTotal = (weekEnt||[]).reduce((a,e) => a+(e.duration_seconds||0), 0);
    const monthTotal = (monthEnt||[]).reduce((a,e) => a+(e.duration_seconds||0), 0);

    setTodaySecs(todayTotal); setWeekSecs(weekTotal); setMonthSecs(monthTotal);
    setClients(cli||[]); setProjects(proj||[]); setOpenTasks(tasks?.length||0);
    setRecentEntries(recent||[]);

    // Today by project (donut)
    const byProj = {};
    (todayEnt||[]).forEach(e => {
      if (!e.project_id) return;
      if (!byProj[e.project_id]) byProj[e.project_id] = { name: e.projects?.name||'Unknown', color: e.projects?.color||'#007AFF', client: e.projects?.clients?.name, secs: 0 };
      byProj[e.project_id].secs += (e.duration_seconds||0);
    });
    const projList = Object.values(byProj).sort((a,b) => b.secs-a.secs);
    setTodayByProject(projList);
    setTodayTotal(todayTotal);

    // This week by project (bar)
    const byProjWeek = {};
    // Need project info - re-fetch with project data
    const { data: weekEntFull } = await supabase.from('time_entries')
      .select('duration_seconds, project_id, projects(name,color)')
      .eq('user_id', user.id).not('end_time','is',null).gte('created_at', weekStart);
    (weekEntFull||[]).forEach(e => {
      if (!e.project_id) return;
      if (!byProjWeek[e.project_id]) byProjWeek[e.project_id] = { name: e.projects?.name||'Unknown', color: e.projects?.color||'#007AFF', secs: 0 };
      byProjWeek[e.project_id].secs += (e.duration_seconds||0);
    });
    setWeekByProject(Object.values(byProjWeek).sort((a,b) => b.secs-a.secs).slice(0,6));
  }

  const dayOfWeek = new Date().toLocaleDateString('en-US', { weekday:'long', day:'numeric', month:'long' });

  return (
    <div className="space-y-5">
      {/* Greeting */}
      <div>
        <h1 className="text-title2 font-bold text-ios-primary">{greeting()}, {profile?.full_name?.split(' ')[0] || 'there'}! 👋</h1>
        <p className="text-subhead text-ios-secondary">{dayOfWeek}</p>
      </div>

      {/* Time stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label:'Today', secs: todaySecs, color:'text-ios-blue' },
          { label:'This week', secs: weekSecs, color:'text-ios-purple' },
          { label:'This month', secs: monthSecs, color:'text-ios-green' },
        ].map(({ label, secs, color }) => (
          <div key={label} className="card p-4 text-center">
            <p className={`text-title3 font-bold ${color}`}>{fmtDuration(secs)}</p>
            <p className="text-footnote text-ios-secondary">{label}</p>
          </div>
        ))}
      </div>

      {/* Today time by project — DONUT */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-headline font-semibold text-ios-primary">Today's time</p>
          <Link href="/dashboard/timer" className="text-footnote text-ios-blue font-semibold flex items-center gap-1">
            Timer <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        <DonutChart data={todayByProject} total={todayTotal} />
      </div>

      {/* This week by project — bars */}
      {weekByProject.length > 0 && (
        <div className="card p-5">
          <p className="text-headline font-semibold text-ios-primary mb-4">This week by project</p>
          <div className="space-y-3">
            {weekByProject.map((p, i) => {
              const max = Math.max(...weekByProject.map(x => x.secs), 1);
              const pct = (p.secs / max) * 100;
              return (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                      <span className="text-subhead font-medium text-ios-primary">{p.name}</span>
                    </div>
                    <span className="text-footnote font-semibold text-ios-secondary">{fmtDuration(p.secs)}</span>
                  </div>
                  <div className="h-2 bg-ios-fill rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width:`${pct}%`, background: p.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <Link href="/dashboard/clients" className="card p-4 hover:shadow-ios-lg transition-shadow">
          <div className="w-9 h-9 bg-orange-50 text-ios-orange rounded-ios flex items-center justify-center mb-3"><Users className="w-4 h-4"/></div>
          <p className="text-title3 font-bold text-ios-primary">{clients.length}</p>
          <p className="text-footnote text-ios-secondary">Active clients</p>
          <ArrowRight className="w-3.5 h-3.5 text-ios-tertiary mt-2" />
        </Link>
        <Link href="/dashboard/projects" className="card p-4 hover:shadow-ios-lg transition-shadow">
          <div className="w-9 h-9 bg-green-50 text-ios-green rounded-ios flex items-center justify-center mb-3"><FolderOpen className="w-4 h-4"/></div>
          <p className="text-title3 font-bold text-ios-primary">{projects.length}</p>
          <p className="text-footnote text-ios-secondary">Active projects</p>
          <ArrowRight className="w-3.5 h-3.5 text-ios-tertiary mt-2" />
        </Link>
        <Link href="/dashboard/tasks" className="card p-4 hover:shadow-ios-lg transition-shadow">
          <div className="w-9 h-9 bg-purple-50 text-ios-purple rounded-ios flex items-center justify-center mb-3"><CheckSquare className="w-4 h-4"/></div>
          <p className="text-title3 font-bold text-ios-primary">{openTasks}</p>
          <p className="text-footnote text-ios-secondary">Open tasks</p>
          <ArrowRight className="w-3.5 h-3.5 text-ios-tertiary mt-2" />
        </Link>
      </div>

      {/* Recent activity */}
      <div className="card">
        <div className="px-4 py-3 border-b border-ios-separator/30 flex items-center justify-between">
          <p className="text-headline font-semibold text-ios-primary">Recent activity</p>
          <Link href="/dashboard/timer" className="text-footnote text-ios-blue font-semibold">View all</Link>
        </div>
        {recentEntries.length === 0 ? (
          <div className="p-8 text-center">
            <Clock className="w-7 h-7 text-ios-label4 mx-auto mb-2" />
            <p className="text-subhead text-ios-secondary">No time tracked yet</p>
            <p className="text-footnote text-ios-tertiary mt-1">Start the timer to track your work</p>
          </div>
        ) : recentEntries.map(e => (
          <div key={e.id} className="flex items-center gap-3 px-4 py-3 border-b border-ios-separator/20 last:border-0">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: e.projects?.color||'#007AFF' }} />
            <div className="flex-1 min-w-0">
              <p className="text-subhead font-medium truncate">{e.projects?.name||'No project'}</p>
              <p className="text-caption1 text-ios-secondary">{e.description||e.projects?.clients?.name||'—'}</p>
            </div>
            <span className="text-footnote font-semibold text-ios-secondary shrink-0">{fmtDuration(e.duration_seconds||0)}</span>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="card p-4">
        <p className="text-headline font-semibold text-ios-primary mb-3">Quick actions</p>
        <div className="grid grid-cols-2 gap-3">
          <Link href="/dashboard/timer" className="flex flex-col items-center gap-2 p-4 bg-blue-50 rounded-ios-lg hover:bg-blue-100 transition-colors">
            <Play className="w-6 h-6 text-ios-blue" />
            <span className="text-footnote font-semibold text-ios-blue">Start timer</span>
          </Link>
          <Link href="/dashboard/tasks" className="flex flex-col items-center gap-2 p-4 bg-purple-50 rounded-ios-lg hover:bg-purple-100 transition-colors">
            <CheckSquare className="w-6 h-6 text-ios-purple" />
            <span className="text-footnote font-semibold text-ios-purple">New task</span>
          </Link>
          <Link href="/dashboard/clients" className="flex flex-col items-center gap-2 p-4 bg-orange-50 rounded-ios-lg hover:bg-orange-100 transition-colors">
            <Users className="w-6 h-6 text-ios-orange" />
            <span className="text-footnote font-semibold text-ios-orange">New client</span>
          </Link>
          <Link href="/dashboard/projects" className="flex flex-col items-center gap-2 p-4 bg-green-50 rounded-ios-lg hover:bg-green-100 transition-colors">
            <FolderOpen className="w-6 h-6 text-ios-green" />
            <span className="text-footnote font-semibold text-ios-green">New project</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
