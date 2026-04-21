'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { fmtDuration } from '@/lib/utils';
import Link from 'next/link';
import { ArrowRight, Clock } from 'lucide-react';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function DonutChart({ data, total, size = 120 }) {
  if (!data.length || total === 0) return (
    <div className="flex items-center justify-center h-20 text-ios-tertiary text-caption1">No time tracked today</div>
  );
  const CX = size/2, CY = size/2, R = size/2 - 14, STROKE = 18;
  const circ = 2 * Math.PI * R;
  let offset = 0;
  const slices = data.map(d => {
    const dash = (d.secs / total) * circ;
    const sl = { ...d, dash, gap: circ - dash, offset };
    offset += dash; return sl;
  });
  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" style={{ transform:'rotate(-90deg)' }}>
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="#F2F2F7" strokeWidth={STROKE} />
        {slices.map((s, i) => (
          <circle key={i} cx={CX} cy={CY} r={R} fill="none" stroke={s.color || '#007AFF'} strokeWidth={STROKE}
            strokeDasharray={`${s.dash} ${s.gap}`} strokeDashoffset={-s.offset} />
        ))}
        <text x={CX} y={CY} textAnchor="middle" dominantBaseline="central" fontSize="11" fontWeight="700" fill="#1C1C1E"
          style={{ transform:`rotate(90deg)`, transformOrigin:`${CX}px ${CY}px` }}>{fmtDuration(total)}</text>
      </svg>
      <div className="flex-1 space-y-1.5 min-w-0">
        {slices.slice(0, 4).map((s, i) => (
          <div key={i} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
              <span className="text-caption1 font-medium text-ios-primary truncate">{s.name}</span>
            </div>
            <span className="text-caption2 text-ios-secondary font-semibold shrink-0">{fmtDuration(s.secs)}</span>
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
  const [clientCount, setClientCount] = useState(0);
  const [projectCount, setProjectCount] = useState(0);
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

    const [{ data: todayEnt }, { data: weekEntFull }, { data: monthEnt }, { data: cli }, { data: proj }, { data: tasks }, { data: recent }] = await Promise.all([
      supabase.from('time_entries').select('duration_seconds,project_id,projects(name,color)').eq('user_id',user.id).not('end_time','is',null).gte('created_at',todayStart),
      supabase.from('time_entries').select('duration_seconds,project_id,projects(name,color)').eq('user_id',user.id).not('end_time','is',null).gte('created_at',weekStart),
      supabase.from('time_entries').select('duration_seconds').eq('user_id',user.id).not('end_time','is',null).gte('created_at',monthStart),
      supabase.from('clients').select('id'),
      supabase.from('projects').select('id').eq('status','active'),
      supabase.from('tasks').select('id,assigned_to').eq('is_archived',false),
      supabase.from('time_entries').select('duration_seconds,description,projects(name,color,clients(name))').eq('user_id',user.id).not('end_time','is',null).order('created_at',{ascending:false}).limit(5),
    ]);

    const today = (todayEnt||[]).reduce((a,e)=>a+(e.duration_seconds||0),0);
    setTodaySecs(today);
    setWeekSecs((weekEntFull||[]).reduce((a,e)=>a+(e.duration_seconds||0),0));
    setMonthSecs((monthEnt||[]).reduce((a,e)=>a+(e.duration_seconds||0),0));
    setClientCount(cli?.length||0); setProjectCount(proj?.length||0);
    // Count tasks visible to this user (same logic as tasks page)
    const { data: myProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    let taskCount = tasks?.length || 0;
    if (myProfile?.role === 'operator') {
      taskCount = (tasks||[]).filter(t => t.assigned_to === user.id).length;
    } else if (myProfile?.role === 'manager') {
      const { data: adminIds } = await supabase.from('profiles').select('id').eq('role','admin');
      const adminSet = new Set((adminIds||[]).map(a => a.id));
      taskCount = (tasks||[]).filter(t => !adminSet.has(t.assigned_to)).length;
    }
    setOpenTasks(taskCount);
    setRecentEntries(recent||[]);

    // Today by project
    const byP = {};
    (todayEnt||[]).forEach(e => {
      if (!e.project_id) return;
      if (!byP[e.project_id]) byP[e.project_id] = { name: e.projects?.name||'Unknown', color: e.projects?.color||'#007AFF', secs: 0 };
      byP[e.project_id].secs += (e.duration_seconds||0);
    });
    setTodayByProject(Object.values(byP).sort((a,b)=>b.secs-a.secs));
    setTodayTotal(today);

    // Week by project
    const byPW = {};
    (weekEntFull||[]).forEach(e => {
      if (!e.project_id) return;
      if (!byPW[e.project_id]) byPW[e.project_id] = { name: e.projects?.name||'Unknown', color: e.projects?.color||'#007AFF', secs: 0 };
      byPW[e.project_id].secs += (e.duration_seconds||0);
    });
    setWeekByProject(Object.values(byPW).sort((a,b)=>b.secs-a.secs).slice(0,5));
  }

  const dayOfWeek = new Date().toLocaleDateString('en-US', { weekday:'long', day:'numeric', month:'long' });

  return (
    <div className="space-y-4">
      {/* Greeting */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-title2 font-bold text-ios-primary">{greeting()}, {profile?.nickname || profile?.full_name?.split(' ')[0] || 'there'} 👋</h1>
          <p className="text-footnote text-ios-secondary">{dayOfWeek}</p>
        </div>
        <div className="flex gap-3">
          <Link href="/dashboard/clients" className="card px-4 py-3 text-center hover:shadow-ios-lg transition-shadow">
            <p className="text-headline font-bold text-ios-orange">{clientCount}</p>
            <p className="text-caption2 text-ios-secondary">Clients</p>
          </Link>
          <Link href="/dashboard/projects" className="card px-4 py-3 text-center hover:shadow-ios-lg transition-shadow">
            <p className="text-headline font-bold text-ios-green">{projectCount}</p>
            <p className="text-caption2 text-ios-secondary">Projects</p>
          </Link>
          <Link href="/dashboard/tasks" className="card px-4 py-3 text-center hover:shadow-ios-lg transition-shadow">
            <p className="text-headline font-bold text-ios-purple">{openTasks}</p>
            <p className="text-caption2 text-ios-secondary">Open tasks</p>
          </Link>
        </div>
      </div>

      {/* Main 2-col grid */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* LEFT: Time + donut */}
        <div className="space-y-4">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-headline font-semibold text-ios-primary">Today's time</p>
              <Link href="/dashboard/timer" className="text-caption1 text-ios-blue font-semibold flex items-center gap-0.5">
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-5">
              {[
                { label:'Today', secs: todaySecs, color:'text-ios-blue' },
                { label:'This week', secs: weekSecs, color:'text-ios-purple' },
                { label:'This month', secs: monthSecs, color:'text-ios-green' },
              ].map(({ label, secs, color }) => (
                <div key={label} className="bg-ios-bg rounded-ios p-3 text-center">
                  <p className={`text-title3 font-bold ${color}`}>{fmtDuration(secs)}</p>
                  <p className="text-caption2 text-ios-secondary">{label}</p>
                </div>
              ))}
            </div>
            <DonutChart data={todayByProject} total={todayTotal} size={130} />
          </div>

          {/* This week breakdown */}
          {weekByProject.length > 0 && (
            <div className="card p-5">
              <p className="text-headline font-semibold text-ios-primary mb-4">This week by project</p>
              <div className="space-y-3">
                {weekByProject.map((p, i) => {
                  const max = Math.max(...weekByProject.map(x => x.secs), 1);
                  return (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ background: p.color }} />
                          <span className="text-subhead font-medium text-ios-primary">{p.name}</span>
                        </div>
                        <span className="text-footnote font-semibold text-ios-secondary">{fmtDuration(p.secs)}</span>
                      </div>
                      <div className="h-2 bg-ios-fill rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width:`${(p.secs/max*100).toFixed(0)}%`, background: p.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: Recent activity */}
        <div className="card">
          <div className="px-5 py-4 border-b border-ios-separator/30 flex items-center justify-between">
            <p className="text-headline font-semibold text-ios-primary">Recent activity</p>
            <Link href="/dashboard/timer" className="text-footnote text-ios-blue font-semibold">See all</Link>
          </div>
          {recentEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <Clock className="w-8 h-8 text-ios-label4" />
              <p className="text-subhead text-ios-secondary">No activity yet</p>
              <p className="text-footnote text-ios-tertiary">Start the timer to track work</p>
            </div>
          ) : recentEntries.map(e => (
            <div key={e.id} className="flex items-center gap-3 px-5 py-3.5 border-b border-ios-separator/20 last:border-0 hover:bg-ios-bg/50 transition-colors">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: e.projects?.color||'#007AFF' }} />
              <div className="flex-1 min-w-0">
                <p className="text-subhead font-medium text-ios-primary truncate">{e.projects?.name || 'No project'}</p>
                {(e.description || e.projects?.clients?.name) && (
                  <p className="text-caption1 text-ios-secondary truncate">{e.description || e.projects?.clients?.name}</p>
                )}
              </div>
              <span className="text-footnote font-semibold text-ios-secondary shrink-0">{fmtDuration(e.duration_seconds||0)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
