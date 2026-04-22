'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRole } from '@/lib/useRole';
import { fmtDuration } from '@/lib/utils';
import { Crown, Shield, User, Info, Trash2, AlertCircle } from 'lucide-react';

const ROLES = {
  admin: {
    label: 'Admin', icon: Crown,
    color: 'bg-purple-50 text-ios-purple', badge: 'bg-purple-100 text-ios-purple',
    permissions: ['Full access to everything','Manage team roles','View billing & reports','Delete any record','Manage board columns'],
    denied: [],
  },
  manager: {
    label: 'Manager', icon: Shield,
    color: 'bg-blue-50 text-ios-blue', badge: 'bg-blue-100 text-ios-blue',
    permissions: ['View all projects & tasks','Create & edit tasks','View full reports','Can manage clients & projects'],
    denied: ['Cannot manage billing','Cannot manage team roles','Cannot delete clients/projects'],
  },
  operator: {
    label: 'Operator', icon: User,
    color: 'bg-ios-fill text-ios-secondary', badge: 'bg-ios-fill2 text-ios-secondary',
    permissions: ['View own assigned tasks only','View clients and projects','Use timer on own tasks','Add comments & files'],
    denied: ['No billing or reports access','Cannot edit projects or clients','Cannot manage columns'],
  },
};

export default function TeamPage() {
  const [members, setMembers] = useState([]);
  const [stats, setStats] = useState({});
  const [currentUserId, setCurrentUserId] = useState(null);
  const [showPermissions, setShowPermissions] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const { isAdmin } = useRole();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUserId(user?.id);
      load();
    });
  }, []);

  async function load() {
    const { data: profiles } = await supabase.from('profiles').select('*').order('full_name');
    setMembers(profiles || []);

    const weekStart = new Date(Date.now() - 7 * 86400000).toISOString();
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const [{ data: w }, { data: mo }] = await Promise.all([
      supabase.from('time_entries').select('user_id,duration_seconds').not('end_time','is',null).gte('created_at', weekStart),
      supabase.from('time_entries').select('user_id,duration_seconds').not('end_time','is',null).gte('created_at', monthStart),
    ]);
    const s = {};
    (w||[]).forEach(e => { if (!s[e.user_id]) s[e.user_id]={week:0,month:0}; s[e.user_id].week+=(e.duration_seconds||0); });
    (mo||[]).forEach(e => { if (!s[e.user_id]) s[e.user_id]={week:0,month:0}; s[e.user_id].month+=(e.duration_seconds||0); });
    setStats(s);
  }

  async function changeRole(memberId, role) {
    await supabase.from('profiles').update({ role }).eq('id', memberId);
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role } : m));
  }

  async function deleteUser(memberId) {
    // Delete all related data first
    await Promise.all([
      supabase.from('time_entries').delete().eq('user_id', memberId),
      supabase.from('task_comments').delete().eq('user_id', memberId),
    ]);
    // Delete profile (auth user deletion requires admin API, so we just clear profile)
    await supabase.from('profiles').delete().eq('id', memberId);
    setMembers(prev => prev.filter(m => m.id !== memberId));
    setConfirmDelete(null);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-title2 font-bold text-ios-primary">Team</h1>
          <p className="text-subhead text-ios-secondary">{members.length} members</p>
        </div>
        <button onClick={() => setShowPermissions(!showPermissions)}
          className="btn-secondary flex items-center gap-2 text-footnote">
          <Info className="w-4 h-4" /> {showPermissions ? 'Hide' : 'View'} Permissions
        </button>
      </div>

      {showPermissions && (
        <div className="grid lg:grid-cols-3 gap-3">
          {Object.entries(ROLES).map(([key, role]) => {
            const Icon = role.icon;
            return (
              <div key={key} className={`rounded-ios-lg p-4 border border-ios-separator/30 ${role.color}`}>
                <div className="flex items-center gap-2 mb-3">
                  <Icon className="w-4 h-4" />
                  <p className="text-subhead font-bold">{role.label}</p>
                </div>
                <ul className="space-y-1.5">
                  {role.permissions.map((p, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-caption1">
                      <span className="text-ios-green shrink-0 font-bold">✓</span><span>{p}</span>
                    </li>
                  ))}
                  {role.denied.map((p, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-caption1 opacity-60">
                      <span className="text-ios-red shrink-0 font-bold">✗</span><span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirm delete dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white rounded-ios-lg p-6 max-w-sm w-full shadow-ios-modal">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-ios-red" />
              </div>
              <div>
                <p className="text-headline font-bold">Delete member?</p>
                <p className="text-footnote text-ios-secondary">{confirmDelete.full_name || confirmDelete.email}</p>
              </div>
            </div>
            <p className="text-subhead text-ios-secondary mb-5">
              This will remove their profile and time entries. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="btn-danger flex-1" onClick={() => deleteUser(confirmDelete.id)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {members.map(m => {
          const isMe = m.id === currentUserId;
          const roleKey = m.role || 'operator';
          const role = ROLES[roleKey] || ROLES.operator;
          const Icon = role.icon;
          const st = stats[m.id] || { week: 0, month: 0 };
          const initials = (m.full_name || m.email || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

          return (
            <div key={m.id} className={`card p-4 ${isMe ? 'ring-2 ring-ios-blue' : ''}`}>
              <div className="flex items-center gap-4">
                {m.avatar_url ? (
                  <img src={m.avatar_url} alt="avatar" className="w-12 h-12 rounded-full object-cover shrink-0 ring-2 ring-ios-separator/60" />
                ) : (
                  <div className="w-12 h-12 bg-ios-blue rounded-full flex items-center justify-center text-white text-headline font-bold shrink-0">
                    {initials}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <p className="text-subhead font-semibold">{m.full_name || 'No name'}</p>
                    {isMe && <span className="text-caption2 font-semibold bg-blue-100 text-ios-blue px-1.5 py-0.5 rounded-full">You</span>}
                    <span className={`text-caption2 font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-1 ${role.badge}`}>
                      <Icon className="w-2.5 h-2.5" />{role.label}
                    </span>
                  </div>
                  <p className="text-footnote text-ios-secondary truncate">{m.email}</p>
                  <div className="flex gap-4 mt-1">
                    {st.week > 0 && <span className="text-caption1 text-ios-secondary">Week: <span className="font-semibold text-ios-primary">{fmtDuration(st.week)}</span></span>}
                    {st.month > 0 && <span className="text-caption1 text-ios-secondary">Month: <span className="font-semibold text-ios-primary">{fmtDuration(st.month)}</span></span>}
                  </div>
                </div>
                {/* Delete button — admin only, not self */}
                {isAdmin && !isMe && (
                  <button onClick={() => setConfirmDelete(m)}
                    className="p-2 rounded-ios hover:bg-red-50 text-ios-tertiary hover:text-ios-red transition-colors shrink-0"
                    title="Remove member">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {isAdmin && !isMe && (
                <div className="mt-3 pt-3 border-t border-ios-separator/30">
                  <p className="text-caption1 text-ios-tertiary mb-2 uppercase tracking-wide font-semibold">Role</p>
                  <div className="flex gap-2">
                    {Object.entries(ROLES).map(([key, r]) => {
                      const RIcon = r.icon;
                      return (
                        <button key={key} onClick={() => changeRole(m.id, key)}
                          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-ios text-caption1 font-semibold transition-all border ${
                            roleKey === key ? `${r.color} border-current` : 'bg-ios-fill text-ios-secondary border-transparent hover:bg-ios-fill2'
                          }`}>
                          <RIcon className="w-3 h-3" />{r.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="card p-4 bg-ios-bg">
        <p className="text-subhead font-semibold mb-1">How to add teammates</p>
        <p className="text-footnote text-ios-secondary">
          Share the app URL and ask them to sign up. They'll appear here automatically with <strong>Operator</strong> role.
          {isAdmin && ' As Admin, you can change their role or remove them anytime.'}
        </p>
      </div>
    </div>
  );
}
