'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { fmtDuration, ROLES } from '@/lib/utils';
import { Crown, Shield, User } from 'lucide-react';

const ROLE_ICONS = { admin: Crown, manager: Shield, operator: User };

export default function TeamPage() {
  const [members, setMembers] = useState([]);
  const [stats, setStats] = useState({});
  const [currentUser, setCurrentUser] = useState(null);
  const [currentProfile, setCurrentProfile] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      setCurrentUser(user);
      const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      setCurrentProfile(p);
      load();
    });
  }, []);

  async function load() {
    const { data: profiles } = await supabase.from('profiles').select('*').order('full_name');
    setMembers(profiles || []);

    const weekStart = new Date(Date.now() - 7 * 86400000).toISOString();
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

    const [{ data: weekEnt }, { data: monthEnt }] = await Promise.all([
      supabase.from('time_entries').select('user_id, duration_seconds').not('end_time', 'is', null).gte('created_at', weekStart),
      supabase.from('time_entries').select('user_id, duration_seconds').not('end_time', 'is', null).gte('created_at', monthStart),
    ]);

    const s = {};
    (weekEnt || []).forEach(e => { if (!s[e.user_id]) s[e.user_id] = { week: 0, month: 0 }; s[e.user_id].week += (e.duration_seconds || 0); });
    (monthEnt || []).forEach(e => { if (!s[e.user_id]) s[e.user_id] = { week: 0, month: 0 }; s[e.user_id].month += (e.duration_seconds || 0); });
    setStats(s);
  }

  async function setRole(memberId, role) {
    await supabase.from('profiles').update({ role }).eq('id', memberId);
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role } : m));
  }

  const isAdmin = currentProfile?.role === 'admin';

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-title2 font-bold text-ios-primary">Echipă</h1>
        <p className="text-subhead text-ios-secondary">{members.length} membri</p>
      </div>

      {/* Info box */}
      <div className="bg-blue-50 rounded-ios-lg p-4">
        <p className="text-subhead font-semibold text-ios-blue mb-1">Cum funcționează accesul?</p>
        <div className="space-y-1">
          {[
            ['Admin', 'Acces complet la tot — clienți, proiecte, rapoarte, echipă'],
            ['Manager', 'Vede toate proiectele și echipa, poate gestiona taskuri'],
            ['Operator', 'Vede proiectele asignate și își gestionează propriul timp'],
          ].map(([role, desc]) => (
            <p key={role} className="text-footnote text-ios-blue/80">
              <span className="font-semibold">{role}:</span> {desc}
            </p>
          ))}
        </div>
      </div>

      {/* Members */}
      <div className="space-y-2">
        {members.map(m => {
          const isMe = m.id === currentUser?.id;
          const role = ROLES[m.role] || ROLES.operator;
          const Icon = ROLE_ICONS[m.role] || User;
          const st = stats[m.id] || { week: 0, month: 0 };
          const initials = (m.full_name || m.email || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

          return (
            <div key={m.id} className={`card p-4 ${isMe ? 'ring-2 ring-ios-blue' : ''}`}>
              <div className="flex items-center gap-3">
                {/* Avatar */}
                <div className="w-12 h-12 bg-ios-blue rounded-full flex items-center justify-center text-white text-headline font-bold shrink-0">
                  {initials}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-subhead font-semibold text-ios-primary">{m.full_name || 'Fără nume'}</p>
                    {isMe && <span className="badge badge-blue">Tu</span>}
                    <span className={`badge ${role.color}`}>
                      <Icon className="w-2.5 h-2.5 mr-1 inline" />{role.label}
                    </span>
                  </div>
                  <p className="text-footnote text-ios-secondary truncate">{m.email}</p>
                  <div className="flex gap-4 mt-1">
                    <span className="text-caption1 text-ios-secondary">
                      Săptămâna: <span className="font-semibold text-ios-primary">{fmtDuration(st.week)}</span>
                    </span>
                    <span className="text-caption1 text-ios-secondary">
                      Luna: <span className="font-semibold text-ios-primary">{fmtDuration(st.month)}</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Role management (admin only, not for self) */}
              {isAdmin && !isMe && (
                <div className="mt-3 flex gap-2">
                  {Object.entries(ROLES).map(([key, r]) => (
                    <button key={key} onClick={() => setRole(m.id, key)}
                      className={`flex-1 py-1.5 rounded-ios text-caption1 font-semibold transition-all ${
                        m.role === key ? 'bg-ios-blue text-white' : 'bg-ios-fill text-ios-secondary hover:bg-ios-fill2'
                      }`}>{r.label}</button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Invite info */}
      <div className="card p-4">
        <p className="text-subhead font-semibold text-ios-primary mb-2">Invită colegi</p>
        <p className="text-footnote text-ios-secondary">
          Trimite-le linkul aplicației și spune-le să creeze un cont cu <strong>"Cont nou"</strong>. 
          Vor apărea automat aici. Rolul implicit este <strong>Operator</strong>.
        </p>
        {isAdmin && (
          <p className="text-footnote text-ios-secondary mt-1">
            Ca Admin, poți schimba rolul oricui după înregistrare.
          </p>
        )}
      </div>
    </div>
  );
}
