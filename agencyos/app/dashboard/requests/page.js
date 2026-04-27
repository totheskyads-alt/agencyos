'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRole } from '@/lib/useRole';
import { useRouter } from 'next/navigation';
import { Mail, Building2, Users, Clock, CheckCircle, XCircle, Inbox } from 'lucide-react';

const STATUS_COLORS = {
  new: 'badge-blue',
  contacted: 'badge-orange',
  approved: 'badge-green',
  rejected: 'badge-red',
};

function fmtDate(v) {
  if (!v) return '';
  return new Date(v).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function RequestsPage() {
  const { role, isAdmin } = useRole();
  const router = useRouter();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (role && !isAdmin) { router.replace('/dashboard'); return; }
    if (isAdmin) load();
  }, [isAdmin, role]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('contact_requests')
      .select('*')
      .order('created_at', { ascending: false });
    setRequests(data || []);
    setLoading(false);
  }

  async function updateStatus(id, status) {
    await supabase.from('contact_requests').update({ status }).eq('id', id);
    load();
  }

  if (!isAdmin) return null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-title2 font-bold text-ios-primary">Access Requests</h1>
        <p className="text-subhead text-ios-secondary">Requests submitted from the landing page.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><div className="w-6 h-6 border-[3px] border-ios-blue border-t-transparent rounded-full animate-spin" /></div>
      ) : requests.length === 0 ? (
        <div className="card p-12 text-center">
          <Inbox className="w-8 h-8 text-ios-label4 mx-auto mb-3" />
          <p className="text-headline font-semibold text-ios-secondary">No requests yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(r => (
            <div key={r.id} className="card p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-subhead font-bold text-ios-primary">{r.full_name}</p>
                    <span className={`badge ${STATUS_COLORS[r.status] || 'badge-gray'} capitalize`}>{r.status}</span>
                  </div>
                  <div className="flex flex-wrap gap-3 text-footnote text-ios-secondary mt-1">
                    <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{r.email}</span>
                    <span className="flex items-center gap-1 capitalize"><Users className="w-3.5 h-3.5" />{r.account_type}{r.seats ? ` · ${r.seats} seats` : ''}</span>
                    {r.company_name && <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" />{r.company_name}</span>}
                    <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{fmtDate(r.created_at)}</span>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  {r.status !== 'approved' && (
                    <button onClick={() => updateStatus(r.id, 'approved')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-ios bg-green-50 text-ios-green text-caption1 font-semibold hover:bg-green-100 transition-colors">
                      <CheckCircle className="w-3.5 h-3.5" /> Approve
                    </button>
                  )}
                  {r.status !== 'contacted' && r.status !== 'approved' && (
                    <button onClick={() => updateStatus(r.id, 'contacted')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-ios bg-orange-50 text-ios-orange text-caption1 font-semibold hover:bg-orange-100 transition-colors">
                      Contacted
                    </button>
                  )}
                  {r.status !== 'rejected' && (
                    <button onClick={() => updateStatus(r.id, 'rejected')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-ios bg-red-50 text-ios-red text-caption1 font-semibold hover:bg-red-100 transition-colors">
                      <XCircle className="w-3.5 h-3.5" /> Reject
                    </button>
                  )}
                  <a href={`mailto:${r.email}`} className="flex items-center gap-1.5 px-3 py-1.5 rounded-ios bg-ios-fill text-ios-secondary text-caption1 font-semibold hover:bg-ios-fill2 transition-colors">
                    <Mail className="w-3.5 h-3.5" /> Email
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
