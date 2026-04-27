'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useRole } from '@/lib/useRole';
import {
  Plus, X, Phone, Mail, Calendar, TrendingUp, CheckCircle,
  AlertCircle, Search, Trash2, ExternalLink, Edit3, ChevronDown,
  Target, Users, ArrowRight, Clock,
} from 'lucide-react';

// ── Constants ──────────────────────────────────────────────────────────────

const STAGES = [
  { id: 'lead',       label: 'Lead',       color: '#8E8E93', lightBg: 'bg-gray-100',   lightText: 'text-gray-500',   desc: 'Contact nou, necalificat' },
  { id: 'interesat',  label: 'Interesat',  color: '#007AFF', lightBg: 'bg-blue-50',    lightText: 'text-ios-blue',   desc: 'A arătat interes' },
  { id: 'oferta',     label: 'Ofertă',     color: '#FF9500', lightBg: 'bg-orange-50',  lightText: 'text-ios-orange', desc: 'Ofertă trimisă, în negociere' },
  { id: 'onboarding', label: 'Onboarding', color: '#AF52DE', lightBg: 'bg-purple-50',  lightText: 'text-ios-purple', desc: 'A acceptat, setup în curs' },
  { id: 'client',     label: 'Client ✓',   color: '#34C759', lightBg: 'bg-green-50',   lightText: 'text-ios-green',  desc: 'Client activ' },
];

const SIDE_STAGES = [
  { id: 'followup', label: 'Follow-up', color: '#FF9500', lightBg: 'bg-orange-50', lightText: 'text-ios-orange' },
  { id: 'decline',  label: 'Declinat',  color: '#FF3B30', lightBg: 'bg-red-50',    lightText: 'text-ios-red' },
];

const ALL_STAGES = [...STAGES, ...SIDE_STAGES];

const SOURCES = [
  { id: 'instagram', label: 'Instagram',  emoji: '📸' },
  { id: 'facebook',  label: 'Facebook',   emoji: '📘' },
  { id: 'tiktok',    label: 'TikTok',     emoji: '🎵' },
  { id: 'site',      label: 'Site web',   emoji: '🌐' },
  { id: 'referral',  label: 'Referral',   emoji: '🤝' },
  { id: 'email',     label: 'Email',      emoji: '📧' },
  { id: 'telefon',   label: 'Telefon',    emoji: '📞' },
  { id: 'manual',    label: 'Manual',     emoji: '✍️' },
  { id: 'other',     label: 'Altul',      emoji: '💡' },
];

const ACTIVITY_TYPES = [
  { id: 'note',          label: 'Notă',          emoji: '📝' },
  { id: 'call',          label: 'Call',           emoji: '📞' },
  { id: 'email',         label: 'Email',          emoji: '✉️' },
  { id: 'offer',         label: 'Ofertă',         emoji: '📄' },
  { id: 'meeting',       label: 'Întâlnire',      emoji: '👥' },
  { id: 'whatsapp',      label: 'WhatsApp',       emoji: '💬' },
  { id: 'status_change', label: 'Schimb. etapă',  emoji: '🔄' },
];

const EMPTY_LEAD = {
  name: '', company: '', email: '', phone: '',
  stage: 'lead', source: 'manual', value: '',
  notes: '', expected_close_date: '', assigned_to: '',
};

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtEur(val) {
  if (!val && val !== 0) return '—';
  const n = parseFloat(val);
  if (isNaN(n) || n === 0) return '—';
  return new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

function fmtDate(val) {
  if (!val) return '';
  return new Date(val).toLocaleDateString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtTimeAgo(val) {
  if (!val) return '—';
  const diff = Date.now() - new Date(val).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 2) return 'acum';
  if (mins < 60) return `${mins} min`;
  if (hours < 24) return `${hours}h`;
  if (days === 1) return 'ieri';
  return `${days} zile`;
}

function daysSince(val) {
  if (!val) return 0;
  return Math.floor((Date.now() - new Date(val).getTime()) / 86400000);
}

function srcInfo(id) {
  return SOURCES.find(s => s.id === id) || { label: id, emoji: '•' };
}

function stageInfo(id) {
  return ALL_STAGES.find(s => s.id === id) || { label: id, color: '#8E8E93', lightBg: 'bg-gray-100', lightText: 'text-gray-500' };
}

// ── Main component ─────────────────────────────────────────────────────────

export default function CRMPage() {
  const { can } = useRole();

  // Data
  const [leads, setLeads]         = useState([]);
  const [members, setMembers]     = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading]     = useState(true);

  // UI
  const [selectedLead, setSelectedLead]         = useState(null);
  const [leadActivities, setLeadActivities]     = useState([]);
  const [showAddLead, setShowAddLead]           = useState(false); // false | true | 'edit'
  const [form, setForm]                         = useState(EMPTY_LEAD);
  const [activityForm, setActivityForm]         = useState({ type: 'note', content: '' });
  const [saving, setSaving]                     = useState(false);
  const [savingActivity, setSavingActivity]     = useState(false);
  const [search, setSearch]                     = useState('');
  const [dragOver, setDragOver]                 = useState(null);
  const [converting, setConverting]             = useState(false);
  const dragLeadId = useRef(null);

  useEffect(() => { loadData(); }, []);
  useEffect(() => { if (selectedLead) loadActivities(selectedLead.id); }, [selectedLead?.id]);

  // ── Load ──────────────────────────────────────────────────────────────

  async function loadData() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUser(user);

    const [{ data: leadsData }, { data: membersData }] = await Promise.all([
      supabase.from('leads')
        .select('*, assignee:profiles!leads_assigned_to_fkey(id,full_name,avatar_url)')
        .order('created_at', { ascending: false }),
      supabase.from('profiles')
        .select('id,full_name,avatar_url,email')
        .or('is_deleted.is.null,is_deleted.eq.false')
        .neq('approval_status', 'pending')
        .order('full_name'),
    ]);

    setLeads(leadsData || []);
    setMembers(membersData || []);
    setLoading(false);
  }

  async function loadActivities(leadId) {
    const { data } = await supabase
      .from('lead_activities')
      .select('*, profiles(id,full_name,avatar_url)')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });
    setLeadActivities(data || []);
  }

  // ── CRUD ──────────────────────────────────────────────────────────────

  async function saveLead() {
    if (!form.name.trim()) return;
    setSaving(true);

    const payload = {
      name:                 form.name.trim(),
      company:              form.company.trim() || null,
      email:                form.email.trim()   || null,
      phone:                form.phone.trim()   || null,
      stage:                form.stage,
      source:               form.source,
      value:                parseFloat(form.value) || 0,
      notes:                form.notes.trim()   || null,
      expected_close_date:  form.expected_close_date || null,
      assigned_to:          form.assigned_to    || null,
    };

    if (showAddLead === 'edit' && selectedLead?.id) {
      await supabase.from('leads').update(payload).eq('id', selectedLead.id);
      const updated = { ...selectedLead, ...payload };
      setLeads(prev => prev.map(l => l.id === selectedLead.id ? updated : l));
      setSelectedLead(updated);
    } else {
      const { data } = await supabase.from('leads')
        .insert({ ...payload, created_by: currentUser?.id })
        .select('*, assignee:profiles!leads_assigned_to_fkey(id,full_name,avatar_url)')
        .single();
      if (data) {
        setLeads(prev => [data, ...prev]);
        await supabase.from('lead_activities').insert({
          lead_id: data.id,
          user_id: currentUser?.id,
          type: 'note',
          content: `Lead adăugat din sursa: ${srcInfo(form.source).label}`,
        });
      }
    }

    setSaving(false);
    setShowAddLead(false);
    setForm(EMPTY_LEAD);
  }

  async function addActivity() {
    if (!activityForm.content.trim() || !selectedLead) return;
    setSavingActivity(true);

    const { data } = await supabase.from('lead_activities')
      .insert({ lead_id: selectedLead.id, user_id: currentUser?.id, type: activityForm.type, content: activityForm.content.trim() })
      .select('*, profiles(id,full_name,avatar_url)')
      .single();

    if (data) {
      setLeadActivities(prev => [data, ...prev]);
      const now = new Date().toISOString();
      setLeads(prev => prev.map(l => l.id === selectedLead.id ? { ...l, last_activity_at: now } : l));
      setSelectedLead(prev => prev ? { ...prev, last_activity_at: now } : null);
    }

    setActivityForm({ type: 'note', content: '' });
    setSavingActivity(false);
  }

  async function changeStage(leadId, newStage, oldStage) {
    if (newStage === oldStage) return;
    const newLabel = stageInfo(newStage).label;
    const oldLabel = stageInfo(oldStage).label;

    await supabase.from('leads').update({ stage: newStage }).eq('id', leadId);
    await supabase.from('lead_activities').insert({
      lead_id: leadId,
      user_id: currentUser?.id,
      type: 'status_change',
      content: `Etapă: ${oldLabel} → ${newLabel}`,
    });

    const now = new Date().toISOString();
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, stage: newStage, last_activity_at: now } : l));
    if (selectedLead?.id === leadId) {
      setSelectedLead(prev => prev ? { ...prev, stage: newStage, last_activity_at: now } : null);
      loadActivities(leadId);
    }
  }

  async function convertToClient(lead) {
    if (converting) return;
    if (!confirm(`Convertești "${lead.name}" în client real?\nSe va crea un profil nou în secțiunea Clients.`)) return;
    setConverting(true);

    const { data: client, error } = await supabase.from('clients')
      .insert({ name: lead.name, company: lead.company, email: lead.email, phone: lead.phone, notes: lead.notes, client_type: 'direct' })
      .select().single();

    if (error || !client) { alert('Nu s-a putut crea clientul. Încearcă din nou.'); setConverting(false); return; }

    await supabase.from('leads').update({ stage: 'client', converted_client_id: client.id }).eq('id', lead.id);
    await supabase.from('lead_activities').insert({
      lead_id: lead.id, user_id: currentUser?.id, type: 'status_change',
      content: `✅ Convertit în client! Profil creat în secțiunea Clients.`,
    });

    const now = new Date().toISOString();
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, stage: 'client', converted_client_id: client.id, last_activity_at: now } : l));
    setSelectedLead(prev => prev ? { ...prev, stage: 'client', converted_client_id: client.id, last_activity_at: now } : null);
    loadActivities(lead.id);
    setConverting(false);

    alert(`✅ "${lead.name}" a fost adăugat în Clients!`);
  }

  async function deleteLead(lead) {
    if (!confirm(`Ștergi lead-ul "${lead.name}"? Acțiunea nu poate fi anulată.`)) return;
    await supabase.from('leads').delete().eq('id', lead.id);
    setLeads(prev => prev.filter(l => l.id !== lead.id));
    if (selectedLead?.id === lead.id) setSelectedLead(null);
  }

  // ── Drag & drop ───────────────────────────────────────────────────────

  function handleDragStart(leadId) { dragLeadId.current = leadId; }

  function handleDrop(stageId) {
    if (!dragLeadId.current) return;
    const lead = leads.find(l => l.id === dragLeadId.current);
    if (lead && lead.stage !== stageId) changeStage(dragLeadId.current, stageId, lead.stage);
    setDragOver(null);
    dragLeadId.current = null;
  }

  // ── Computed ──────────────────────────────────────────────────────────

  const forecast = useMemo(() => {
    const r = {};
    ALL_STAGES.forEach(s => { r[s.id] = 0; });
    leads.forEach(l => { if (l.value) r[l.stage] = (r[l.stage] || 0) + parseFloat(l.value); });
    return r;
  }, [leads]);

  const totalPipeline = useMemo(() =>
    STAGES.slice(0, 4).reduce((s, st) => s + (forecast[st.id] || 0), 0), [forecast]);

  const filteredLeads = useMemo(() => {
    if (!search) return leads;
    const q = search.toLowerCase();
    return leads.filter(l => (l.name || '').toLowerCase().includes(q) || (l.company || '').toLowerCase().includes(q) || (l.email || '').toLowerCase().includes(q));
  }, [leads, search]);

  const inactiveCount = useMemo(() =>
    leads.filter(l => !['client', 'decline'].includes(l.stage) && daysSince(l.last_activity_at) >= 5).length,
    [leads]
  );

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 pb-8">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-title2 font-bold text-ios-primary">Pipeline CRM</h1>
          <p className="text-subhead text-ios-secondary">
            {leads.length} lead-uri · Pipeline {fmtEur(totalPipeline)}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {inactiveCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-2 bg-orange-50 border border-orange-100 rounded-ios text-footnote font-semibold text-ios-orange">
              <AlertCircle className="w-3.5 h-3.5" />
              {inactiveCount} fără activitate 5+ zile
            </div>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-tertiary" />
            <input className="input pl-9 !py-2 w-44 text-footnote" placeholder="Caută lead..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button onClick={() => { setForm(EMPTY_LEAD); setShowAddLead(true); }} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" strokeWidth={2.5} /> Lead nou
          </button>
        </div>
      </div>

      {/* ── Forecast cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {STAGES.map(stage => {
          const count = filteredLeads.filter(l => l.stage === stage.id).length;
          return (
            <div key={stage.id} className="card-section p-3">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: stage.color }} />
                  <span className="text-caption1 font-bold text-ios-secondary">{stage.label}</span>
                </div>
                <span className={`text-caption2 font-bold px-1.5 py-0.5 rounded-full ${stage.lightBg} ${stage.lightText}`}>{count}</span>
              </div>
              <p className="text-subhead font-bold text-ios-primary">{fmtEur(forecast[stage.id])}</p>
              <p className="text-caption2 text-ios-tertiary mt-0.5 line-clamp-1">{stage.desc}</p>
            </div>
          );
        })}
      </div>

      {/* ── Kanban board ────────────────────────────────────────────── */}
      <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollSnapType: 'x mandatory' }}>
        {STAGES.map(stage => {
          const stageLeads = filteredLeads.filter(l => l.stage === stage.id);
          const isTarget = dragOver === stage.id;

          return (
            <div
              key={stage.id}
              style={{ scrollSnapAlign: 'start' }}
              className={`flex-shrink-0 w-60 flex flex-col rounded-ios-lg transition-all duration-150 ${isTarget ? 'ring-2 ring-ios-blue/50 bg-blue-50/40 scale-[1.01]' : 'bg-ios-fill/40'}`}
              onDragOver={e => { e.preventDefault(); setDragOver(stage.id); }}
              onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(null); }}
              onDrop={() => handleDrop(stage.id)}
            >
              {/* Column header */}
              <div className="px-3 pt-3 pb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: stage.color }} />
                  <span className="text-footnote font-bold text-ios-primary">{stage.label}</span>
                  <span className="text-caption2 font-semibold text-ios-tertiary bg-white px-1.5 py-0.5 rounded-full shadow-ios-sm">{stageLeads.length}</span>
                </div>
                <span className="text-caption2 font-bold text-ios-secondary">{fmtEur(forecast[stage.id])}</span>
              </div>

              {/* Cards */}
              <div className="flex-1 px-2 space-y-2 min-h-[100px]">
                {stageLeads.map(lead => {
                  const inactive = daysSince(lead.last_activity_at) >= 5;
                  const src = srcInfo(lead.source);
                  return (
                    <div
                      key={lead.id}
                      draggable
                      onDragStart={() => handleDragStart(lead.id)}
                      onClick={() => setSelectedLead(lead)}
                      className={`bg-white rounded-ios px-3 pt-3 pb-2.5 shadow-ios-sm cursor-pointer hover:shadow-ios transition-all active:scale-95 select-none border-l-[3px] ${inactive ? 'border-ios-orange' : 'border-transparent hover:border-ios-blue/40'}`}
                    >
                      <div className="flex items-start justify-between gap-1.5">
                        <p className="text-footnote font-semibold text-ios-primary leading-snug line-clamp-2 flex-1">{lead.name}</p>
                        {lead.value > 0 && (
                          <span className="text-caption2 font-bold text-ios-green shrink-0 mt-0.5">{fmtEur(lead.value)}</span>
                        )}
                      </div>
                      {lead.company && (
                        <p className="text-caption1 text-ios-secondary mt-0.5 line-clamp-1">{lead.company}</p>
                      )}
                      <div className="flex items-center justify-between mt-2 gap-2">
                        <span className="text-caption2 text-ios-tertiary">{src.emoji} {src.label}</span>
                        <div className="flex items-center gap-1.5">
                          {inactive && <AlertCircle className="w-3 h-3 text-ios-orange" title="5+ zile fără activitate" />}
                          {lead.expected_close_date && (
                            <span className="text-caption2 text-ios-tertiary">{fmtDate(lead.expected_close_date)}</span>
                          )}
                        </div>
                      </div>
                      {lead.assignee?.full_name && (
                        <p className="text-caption2 text-ios-tertiary mt-1.5 flex items-center gap-1">
                          <span className="w-3.5 h-3.5 rounded-full bg-ios-fill inline-flex items-center justify-center text-[8px] font-bold text-ios-secondary">
                            {lead.assignee.full_name[0]}
                          </span>
                          {lead.assignee.full_name.split(' ')[0]}
                        </p>
                      )}
                    </div>
                  );
                })}

                {stageLeads.length === 0 && (
                  <div className="h-14 flex items-center justify-center border-2 border-dashed border-ios-label4 rounded-ios">
                    <p className="text-caption2 text-ios-label4">Gol</p>
                  </div>
                )}
              </div>

              {/* Quick add */}
              <button
                onClick={() => { setForm({ ...EMPTY_LEAD, stage: stage.id }); setShowAddLead(true); }}
                className="mx-2 my-2 py-1.5 rounded-ios text-caption1 font-semibold text-ios-tertiary hover:text-ios-blue hover:bg-white/80 transition-colors flex items-center justify-center gap-1"
              >
                <Plus className="w-3 h-3" /> Adaugă
              </button>
            </div>
          );
        })}
      </div>

      {/* ── Side stages (Follow-up + Decline) ───────────────────────── */}
      {SIDE_STAGES.map(stage => {
        const stageLeads = filteredLeads.filter(l => l.stage === stage.id);
        if (stageLeads.length === 0) return null;
        return (
          <div key={stage.id} className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-ios-separator/30 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ background: stage.color }} />
              <span className="text-footnote font-bold text-ios-primary">{stage.label}</span>
              <span className="badge badge-gray">{stageLeads.length}</span>
            </div>
            {stageLeads.map(lead => (
              <div key={lead.id} onClick={() => setSelectedLead(lead)} className="list-row cursor-pointer hover:bg-ios-bg gap-3 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-footnote font-semibold text-ios-primary">{lead.name}
                    {lead.company && <span className="text-ios-secondary font-normal"> · {lead.company}</span>}
                  </p>
                </div>
                {lead.value > 0 && <span className="text-footnote font-bold text-ios-green">{fmtEur(lead.value)}</span>}
                <span className="text-caption2 text-ios-tertiary shrink-0">{fmtTimeAgo(lead.last_activity_at)}</span>
              </div>
            ))}
          </div>
        );
      })}

      {/* Empty state */}
      {!loading && leads.length === 0 && (
        <div className="card-section p-12 text-center">
          <Target className="w-10 h-10 text-ios-label4 mx-auto mb-3" />
          <p className="text-headline font-semibold text-ios-secondary">Pipeline gol</p>
          <p className="text-footnote text-ios-tertiary mt-1 mb-4">Adaugă primul lead și începe să urmărești oportunitățile tale.</p>
          <button onClick={() => { setForm(EMPTY_LEAD); setShowAddLead(true); }} className="btn-primary">
            <Plus className="w-4 h-4 inline mr-1.5" />Adaugă primul lead
          </button>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-ios-blue border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* ── Add / Edit Lead modal ────────────────────────────────────── */}
      {showAddLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && setShowAddLead(false)}>
          <div className="bg-white rounded-ios-xl shadow-ios-modal w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-5 py-4 border-b border-ios-separator/30 flex items-center justify-between">
              <h3 className="text-headline font-bold text-ios-primary">{showAddLead === 'edit' ? 'Editează lead' : 'Lead nou'}</h3>
              <button onClick={() => setShowAddLead(false)} className="w-7 h-7 rounded-full bg-ios-fill flex items-center justify-center hover:bg-ios-fill2 transition-colors">
                <X className="w-3.5 h-3.5 text-ios-secondary" />
              </button>
            </div>

            <div className="p-5 space-y-3 overflow-y-auto max-h-[80vh]">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="input-label">Nume *</label>
                  <input className="input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Ion Popescu" autoFocus />
                </div>
                <div>
                  <label className="input-label">Companie</label>
                  <input className="input" value={form.company} onChange={e => setForm(p => ({ ...p, company: e.target.value }))} placeholder="SRL / PFA" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="input-label">Email</label>
                  <input className="input" type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="email@exemplu.ro" />
                </div>
                <div>
                  <label className="input-label">Telefon</label>
                  <input className="input" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="+40 7xx xxx xxx" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="input-label">Etapă</label>
                  <select className="input" value={form.stage} onChange={e => setForm(p => ({ ...p, stage: e.target.value }))}>
                    {ALL_STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="input-label">Sursă</label>
                  <select className="input" value={form.source} onChange={e => setForm(p => ({ ...p, source: e.target.value }))}>
                    {SOURCES.map(s => <option key={s.id} value={s.id}>{s.emoji} {s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="input-label">Valoare (€)</label>
                  <input className="input" type="number" min="0" value={form.value} onChange={e => setForm(p => ({ ...p, value: e.target.value }))} placeholder="0" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="input-label">Responsabil</label>
                  <select className="input" value={form.assigned_to} onChange={e => setForm(p => ({ ...p, assigned_to: e.target.value }))}>
                    <option value="">Neasignat</option>
                    {members.map(m => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
                  </select>
                </div>
                <div>
                  <label className="input-label">Data estimată close</label>
                  <input className="input" type="date" value={form.expected_close_date} onChange={e => setForm(p => ({ ...p, expected_close_date: e.target.value }))} />
                </div>
              </div>

              <div>
                <label className="input-label">Note inițiale</label>
                <textarea className="input" rows={3} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Context, nevoi, detalii importante..." />
              </div>

              <div className="flex gap-3 pt-1">
                <button className="btn-secondary flex-1" onClick={() => setShowAddLead(false)}>Anulează</button>
                <button className="btn-primary flex-1" onClick={saveLead} disabled={saving || !form.name.trim()}>
                  {saving ? 'Se salvează...' : showAddLead === 'edit' ? 'Salvează' : 'Adaugă lead'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Lead Detail Panel ────────────────────────────────────────── */}
      {selectedLead && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setSelectedLead(null)} />
          <div className="ml-auto relative w-full max-w-md bg-white h-full shadow-ios-modal flex flex-col overflow-hidden">

            {/* Panel header */}
            <div className="px-5 py-4 border-b border-ios-separator/30 flex items-start gap-3 shrink-0 bg-white">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-headline font-bold text-ios-primary">{selectedLead.name}</h3>
                  {(() => {
                    const s = stageInfo(selectedLead.stage);
                    return (
                      <span className={`badge ${s.lightBg} ${s.lightText}`} style={{ color: s.color }}>
                        {s.label}
                      </span>
                    );
                  })()}
                </div>
                {selectedLead.company && <p className="text-footnote text-ios-secondary mt-0.5">{selectedLead.company}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => { setSelectedLead(null); setForm({ name: selectedLead.name, company: selectedLead.company || '', email: selectedLead.email || '', phone: selectedLead.phone || '', stage: selectedLead.stage, source: selectedLead.source || 'manual', value: selectedLead.value?.toString() || '', notes: selectedLead.notes || '', expected_close_date: selectedLead.expected_close_date || '', assigned_to: selectedLead.assigned_to || '' }); setShowAddLead('edit'); }}
                  className="p-1.5 rounded-ios hover:bg-ios-fill text-ios-tertiary hover:text-ios-primary transition-colors">
                  <Edit3 className="w-4 h-4" />
                </button>
                <button onClick={() => setSelectedLead(null)} className="w-7 h-7 rounded-full bg-ios-fill flex items-center justify-center hover:bg-ios-fill2 transition-colors">
                  <X className="w-3.5 h-3.5 text-ios-secondary" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">

              {/* Stage selector */}
              <div className="px-5 py-3 border-b border-ios-separator/20 bg-white">
                <p className="text-caption2 font-bold text-ios-tertiary uppercase tracking-wide mb-2">Etapă</p>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_STAGES.map(s => (
                    <button
                      key={s.id}
                      onClick={() => changeStage(selectedLead.id, s.id, selectedLead.stage)}
                      className={`px-2.5 py-1 rounded-full text-caption1 font-semibold transition-all ${selectedLead.stage === s.id ? 'text-white shadow-ios-sm scale-105' : `${s.lightBg} ${s.lightText} hover:opacity-100 opacity-70`}`}
                      style={selectedLead.stage === s.id ? { background: s.color } : {}}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Contact info */}
              <div className="px-5 py-3 border-b border-ios-separator/20 space-y-2">
                {selectedLead.email && (
                  <a href={`mailto:${selectedLead.email}`} className="flex items-center gap-2 text-footnote text-ios-blue hover:underline">
                    <Mail className="w-3.5 h-3.5 shrink-0" /> {selectedLead.email}
                  </a>
                )}
                {selectedLead.phone && (
                  <a href={`tel:${selectedLead.phone}`} className="flex items-center gap-2 text-footnote text-ios-blue hover:underline">
                    <Phone className="w-3.5 h-3.5 shrink-0" /> {selectedLead.phone}
                  </a>
                )}
                <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
                  {selectedLead.value > 0 && (
                    <span className="text-footnote">
                      <span className="text-ios-tertiary">Valoare: </span>
                      <span className="font-bold text-ios-green">{fmtEur(selectedLead.value)}</span>
                    </span>
                  )}
                  {selectedLead.source && (
                    <span className="text-footnote">
                      <span className="text-ios-tertiary">Sursă: </span>
                      <span className="font-semibold">{srcInfo(selectedLead.source).emoji} {srcInfo(selectedLead.source).label}</span>
                    </span>
                  )}
                  {selectedLead.expected_close_date && (
                    <span className="text-footnote">
                      <span className="text-ios-tertiary">Close: </span>
                      <span className="font-semibold">{fmtDate(selectedLead.expected_close_date)}</span>
                    </span>
                  )}
                  {selectedLead.assignee?.full_name && (
                    <span className="text-footnote">
                      <span className="text-ios-tertiary">Responsabil: </span>
                      <span className="font-semibold">{selectedLead.assignee.full_name}</span>
                    </span>
                  )}
                </div>
                {selectedLead.notes && (
                  <p className="text-footnote text-ios-secondary bg-ios-fill rounded-ios px-3 py-2 mt-1 whitespace-pre-line">{selectedLead.notes}</p>
                )}
              </div>

              {/* Convert to client */}
              {!['client', 'decline'].includes(selectedLead.stage) && (
                <div className="px-5 py-3 border-b border-ios-separator/20">
                  <button
                    onClick={() => convertToClient(selectedLead)}
                    disabled={converting}
                    className="w-full py-2.5 rounded-ios bg-ios-green text-white text-footnote font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    <CheckCircle className="w-4 h-4" />
                    {converting ? 'Se creează...' : 'Convertește în client real'}
                  </button>
                  <p className="text-caption2 text-ios-tertiary text-center mt-1">Creează profil în Clients cu un singur click</p>
                </div>
              )}

              {selectedLead.converted_client_id && (
                <div className="px-5 py-2 border-b border-ios-separator/20">
                  <a href="/dashboard/clients" className="text-footnote text-ios-blue flex items-center gap-1.5 hover:underline">
                    <ExternalLink className="w-3.5 h-3.5" /> Deschide profilul în Clients
                  </a>
                </div>
              )}

              {/* Add activity */}
              <div className="px-5 py-3 border-b border-ios-separator/20">
                <p className="text-caption2 font-bold text-ios-tertiary uppercase tracking-wide mb-2">Jurnal activitate</p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {ACTIVITY_TYPES.filter(t => t.id !== 'status_change').map(t => (
                    <button
                      key={t.id}
                      onClick={() => setActivityForm(p => ({ ...p, type: t.id }))}
                      className={`px-2 py-1 rounded-full text-caption2 font-semibold transition-all ${activityForm.type === t.id ? 'bg-ios-blue text-white shadow-ios-sm' : 'bg-ios-fill text-ios-secondary hover:bg-ios-fill2'}`}
                    >
                      {t.emoji} {t.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <textarea
                    className="input flex-1 text-footnote !py-2"
                    rows={2}
                    placeholder="Ce s-a întâmplat? Adaugă un detaliu..."
                    value={activityForm.content}
                    onChange={e => setActivityForm(p => ({ ...p, content: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addActivity(); } }}
                  />
                  <button
                    onClick={addActivity}
                    disabled={savingActivity || !activityForm.content.trim()}
                    className="btn-primary !px-3 !py-2 self-end text-caption1 shrink-0"
                  >
                    {savingActivity ? '...' : 'Log'}
                  </button>
                </div>
              </div>

              {/* Activity timeline */}
              <div className="px-5 py-3 space-y-4">
                {leadActivities.length === 0 && (
                  <p className="text-caption1 text-ios-tertiary text-center py-4">Nicio activitate înregistrată</p>
                )}
                {leadActivities.map(activity => {
                  const aType = ACTIVITY_TYPES.find(t => t.id === activity.type) || { emoji: '📝', label: 'Notă' };
                  return (
                    <div key={activity.id} className="flex gap-3">
                      <div className="w-7 h-7 rounded-full bg-ios-fill flex items-center justify-center shrink-0 text-sm">{aType.emoji}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-caption1 font-semibold text-ios-primary">{activity.profiles?.full_name || 'Sistem'}</span>
                          <span className="text-caption2 text-ios-tertiary">· {fmtTimeAgo(activity.created_at)}</span>
                          <span className={`badge badge-gray text-[10px]`}>{aType.label}</span>
                        </div>
                        <p className="text-footnote text-ios-secondary mt-0.5 whitespace-pre-line">{activity.content}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Panel footer */}
            <div className="px-5 py-3 border-t border-ios-separator/30 flex items-center justify-between shrink-0 bg-white">
              <div className="text-caption2 text-ios-tertiary flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Ultima activitate: {fmtTimeAgo(selectedLead.last_activity_at)}
                {daysSince(selectedLead.last_activity_at) >= 5 && (
                  <span className="ml-1.5 text-ios-orange font-semibold">⚠️ {daysSince(selectedLead.last_activity_at)} zile</span>
                )}
              </div>
              <button onClick={() => deleteLead(selectedLead)} className="text-caption1 text-ios-red hover:underline flex items-center gap-1 transition-opacity hover:opacity-70">
                <Trash2 className="w-3 h-3" /> Șterge
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
