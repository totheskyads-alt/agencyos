'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ensureDueTodayTaskNotifications } from '@/lib/notifications';
import { AtSign, Bell, BriefcaseBusiness, CheckCheck, Clock3, MessageCircle, ReceiptText, Sparkles, X } from 'lucide-react';

function labelFor(type) {
  return {
    invoice_due: 'Billing',
    task_assigned: 'Task',
    project_assigned: 'Project',
    comment_mention: 'Mention',
    broadcast: 'Message',
  }[type] || 'Notice';
}

function styleFor(type) {
  return {
    invoice_due: {
      icon: ReceiptText,
      bg: 'bg-orange-50',
      text: 'text-ios-orange',
      ring: 'ring-orange-100',
    },
    task_assigned: {
      icon: CheckCheck,
      bg: 'bg-blue-50',
      text: 'text-ios-blue',
      ring: 'ring-blue-100',
    },
    project_assigned: {
      icon: BriefcaseBusiness,
      bg: 'bg-green-50',
      text: 'text-ios-green',
      ring: 'ring-green-100',
    },
    comment_mention: {
      icon: AtSign,
      bg: 'bg-purple-50',
      text: 'text-ios-purple',
      ring: 'ring-purple-100',
    },
    broadcast: {
      icon: MessageCircle,
      bg: 'bg-blue-50',
      text: 'text-ios-blue',
      ring: 'ring-blue-100',
    },
  }[type] || {
    icon: Sparkles,
    bg: 'bg-ios-fill',
    text: 'text-ios-secondary',
    ring: 'ring-ios-separator/30',
  };
}

function timeAgo(value) {
  if (!value) return '';
  const diff = Date.now() - new Date(value).getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return 'now';
  if (diff < hour) return `${Math.floor(diff / minute)}m`;
  if (diff < day) return `${Math.floor(diff / hour)}h`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d`;
  return new Date(value).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}

function playNotificationSound() {
  if (typeof window === 'undefined') return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;

  const context = new AudioContext();
  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, context.currentTime);
  master.gain.exponentialRampToValueAtTime(0.13, context.currentTime + 0.02);
  master.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.72);
  master.connect(context.destination);

  [660, 880].forEach((frequency, index) => {
    const start = context.currentTime + index * 0.13;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.8, start + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.34);
    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + 0.36);
  });

  setTimeout(() => context.close().catch(() => {}), 900);
}

export default function NotificationBell() {
  const router = useRouter();
  const ref = useRef(null);
  const initializedRef = useRef(false);
  const latestSeenRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState(null);
  const [items, setItems] = useState([]);

  const unread = items.filter(n => !n.read_at).length;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user;
      if (!user) return;
      setUserId(user.id);
      load(user.id);
      ensureDueTodayTaskNotifications(user.id);
    });
  }, []);

  useEffect(() => {
    const close = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      }, payload => {
        const notification = payload.new;
        setItems(prev => [notification, ...prev.filter(n => n.id !== notification.id)].slice(0, 20));
        playNotificationSound();
      })
      .subscribe();

    const interval = setInterval(() => load(userId), 20000);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [userId]);

  async function load(uid = userId) {
    if (!uid) return;
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(20);
    if (!error) {
      const nextItems = data || [];
      const newest = nextItems[0];
      if (initializedRef.current && newest?.id && latestSeenRef.current && newest.id !== latestSeenRef.current && !newest.read_at) {
        playNotificationSound();
      }
      latestSeenRef.current = newest?.id || null;
      initializedRef.current = true;
      setItems(nextItems);
    }
  }

  async function destinationFor(notification) {
    if (notification.type === 'task_assigned' && notification.entity_id) {
      return `/dashboard/tasks?task=${notification.entity_id}&mode=list`;
    }
    if (notification.type === 'project_assigned' && notification.entity_id) {
      return `/dashboard/projects?project=${notification.entity_id}`;
    }
    if (notification.type === 'comment_mention' && notification.entity_id) {
      const { data } = await supabase
        .from('task_comments')
        .select('id,task_id,tasks(project_id)')
        .eq('id', notification.entity_id)
        .single();
      if (data?.task_id) {
        return `/dashboard/tasks?task=${data.task_id}&tab=comments&comment=${notification.entity_id}&mode=list${data.tasks?.project_id ? `&project=${data.tasks.project_id}` : ''}`;
      }
    }
    if (notification.type === 'invoice_due' && notification.entity_id) {
      const { data } = await supabase
        .from('projects')
        .select('id,client_id')
        .eq('id', notification.entity_id)
        .single();
      if (data?.client_id) return `/dashboard/billing?newInvoice=1&client=${data.client_id}&project=${data.id}`;
    }
    return notification.entity_url;
  }

  async function markRead(notification) {
    if (!notification.read_at) {
      const readAt = new Date().toISOString();
      setItems(prev => prev.map(n => n.id === notification.id ? { ...n, read_at: readAt } : n));
      await supabase.from('notifications').update({ read_at: readAt }).eq('id', notification.id);
    }
    const destination = await destinationFor(notification);
    if (destination) {
      setOpen(false);
      router.push(destination);
    }
  }

  async function markOnlyRead(notification) {
    if (notification.read_at) return;
    const readAt = new Date().toISOString();
    setItems(prev => prev.map(n => n.id === notification.id ? { ...n, read_at: readAt } : n));
    await supabase.from('notifications').update({ read_at: readAt }).eq('id', notification.id);
  }

  async function markAllRead() {
    const readAt = new Date().toISOString();
    setItems(prev => prev.map(n => ({ ...n, read_at: n.read_at || readAt })));
    await supabase.from('notifications').update({ read_at: readAt }).eq('user_id', userId).is('read_at', null);
  }

  return (
    <div ref={ref} className="relative z-50">
      <button onClick={() => { setOpen(v => !v); if (!open) load(); }}
        className={`relative h-11 rounded-ios-lg border shadow-ios flex items-center justify-center transition-all hover:-translate-y-0.5 hover:shadow-ios-lg active:scale-95 ${unread > 0 ? 'px-3.5 gap-2.5 bg-blue-50 border-blue-200 text-ios-blue ring-4 ring-blue-100' : 'w-11 bg-white border-ios-separator/70 text-ios-secondary hover:text-ios-primary hover:border-ios-separator'}`}
        title="Notifications">
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="hidden sm:block text-footnote font-semibold whitespace-nowrap">Notifications</span>
        )}
        {unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-ios-red text-white text-[10px] font-bold flex items-center justify-center shadow-ios animate-pulse">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-3 w-[min(24rem,calc(100vw-1.5rem))] bg-white rounded-[22px] shadow-ios-modal border border-ios-separator/60 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <div className="px-4 py-3 border-b border-ios-separator/30 flex items-center justify-between bg-white">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-subhead font-bold text-ios-primary">Notifications</p>
                {unread > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-ios-blue text-white text-[10px] font-bold">
                    {unread} new
                  </span>
                )}
              </div>
              <p className="text-caption1 text-ios-secondary">Tasks, mentions and billing reminders</p>
            </div>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button onClick={markAllRead} className="p-2 rounded-ios hover:bg-white text-ios-blue transition-colors" title="Mark all read">
                  <CheckCheck className="w-4 h-4" />
                </button>
              )}
              <button onClick={() => setOpen(false)} className="p-2 rounded-ios hover:bg-white text-ios-tertiary transition-colors" title="Close">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="max-h-[70vh] overflow-y-auto p-2 bg-ios-bg/70">
            {items.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-12 h-12 rounded-full bg-blue-50 text-ios-blue flex items-center justify-center mx-auto mb-3">
                  <Bell className="w-5 h-5" />
                </div>
                <p className="text-subhead font-semibold text-ios-primary">All clear</p>
                <p className="text-footnote text-ios-tertiary mt-1">Mentions, assigned tasks and invoice reminders will appear here.</p>
              </div>
            ) : items.map(n => {
              const style = styleFor(n.type);
              const Icon = style.icon;
              return (
                <div key={n.id}
                  className={`relative w-full p-3 rounded-[18px] transition-all mb-2 border ${n.read_at ? 'bg-white border-ios-separator/30 hover:bg-ios-bg/70 opacity-90' : 'bg-white border-blue-100 shadow-ios-sm hover:shadow-ios'}`}>
                  <div className="flex items-start gap-3">
                    <button onClick={() => markRead(n)}
                      className={`w-9 h-9 rounded-[14px] flex items-center justify-center shrink-0 ring-1 ${style.bg} ${style.text} ${style.ring}`}
                      title="Open notification">
                      <Icon className="w-4 h-4" />
                    </button>
                    <button onClick={() => markRead(n)} className="min-w-0 flex-1 text-left" title="Open notification">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className="text-[10px] font-bold uppercase text-ios-tertiary">{labelFor(n.type)}</span>
                        <span className="inline-flex items-center gap-1 text-[10px] text-ios-tertiary shrink-0">
                          <Clock3 className="w-3 h-3" />{timeAgo(n.created_at)}
                        </span>
                      </div>
                      <p className={`text-footnote text-ios-primary truncate ${n.read_at ? 'font-semibold' : 'font-bold'}`}>{n.title}</p>
                      {n.body && <p className="text-caption1 text-ios-secondary line-clamp-2 mt-0.5">{n.body}</p>}
                    </button>
                    {n.read_at ? (
                      <span className="mt-1.5 w-2 h-2 rounded-full bg-ios-tertiary/60 shrink-0" />
                    ) : (
                      <button onClick={() => markOnlyRead(n)}
                        className="mt-0.5 w-7 h-7 rounded-ios bg-blue-50 text-ios-blue hover:bg-blue-100 flex items-center justify-center shrink-0 transition-colors"
                        title="Mark read">
                        <CheckCheck className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
