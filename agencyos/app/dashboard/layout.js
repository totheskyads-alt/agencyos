'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Sidebar from '@/components/Sidebar';
import GlobalTimer from '@/components/GlobalTimer';
import NotificationBell from '@/components/NotificationBell';
import TeamMomentOverlay from '@/components/TeamMomentOverlay';
import { TimerProvider } from '@/lib/timerContext';
import { Clock3, LogOut, Menu, ShieldAlert, X } from 'lucide-react';

export default function DashboardLayout({ children }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/login'); return; }
      setUser(session.user);
      const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
      setProfile(p);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      if (!session) router.push('/login');
    });
    return () => subscription.unsubscribe();
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-ios-bg">
      <div className="w-8 h-8 border-[3px] border-ios-blue border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const approvalStatus = profile?.approval_status || 'approved';
  const isRestrictedAccount = user && approvalStatus !== 'approved' && profile?.role !== 'admin';

  if (isRestrictedAccount) {
    return (
      <TimerProvider>
        <div className="min-h-screen bg-ios-bg px-4 flex items-center justify-center">
          <div className="w-full max-w-md card p-6 text-center">
            <div className={`w-14 h-14 mx-auto mb-4 rounded-full flex items-center justify-center ${approvalStatus === 'rejected' ? 'bg-red-50 text-ios-red' : 'bg-orange-50 text-ios-orange'}`}>
              {approvalStatus === 'rejected' ? <ShieldAlert className="w-6 h-6" /> : <Clock3 className="w-6 h-6" />}
            </div>
            <h1 className="text-title3 font-bold text-ios-primary">
              {approvalStatus === 'rejected' ? 'Access not approved' : 'Waiting for approval'}
            </h1>
            <p className="text-subhead text-ios-secondary mt-2">
              {approvalStatus === 'rejected'
                ? 'Your account was rejected. Contact the admin if you think this is a mistake.'
                : 'Your account was created, but an admin still needs to approve it before you can use the platform.'}
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={async () => {
                  const { data: { session } } = await supabase.auth.getSession();
                  if (!session) router.push('/login');
                  else {
                    const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
                    setProfile(p);
                  }
                }}
                className="btn-secondary flex-1"
              >
                Refresh
              </button>
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  router.push('/login');
                }}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" /> Sign Out
              </button>
            </div>
          </div>
        </div>
      </TimerProvider>
    );
  }

  return (
    <TimerProvider>
      <div className="flex min-h-screen bg-ios-bg">
        <Sidebar user={user} profile={profile} open={mobileNavOpen} setOpen={setMobileNavOpen} />
        <TeamMomentOverlay userId={user?.id} />

        <header className="fixed top-0 left-0 right-0 lg:left-60 z-40 h-12 bg-white/94 backdrop-blur-ios border-b border-ios-separator/40">
          <div className="h-full px-3 lg:px-5 flex items-center justify-between lg:justify-end gap-3">
            <div className="flex items-center gap-3 min-w-0 lg:hidden">
              <button onClick={() => setMobileNavOpen(v => !v)} className="lg:hidden p-2 -ml-2 rounded-ios hover:bg-ios-fill transition-colors">
                {mobileNavOpen ? <X className="w-5 h-5 text-ios-secondary" /> : <Menu className="w-5 h-5 text-ios-secondary" />}
              </button>
              <Link href="/dashboard" className="flex items-center gap-2 min-w-0 rounded-ios hover:opacity-90 transition-opacity">
                <img src="/logo.jpg" alt="Sky Metrics" className="w-8 h-8 rounded-full object-cover shadow-ios-sm" />
                <div className="min-w-0">
                  <p className="text-subhead font-bold text-ios-primary truncate">Sky Metrics</p>
                </div>
              </Link>
            </div>

            <div className="shrink-0 flex items-center">
              <NotificationBell />
            </div>
          </div>
        </header>

        <main className="flex-1 lg:ml-60 pt-12 pb-16 min-h-screen">
          <div className="p-3 lg:p-5">
            {children}
          </div>
        </main>
        <GlobalTimer />
      </div>
    </TimerProvider>
  );
}
