'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
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

export default function NotificationBell() {
  const router = useRouter();
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState(null);
  const [items, setItems] = useState([]);

  const unread = items.filter(n => !n.read_at).length;

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);
      load(user.id);
    });
  }, []);

  useEffect(() => {
    const close = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  async function load(uid = userId) {
    if (!uid) return;
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(20);
    if (!error) setItems(data || []);
  }

  async function markRead(notification) {
    if (!notification.read_at) {
      const readAt = new Date().toISOString();
      setItems(prev => prev.map(n => n.id === notification.id ? { ...n, read_at: readAt } : n));
      await supabase.from('notifications').update({ read_at: readAt }).eq('id', notification.id);
    }
    if (notification.entity_url) {
      setOpen(false);
      router.push(notification.entity_url);
    }
  }

  async function markAllRead() {
    const readAt = new Date().toISOString();
    setItems(prev => prev.map(n => ({ ...n, read_at: n.read_at || readAt })));
    await supabase.from('notifications').update({ read_at: readAt }).eq('user_id', userId).is('read_at', null);
  }

  return (
    <div ref={ref} className="fixed top-3 right-4 z-50 lg:top-4 lg:right-6">
      <button onClick={() => { setOpen(v => !v); if (!open) load(); }}
        className={`relative w-11 h-11 rounded-ios-lg bg-white/95 backdrop-blur-ios border border-ios-separator/40 shadow-ios flex items-center justify-center transition-all hover:-translate-y-0.5 hover:shadow-ios-lg active:scale-95 ${unread > 0 ? 'text-ios-blue ring-4 ring-blue-50' : 'text-ios-secondary hover:text-ios-primary'}`}
        title="Notifications">
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-ios-red text-white text-[10px] font-bold flex items-center justify-center shadow-ios animate-pulse">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-3 w-[min(24rem,calc(100vw-2rem))] bg-white/95 backdrop-blur-ios rounded-2xl shadow-ios-modal border border-ios-separator/40 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <div className="px-4 py-3 border-b border-ios-separator/30 flex items-center justify-between bg-ios-bg/60">
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
          <div className="max-h-[70vh] overflow-y-auto p-2">
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
                <button key={n.id} onClick={() => markRead(n)}
                  className={`relative w-full text-left p-3 rounded-ios-lg transition-all mb-1 border ${n.read_at ? 'border-transparent hover:bg-ios-bg opacity-75' : 'bg-white border-blue-100 shadow-ios-sm hover:shadow-ios'}`}>
                  <div className="flex items-start gap-3">
                    <span className={`w-9 h-9 rounded-ios flex items-center justify-center shrink-0 ring-1 ${style.bg} ${style.text} ${style.ring}`}>
                      <Icon className="w-4 h-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className="text-[10px] font-bold uppercase text-ios-tertiary">{labelFor(n.type)}</span>
                        <span className="inline-flex items-center gap-1 text-[10px] text-ios-tertiary shrink-0">
                          <Clock3 className="w-3 h-3" />{timeAgo(n.created_at)}
                        </span>
                      </div>
                      <p className={`text-footnote text-ios-primary truncate ${n.read_at ? 'font-semibold' : 'font-bold'}`}>{n.title}</p>
                      {n.body && <p className="text-caption1 text-ios-secondary line-clamp-2 mt-0.5">{n.body}</p>}
                    </div>
                    {!n.read_at && <span className="mt-1.5 w-2 h-2 rounded-full bg-ios-blue shrink-0" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
