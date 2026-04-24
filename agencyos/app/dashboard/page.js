'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { fmtDuration, parseUTC } from '@/lib/utils';
import { getProjectAccess, visibleClientIdsFromProjects } from '@/lib/projectAccess';
import { ensureBillingReminderNotifications } from '@/lib/notifications';
import Modal from '@/components/Modal';
import { MOMENT_STYLES } from '@/components/TeamMomentOverlay';
import Link from 'next/link';
import { ArrowRight, Clock, Plus, Sparkles } from 'lucide-react';

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
  const [role, setRole] = useState('operator');
  const [currentUserId, setCurrentUserId] = useState(null);
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
  const [composerOpen, setComposerOpen] = useState(false);
  const [momentSaving, setMomentSaving] = useState(false);
  const [momentFeedback, setMomentFeedback] = useState('');
  const [momentForm, setMomentForm] = useState({
    title: '',
    body: '',
    style: 'motivation',
    endsAt: '',
  });

  useEffect(() => { load(); }, []);

  async function load() {
    const accessInfo = await getProjectAccess();
    const user = accessInfo.user;
    if (!user) return;
    setProfile(accessInfo.profile || null);
    setRole(accessInfo.role || 'operator');
    setCurrentUserId(user.id);
    if (accessInfo.role === 'admin') await ensureBillingReminderNotifications(user.id);

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekStart = new Date(now.getTime() - 6 * 86400000).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    let visibleProjectIds = accessInfo.projectIds;
    let visibleClientIds = null;
    if (accessInfo.isRestricted && visibleProjectIds.length === 0) {
      setTodaySecs(0); setWeekSecs(0); setMonthSecs(0);
      setClientCount(0); setProjectCount(0); setOpenTasks(0);
      setRecentEntries([]); setTodayByProject([]); setTodayTotal(0); setWeekByProject([]);
      return;
    }

    let projectQuery = supabase.from('projects').select('id,client_id').eq('status','active');
    if (accessInfo.isRestricted) projectQuery = projectQuery.in('id', visibleProjectIds);
    const { data: visibleProjects } = await projectQuery;
    if (accessInfo.isRestricted) visibleClientIds = visibleClientIdsFromProjects(visibleProjects || []);

    let todayQ = supabase.from('time_entries').select('duration_seconds,project_id,projects(name,color),start_time').eq('user_id',user.id).not('end_time','is',null).gte('start_time',todayStart);
    let weekQ = supabase.from('time_entries').select('duration_seconds,project_id,projects(name,color),start_time').eq('user_id',user.id).not('end_time','is',null).gte('start_time',weekStart);
    let monthQ = supabase.from('time_entries').select('duration_seconds,start_time').eq('user_id',user.id).not('end_time','is',null).gte('start_time',monthStart);
    let clientQ = supabase.from('clients').select('id');
    let tasksQ = supabase.from('tasks').select('id,assigned_to,project_id').or('is_archived.eq.false,is_archived.is.null').not('project_id','is',null);
    let recentQ = supabase.from('time_entries').select('duration_seconds,description,start_time,projects(name,color,clients(name))').eq('user_id',user.id).not('end_time','is',null).order('start_time',{ascending:false}).limit(5);

    if (accessInfo.isRestricted) {
      todayQ = todayQ.in('project_id', visibleProjectIds);
      weekQ = weekQ.in('project_id', visibleProjectIds);
      monthQ = monthQ.in('project_id', visibleProjectIds);
      tasksQ = tasksQ.in('project_id', visibleProjectIds);
      recentQ = recentQ.in('project_id', visibleProjectIds);
      clientQ = visibleClientIds.length ? clientQ.in('id', visibleClientIds) : null;
    }

    const [{ data: todayEnt }, { data: weekEntFull }, { data: monthEnt }, { data: cli }, { data: tasks }, { data: recent }] = await Promise.all([
      todayQ,
      weekQ,
      monthQ,
      clientQ || Promise.resolve({ data: [] }),
      tasksQ,
      recentQ,
    ]);

    const monthEntries = (monthEnt || []).filter(e => parseUTC(e.start_time));
    const todayEntries = (todayEnt || []).filter(e => parseUTC(e.start_time));
    const weekEntries = (weekEntFull || []).filter(e => parseUTC(e.start_time));
    const today = todayEntries.reduce((a,e)=>a+(e.duration_seconds||0),0);
    setTodaySecs(today);
    setWeekSecs(weekEntries.reduce((a,e)=>a+(e.duration_seconds||0),0));
    setMonthSecs(monthEntries.reduce((a,e)=>a+(e.duration_seconds||0),0));
    setClientCount(cli?.length||0); setProjectCount(visibleProjects?.length||0);
    // Count tasks visible to this user (same logic as tasks page)
    let taskCount = tasks?.length || 0;
    if (accessInfo.role === 'operator') {
      taskCount = (tasks||[]).filter(t => t.assigned_to === user.id).length;
    } else if (accessInfo.role === 'manager') {
      const { data: adminIds } = await supabase.from('profiles').select('id').eq('role','admin');
      const adminSet = new Set((adminIds||[]).map(a => a.id));
      taskCount = (tasks||[]).filter(t => !adminSet.has(t.assigned_to)).length;
    }
    setOpenTasks(taskCount);
    setRecentEntries(recent||[]);

    // Today by project
    const byP = {};
    todayEntries.forEach(e => {
      if (!e.project_id) return;
      if (!byP[e.project_id]) byP[e.project_id] = { name: e.projects?.name||'Unknown', color: e.projects?.color||'#007AFF', secs: 0 };
      byP[e.project_id].secs += (e.duration_seconds||0);
    });
    setTodayByProject(Object.values(byP).sort((a,b)=>b.secs-a.secs));
    setTodayTotal(today);

    // Week by project
    const byPW = {};
    weekEntries.forEach(e => {
      if (!e.project_id) return;
      if (!byPW[e.project_id]) byPW[e.project_id] = { name: e.projects?.name||'Unknown', color: e.projects?.color||'#007AFF', secs: 0 };
      byPW[e.project_id].secs += (e.duration_seconds||0);
    });
    setWeekByProject(Object.values(byPW).sort((a,b)=>b.secs-a.secs).slice(0,5));
  }

  async function createMoment() {
    const title = momentForm.title.trim();
    const body = momentForm.body.trim();
    if (!title) {
      setMomentFeedback('Give the moment a short headline first.');
      return;
    }

    setMomentSaving(true);
    setMomentFeedback('');

    const payload = {
      title,
      body: body || null,
      style: momentForm.style,
      is_active: true,
      starts_at: new Date().toISOString(),
      ends_at: momentForm.endsAt ? new Date(momentForm.endsAt).toISOString() : null,
      created_by: currentUserId,
    };

    const { error } = await supabase.from('team_moments').insert(payload);
    setMomentSaving(false);

    if (error) {
      setMomentFeedback('Moment could not be saved yet. Run the SQL for team moments first, then try again.');
      return;
    }

    setComposerOpen(false);
    setMomentForm({ title: '', body: '', style: 'motivation', endsAt: '' });
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }

  const dayOfWeek = new Date().toLocaleDateString('en-US', { weekday:'long', day:'numeric', month:'long' });

  return (
    <div className="space-y-4">
      {/* Greeting */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="avatar" className="w-12 h-12 rounded-full object-cover shrink-0 ring-2 ring-ios-separator/60" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-ios-blue text-white flex items-center justify-center text-headline font-bold shrink-0">
              {(profile?.full_name || profile?.email || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-title2 font-bold text-ios-primary truncate">{greeting()}, {profile?.nickname || profile?.full_name?.split(' ')[0] || 'there'} 👋</h1>
            <p className="text-footnote text-ios-secondary">{dayOfWeek}</p>
          </div>
        </div>
        <div className="flex gap-3 items-center">
          {role === 'admin' && (
            <button
              onClick={() => {
                setMomentFeedback('');
                setComposerOpen(true);
              }}
              className="hidden md:inline-flex h-11 px-4 rounded-ios-lg border border-ios-separator/60 bg-white text-ios-primary shadow-ios-sm items-center gap-2 font-semibold transition-all hover:-translate-y-0.5 hover:shadow-ios"
            >
              <Sparkles className="w-4 h-4 text-ios-blue" />
              New moment
            </button>
          )}
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

      {role === 'admin' && (
        <div className="md:hidden">
          <button
            onClick={() => {
              setMomentFeedback('');
              setComposerOpen(true);
            }}
            className="w-full rounded-ios-lg border border-ios-separator/60 bg-white px-4 py-3 text-left shadow-ios-sm flex items-center justify-between"
          >
            <div>
              <p className="text-subhead font-semibold text-ios-primary">Send a motivation moment</p>
              <p className="text-caption1 text-ios-secondary">Show a short boost the next time people open the dashboard.</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-blue-50 text-ios-blue flex items-center justify-center shrink-0">
              <Plus className="w-5 h-5" />
            </div>
          </button>
        </div>
      )}

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

      {composerOpen && (
        <Modal title="New motivation moment" onClose={() => setComposerOpen(false)} size="lg">
          <div className="space-y-5">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="input-label">Headline</label>
              <input
                  value={momentForm.title}
                  onChange={(e) => setMomentForm((prev) => ({ ...prev, title: e.target.value }))}
                  className="input"
                  placeholder="No sleepy energy today. We move."
                  maxLength={90}
                />
              </div>
              <div>
                <label className="input-label">Visible until</label>
                <input
                  type="datetime-local"
                  value={momentForm.endsAt}
                  onChange={(e) => setMomentForm((prev) => ({ ...prev, endsAt: e.target.value }))}
                  className="input"
                />
              </div>
            </div>

            <div>
              <label className="input-label">Message</label>
              <textarea
                value={momentForm.body}
                onChange={(e) => setMomentForm((prev) => ({ ...prev, body: e.target.value }))}
                className="input min-h-[120px] resize-none"
                placeholder="Short, warm, bold. Think: one good line that makes people smirk and move."
                maxLength={220}
              />
            </div>

            <div>
              <label className="input-label">Style</label>
              <div className="grid sm:grid-cols-2 gap-3">
                {Object.entries(MOMENT_STYLES).map(([value, style]) => {
                  const selected = momentForm.style === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setMomentForm((prev) => ({ ...prev, style: value }))}
                      className={`rounded-ios-lg border px-4 py-4 text-left transition-all ${selected ? 'border-ios-blue bg-blue-50 shadow-ios-sm' : 'border-ios-separator/60 bg-white hover:border-ios-blue/30'}`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 text-2xl shadow-ios-sm"
                          style={{ background: style.soft, border: `1px solid ${style.accent}33` }}
                        >
                          <span aria-hidden="true">{style.animal}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-subhead font-semibold text-ios-primary capitalize">{value}</p>
                          <p className="text-caption1 text-ios-secondary mt-1">{style.words.join(' • ')}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-ios-lg bg-ios-bg px-4 py-3 border border-ios-separator/40">
              <p className="text-caption1 text-ios-secondary">
                V1 logic: it appears while people are actually inside the platform, floats above every dashboard page, updates live for other logged-in users, auto-hides after a few seconds, and can be dismissed manually.
              </p>
            </div>

            {momentFeedback && (
              <div className="rounded-ios-lg border border-red-200 bg-red-50 px-4 py-3 text-subhead text-ios-red">
                {momentFeedback}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-1">
              <button onClick={() => setComposerOpen(false)} className="btn-secondary">
                Cancel
              </button>
              <button onClick={createMoment} disabled={momentSaving} className="btn-primary">
                {momentSaving ? 'Saving...' : 'Send moment'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
