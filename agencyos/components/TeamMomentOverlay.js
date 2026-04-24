'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sparkles, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { buildAutomaticMoment, localDateKey } from '@/lib/teamMoments';

export const MOMENT_STYLES = {
  motivation: {
    animal: '🐕',
    accent: '#FF3B30',
    soft: 'rgba(255,59,48,0.16)',
    pill: 'bg-red-50 text-ios-red',
    words: ['MOVE', 'GRIT'],
    vibe: 'bulldog push',
    motion: 'team-moment-style-motivation',
  },
  win: {
    animal: '🦁',
    accent: '#FF9500',
    soft: 'rgba(255,149,0,0.16)',
    pill: 'bg-orange-50 text-ios-orange',
    words: ['WIN', 'ROAR'],
    vibe: 'lion mode',
    motion: 'team-moment-style-win',
  },
  focus: {
    animal: '🦉',
    accent: '#5856D6',
    soft: 'rgba(88,86,214,0.16)',
    pill: 'bg-indigo-50 text-indigo-600',
    words: ['LOCK', 'FOCUS'],
    vibe: 'owl vision',
    motion: 'team-moment-style-focus',
  },
  fun: {
    animal: '🐈',
    accent: '#FF2D55',
    soft: 'rgba(255,45,85,0.16)',
    pill: 'bg-pink-50 text-pink-600',
    words: ['CHAOS', 'HEHE'],
    vibe: 'kitten chaos',
    motion: 'team-moment-style-fun',
  },
};

function TeamMoment({ moment, onDismiss }) {
  const style = MOMENT_STYLES[moment?.style] || MOMENT_STYLES.motivation;
  const senderName = moment?.sender?.full_name || moment?.sender?.email?.split('@')[0] || 'Team';
  const systemLogo = moment?.sender?.isSystem ? '/logo.jpg' : null;

  return (
    <div className="fixed top-[5.1rem] left-1/2 z-[45] w-[min(48rem,calc(100vw-1rem))] -translate-x-1/2 pointer-events-none">
      <div className={`team-moment-scene team-moment-enter ${style.motion} pointer-events-auto`}>
        <button
          onClick={onDismiss}
          className="absolute right-2 top-1 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-ios-secondary shadow-ios transition-colors hover:text-ios-primary"
          title="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="team-moment-layout">
          <div className="team-moment-sticker-cluster" aria-hidden="true">
            <div className="team-moment-burst" style={{ color: style.accent }} />
            <div className="team-moment-animal-wrap" style={{ background: style.soft, borderColor: `${style.accent}44` }}>
              <div className="team-moment-animal-shadow" style={{ background: style.soft }} />
              <div className="team-moment-animal">{style.animal}</div>
            </div>
            <span className={`team-moment-word team-moment-word-a ${style.pill}`}>{style.words[0]}</span>
            <span className={`team-moment-word team-moment-word-b ${style.pill}`}>{style.words[1]}</span>
            <div className="team-moment-sparks">
              <Sparkles className="w-4 h-4" style={{ color: style.accent }} />
              <Sparkles className="w-3 h-3" style={{ color: style.accent }} />
            </div>
          </div>

          <div className="team-moment-copy">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className="team-moment-from">
                {moment?.sender?.avatar_url || systemLogo ? (
                  <img src={moment.sender.avatar_url || systemLogo} alt={senderName} className="w-5 h-5 rounded-full object-cover" />
                ) : (
                  <span className="team-moment-from-avatar">
                    {senderName.slice(0, 1).toUpperCase()}
                  </span>
                )}
                Sent by {senderName}
              </span>
              <span className={`team-moment-mini-tag ${style.pill}`}>{style.vibe}</span>
            </div>

            <div className="team-moment-title-lines">
              <p className="team-moment-title">{moment.title}</p>
              {moment.body && <p className="team-moment-body">{moment.body}</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TeamMomentOverlay({ userId }) {
  const pathname = usePathname();
  const [activeMoment, setActiveMoment] = useState(null);
  const [showMoment, setShowMoment] = useState(false);
  const [currentDeliveryId, setCurrentDeliveryId] = useState(null);
  const [isInterfaceActive, setIsInterfaceActive] = useState(true);
  const queuedTriggerRef = useRef(null);

  function getInterfaceActive() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return true;
    return document.visibilityState === 'visible' && window.document.hasFocus();
  }

  useEffect(() => {
    setIsInterfaceActive(getInterfaceActive());
  }, []);

  useEffect(() => {
    const syncInterfaceState = () => {
      const active = getInterfaceActive();
      setIsInterfaceActive(active);
      if (active && userId) {
        const nextTrigger = queuedTriggerRef.current ?? (pathname === '/dashboard' ? 'dashboard_first_open' : null);
        queuedTriggerRef.current = null;
        hydrateMoment(userId, nextTrigger, { requireActive: false });
      }
    };

    window.addEventListener('focus', syncInterfaceState);
    window.addEventListener('blur', syncInterfaceState);
    document.addEventListener('visibilitychange', syncInterfaceState);

    return () => {
      window.removeEventListener('focus', syncInterfaceState);
      window.removeEventListener('blur', syncInterfaceState);
      document.removeEventListener('visibilitychange', syncInterfaceState);
    };
  }, [userId, pathname]);

  useEffect(() => {
    if (!userId) return;
    hydrateMoment(userId, pathname === '/dashboard' ? 'dashboard_first_open' : null);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`team-moments-${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'team_moments',
      }, () => {
        hydrateMoment(userId, pathname === '/dashboard' ? 'dashboard_first_open' : null);
      })
      .subscribe();

    const interval = setInterval(() => hydrateMoment(userId, pathname === '/dashboard' ? 'dashboard_first_open' : null), 30000);
    const onProgress = () => hydrateMoment(userId, 'progress');

    window.addEventListener('sky:moment-progress', onProgress);

    return () => {
      clearInterval(interval);
      window.removeEventListener('sky:moment-progress', onProgress);
      supabase.removeChannel(channel);
    };
  }, [userId, pathname]);

  useEffect(() => {
    if (!userId) return;
    if (pathname === '/dashboard') {
      hydrateMoment(userId, 'dashboard_first_open');
    }
  }, [pathname, userId]);

  useEffect(() => {
    if (!activeMoment || !showMoment || !userId || !isInterfaceActive) return;
    const timer = setTimeout(() => dismissMoment(), 5200);
    return () => clearTimeout(timer);
  }, [activeMoment, showMoment, userId, isInterfaceActive]);

  async function hydrateMoment(uid, autoTrigger = null, options = {}) {
    const requireActive = options.requireActive !== false;
    if (requireActive && !getInterfaceActive()) {
      if (autoTrigger) queuedTriggerRef.current = autoTrigger;
      return;
    }

    const manualMoment = await loadManualMoment(uid);
    if (manualMoment) {
      setCurrentDeliveryId(manualMoment.delivery_id || null);
      setActiveMoment(manualMoment);
      setShowMoment(true);
      return;
    }

    if (autoTrigger) {
      const automatic = await maybeCreateAutomaticMoment(uid, autoTrigger);
      if (automatic) {
        setCurrentDeliveryId(automatic.delivery_id || null);
        setActiveMoment(automatic);
        setShowMoment(true);
      }
    }
  }

  async function loadManualMoment(uid) {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('team_moments')
      .select('*')
      .eq('is_active', true)
      .order('starts_at', { ascending: false })
      .limit(8);

    if (error) return null;

    const activeMoments = (data || []).filter((item) => {
      const startsOk = !item.starts_at || item.starts_at <= nowIso;
      const endsOk = !item.ends_at || item.ends_at >= nowIso;
      return startsOk && endsOk;
    });

    if (!activeMoments.length) return null;

    const momentIds = activeMoments.map((item) => item.id);
    const { data: deliveries } = await supabase
      .from('team_moment_deliveries')
      .select('team_moment_id,event_key')
      .eq('user_id', uid)
      .eq('delivery_kind', 'manual')
      .in('team_moment_id', momentIds);

    const seenIds = new Set((deliveries || []).map((item) => item.team_moment_id));
    const nextMomentBase = activeMoments.find((item) => !seenIds.has(item.id));
    if (!nextMomentBase) return null;

    const eventKey = `manual:${nextMomentBase.id}:${uid}`;
    const { data: insertedDelivery, error: insertError } = await supabase
      .from('team_moment_deliveries')
      .upsert({
        user_id: uid,
        team_moment_id: nextMomentBase.id,
        delivery_kind: 'manual',
        trigger_type: 'manual',
        style: nextMomentBase.style,
        title: nextMomentBase.title,
        body: nextMomentBase.body,
        delivery_date: localDateKey(),
        event_key: eventKey,
      }, { onConflict: 'event_key' })
      .select('id')
      .single();

    if (insertError) return null;

    let nextMoment = nextMomentBase;
    if (nextMomentBase.created_by) {
      const { data: sender } = await supabase
        .from('profiles')
        .select('full_name, avatar_url, email')
        .eq('id', nextMomentBase.created_by)
        .single();
      nextMoment = { ...nextMomentBase, sender: sender || null };
    }

    return { ...nextMoment, delivery_id: insertedDelivery?.id || null };
  }

  async function maybeCreateAutomaticMoment(uid, triggerType) {
    const today = localDateKey();
    const { data: todayDeliveries, error } = await supabase
      .from('team_moment_deliveries')
      .select('id,trigger_type,shown_at')
      .eq('user_id', uid)
      .eq('delivery_kind', 'automatic')
      .eq('delivery_date', today)
      .order('shown_at', { ascending: false });

    if (error) return null;

    const deliveries = todayDeliveries || [];
    if (deliveries.length >= 2) return null;
    if (deliveries.some((item) => item.trigger_type === triggerType)) return null;

    const autoMoment = buildAutomaticMoment(triggerType);
    const eventKey = `auto:${uid}:${today}:${triggerType}`;
    const { data: insertedDelivery, error: insertError } = await supabase
      .from('team_moment_deliveries')
      .upsert({
        user_id: uid,
        delivery_kind: 'automatic',
        trigger_type: triggerType,
        style: autoMoment.style,
        title: autoMoment.title,
        body: autoMoment.body,
        delivery_date: today,
        event_key: eventKey,
      }, { onConflict: 'event_key' })
      .select('id')
      .single();

    if (insertError) return null;

    return {
      ...autoMoment,
      sender: { full_name: 'Sky Metrics', avatar_url: '/logo.jpg', isSystem: true },
      delivery_id: insertedDelivery?.id || null,
    };
  }

  async function dismissMoment() {
    if (currentDeliveryId) {
      await supabase
        .from('team_moment_deliveries')
        .update({ dismissed_at: new Date().toISOString() })
        .eq('id', currentDeliveryId);
    }
    setCurrentDeliveryId(null);
    setShowMoment(false);
  }

  if (!showMoment || !activeMoment) return null;

  return <TeamMoment moment={activeMoment} onDismiss={dismissMoment} />;
}
