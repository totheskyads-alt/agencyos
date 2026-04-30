'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useRole } from '@/lib/useRole';
import { ensureLeadReminderNotifications } from '@/lib/notifications';
import {
  Plus, X, Phone, Mail, Calendar, TrendingUp, CheckCircle,
  AlertCircle, Search, Trash2, ExternalLink, Edit3, ChevronDown,
  Target, Bell, Clock,
} from 'lucide-react';

// ── Constants ──────────────────────────────────────────────────────────────

const STAGES = [
  { id: 'lead',       label: 'New Lead',   color: '#8E8E93', lightBg: 'bg-gray-100',   lightText: 'text-gray-500',   desc: 'Fresh contact, not qualified yet' },
  { id: 'interesat',  label: 'Interested', color: '#007AFF', lightBg: 'bg-blue-50',    lightText: 'text-ios-blue',   desc: 'Showed interest and needs follow-up' },
  { id: 'oferta',     label: 'Proposal',   color: '#FF9500', lightBg: 'bg-orange-50',  lightText: 'text-ios-orange', desc: 'Proposal sent or under negotiation' },
  { id: 'onboarding', label: 'Onboarding', color: '#AF52DE', lightBg: 'bg-purple-50',  lightText: 'text-ios-purple', desc: 'Approved and setup in progress' },
  { id: 'client',     label: 'Client',     color: '#34C759', lightBg: 'bg-green-50',   lightText: 'text-ios-green',  desc: 'Converted into an active client' },
];

const SIDE_STAGES = [
  { id: 'followup', label: 'Follow-up', color: '#FF9500', lightBg: 'bg-orange-50', lightText: 'text-ios-orange' },
  { id: 'decline',  label: 'Declined',  color: '#FF3B30', lightBg: 'bg-red-50',    lightText: 'text-ios-red' },
];

const ALL_STAGES = [...STAGES, ...SIDE_STAGES];

const SOURCES = [
  { id: 'instagram', label: 'Instagram',  emoji: '📸' },
  { id: 'facebook',  label: 'Facebook',   emoji: '📘' },
  { id: 'tiktok',    label: 'TikTok',     emoji: '🎵' },
  { id: 'site',      label: 'Website',    emoji: '🌐' },
  { id: 'referral',  label: 'Referral',   emoji: '🤝' },
  { id: 'email',     label: 'Email',      emoji: '📧' },
  { id: 'telefon',   label: 'Phone',      emoji: '📞' },
  { id: 'manual',    label: 'Manual',     emoji: '✍️' },
  { id: 'other',     label: 'Other',      emoji: '💡' },
];

const ACTIVITY_TYPES = [
  { id: 'note',          label: 'Note',          emoji: '📝' },
  { id: 'call',          label: 'Call',          emoji: '📞' },
  { id: 'email',         label: 'Email',         emoji: '✉️' },
  { id: 'offer',         label: 'Proposal',      emoji: '📄' },
  { id: 'meeting',       label: 'Meeting',       emoji: '👥' },
  { id: 'whatsapp',      label: 'WhatsApp',       emoji: '💬' },
  { id: 'status_change', label: 'Stage change',   emoji: '🔄' },
];

const EMPTY_LEAD = {
  name: '', company: '', email: '', phone: '',
  stage: 'lead', source: 'manual', value: '',
  notes: '', expected_close_date: '', assigned_to: '', reminder_at: '', reminder_note: '',
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
  return new Date(val).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtTimeAgo(val) {
  if (!val) return '—';
  const diff = Date.now() - new Date(val).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} min`;
  if (hours < 24) return `${hours}h`;
  if (days === 1) return 'yesterday';
  return `${days} days`;
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
  const { isAdmin, loading: roleLoading } = useRole();

  // Data
  const [leads, setLeads]         = useState([]);
  const [members, setMembers]     = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading]     = useState(true);

  // UI
  const [selectedLead, setSelectedLead]         = useState(null);
  const [leadActivities, setLeadActivities]     = useState([]);
  const [showAddLead, setShowAddLead]           = useState(false); // false | true | 'edit'
  const [editingLeadId, setEditingLeadId]       = useState(null);
  const [form, setForm]                         = useState(EMPTY_LEAD);
  const [activityForm, setActivityForm]         = useState({ type: 'note', content: '' });
  const [saving, setSaving]                     = useState(false);
  const [savingActivity, setSavingActivity]     = useState(false);
  const [savingReminder, setSavingReminder]     = useState(false);
  const [search, setSearch]                     = useState('');
  const [dragOver, setDragOver]                 = useState(null);
  const [dragOverLeadId, setDragOverLeadId]     = useState(null);
  const [dragOverPosition, setDragOverPosition] = useState('after');
  const [converting, setConverting]             = useState(false);
  const [reminderEditorLead, setReminderEditorLead] = useState(null);
  const [reminderValue, setReminderValue]       = useState('');
  const [reminderNote, setReminderNote]         = useState('');
  const dragLeadId = useRef(null);

  useEffect(() => { if (!roleLoading) loadData(); }, [roleLoading, isAdmin]);
  useEffect(() => { if (selectedLead) loadActivities(selectedLead.id); }, [selectedLead?.id]);

  // ── Load ──────────────────────────────────────────────────────────────

  async function loadData() {
    if (!isAdmin) {
      setLeads([]);
      setMembers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUser(user);
    if (user?.id) {
      ensureLeadReminderNotifications(user.id).catch(error => {
        console.warn('Lead reminders could not be refreshed', error);
      });
    }

    const [{ data: leadsData }, { data: membersData }] = await Promise.all([
      supabase.from('leads')
        .select('*, assignee:profiles!leads_assigned_to_fkey(id,full_name,avatar_url)')
        .order('position', { ascending: true, nullsFirst: false })
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
      reminder_at:          form.reminder_at ? new Date(form.reminder_at).toISOString() : null,
      reminder_note:        form.reminder_note?.trim() || null,
    };

    if (showAddLead === 'edit' && editingLeadId) {
      const currentLead = leads.find(lead => lead.id === editingLeadId) || selectedLead || {};
      await supabase.from('leads').update(payload).eq('id', editingLeadId);
      const updated = { ...currentLead, ...payload };
      setLeads(prev => prev.map(l => l.id === editingLeadId ? updated : l));
      if (selectedLead?.id === editingLeadId) setSelectedLead(updated);
    } else {
      const nextStagePosition =
        Math.max(
          -1,
          ...leads
            .filter(lead => lead.stage === form.stage)
            .map(lead => Number(lead.position) || 0)
        ) + 1;
      const { data } = await supabase.from('leads')
        .insert({ ...payload, created_by: currentUser?.id, position: nextStagePosition })
        .select('*, assignee:profiles!leads_assigned_to_fkey(id,full_name,avatar_url)')
        .single();
      if (data) {
        setLeads(prev => [...prev, data]);
        await supabase.from('lead_activities').insert({
          lead_id: data.id,
          user_id: currentUser?.id,
          type: 'note',
          content: `Lead added from source: ${srcInfo(form.source).label}`,
        });
      }
    }

    setSaving(false);
    setEditingLeadId(null);
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

    const nextStagePosition =
      Math.max(
        -1,
        ...leads
          .filter(lead => lead.id !== leadId && lead.stage === newStage)
          .map(lead => Number(lead.position) || 0)
      ) + 1;

    await supabase.from('leads').update({ stage: newStage, position: nextStagePosition }).eq('id', leadId);
    await supabase.from('lead_activities').insert({
      lead_id: leadId,
      user_id: currentUser?.id,
      type: 'status_change',
      content: `Stage: ${oldLabel} → ${newLabel}`,
    });

    const now = new Date().toISOString();
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, stage: newStage, position: nextStagePosition, last_activity_at: now } : l));
    if (selectedLead?.id === leadId) {
      setSelectedLead(prev => prev ? { ...prev, stage: newStage, position: nextStagePosition, last_activity_at: now } : null);
      loadActivities(leadId);
    }
  }

  async function moveLeadToPosition(leadId, targetStage, beforeLeadId = null, positionHint = 'after') {
    const sourceLead = leads.find(lead => lead.id === leadId);
    if (!sourceLead) return;

    const stageLeads = leads
      .filter(lead => lead.id !== leadId && lead.stage === targetStage)
      .sort((a, b) => (a.position ?? 9999) - (b.position ?? 9999));

    let insertIndex = stageLeads.length;
    if (beforeLeadId === '__top__') {
      insertIndex = 0;
    } else if (beforeLeadId) {
      const targetIndex = stageLeads.findIndex(lead => lead.id === beforeLeadId);
      if (targetIndex >= 0) insertIndex = positionHint === 'before' ? targetIndex : targetIndex + 1;
    }

    const reordered = [...stageLeads];
    reordered.splice(insertIndex, 0, { ...sourceLead, stage: targetStage });

    const updates = reordered.map((lead, index) => ({
      id: lead.id,
      stage: targetStage,
      position: index,
      last_activity_at: lead.id === leadId ? new Date().toISOString() : lead.last_activity_at,
    }));

    setLeads(prev => prev.map(lead => {
      const next = updates.find(update => update.id === lead.id);
      return next ? { ...lead, stage: next.stage, position: next.position, last_activity_at: next.last_activity_at } : lead;
    }));

    await Promise.all(updates.map(update =>
      supabase.from('leads').update({ stage: update.stage, position: update.position }).eq('id', update.id)
    ));

    if (sourceLead.stage !== targetStage) {
      await supabase.from('lead_activities').insert({
        lead_id: leadId,
        user_id: currentUser?.id,
        type: 'status_change',
        content: `Stage: ${stageInfo(sourceLead.stage).label} → ${stageInfo(targetStage).label}`,
      });
    }

    if (selectedLead?.id === leadId) {
      const activeLead = updates.find(update => update.id === leadId);
      setSelectedLead(prev => prev ? { ...prev, stage: targetStage, position: activeLead?.position ?? prev.position } : null);
    }
  }

  async function convertToClient(lead) {
    if (converting) return;
    if (!confirm(`Convert "${lead.name}" into a real client?\nA new profile will be created in Clients.`)) return;
    setConverting(true);

    const { data: client, error } = await supabase.from('clients')
      .insert({ name: lead.name, company: lead.company, email: lead.email, phone: lead.phone, notes: lead.notes, client_type: 'direct' })
      .select().single();

    if (error || !client) { alert('The client could not be created. Please try again.'); setConverting(false); return; }

    await supabase.from('leads').update({ stage: 'client', converted_client_id: client.id }).eq('id', lead.id);
    await supabase.from('lead_activities').insert({
      lead_id: lead.id, user_id: currentUser?.id, type: 'status_change',
      content: 'Converted into a client profile in Clients.',
    });

    const now = new Date().toISOString();
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, stage: 'client', converted_client_id: client.id, last_activity_at: now } : l));
    setSelectedLead(prev => prev ? { ...prev, stage: 'client', converted_client_id: client.id, last_activity_at: now } : null);
    loadActivities(lead.id);
    setConverting(false);

    alert(`"${lead.name}" was added to Clients.`);
  }

  async function deleteLead(lead) {
    if (!confirm(`Delete lead "${lead.name}"? This action cannot be undone.`)) return;
    await supabase.from('leads').delete().eq('id', lead.id);
    setLeads(prev => prev.filter(l => l.id !== lead.id));
    if (selectedLead?.id === lead.id) setSelectedLead(null);
  }

  function openReminderEditor(lead) {
    setReminderEditorLead(lead);
    setReminderValue(lead?.reminder_at ? new Date(lead.reminder_at).toISOString().slice(0, 16) : '');
    setReminderNote(lead?.reminder_note || '');
  }

  async function saveCardReminder() {
    if (!reminderEditorLead?.id) return;
    setSavingReminder(true);
    const isoReminder = reminderValue ? new Date(reminderValue).toISOString() : null;
    const trimmedReminderNote = reminderNote.trim() || null;
    const { error } = await supabase
      .from('leads')
      .update({ reminder_at: isoReminder, reminder_note: trimmedReminderNote })
      .eq('id', reminderEditorLead.id);

    if (!error) {
      if (currentUser?.id) {
        const { error: notificationError } = await supabase
          .from('notifications')
          .delete()
          .eq('user_id', currentUser.id)
          .eq('type', 'lead_reminder')
          .eq('entity_type', 'lead')
          .eq('entity_id', reminderEditorLead.id);

        if (notificationError) {
          console.warn('Old lead reminders could not be cleared', notificationError);
        }

        if (isoReminder && new Date(isoReminder) <= new Date()) {
          await ensureLeadReminderNotifications(currentUser.id);
        }
      }

      setLeads(prev => prev.map(lead => lead.id === reminderEditorLead.id ? { ...lead, reminder_at: isoReminder, reminder_note: trimmedReminderNote } : lead));
      if (selectedLead?.id === reminderEditorLead.id) {
        setSelectedLead(prev => prev ? { ...prev, reminder_at: isoReminder, reminder_note: trimmedReminderNote } : null);
      }
      setReminderEditorLead(null);
      setReminderValue('');
      setReminderNote('');
    }
    setSavingReminder(false);
  }

  // ── Drag & drop ───────────────────────────────────────────────────────

  function handleDragStart(leadId) { dragLeadId.current = leadId; }

  function handleDrop(stageId) {
    if (!dragLeadId.current) return;
    const lead = leads.find(l => l.id === dragLeadId.current);
    if (lead) moveLeadToPosition(dragLeadId.current, stageId);
    setDragOver(null);
    setDragOverLeadId(null);
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

  const conversionRate = useMemo(() => {
    const activeLeadCount = leads.filter(lead => lead.stage !== 'decline').length;
    const convertedLeadCount = leads.filter(lead => lead.stage === 'client').length;
    if (!activeLeadCount) return 0;
    return Math.round((convertedLeadCount / activeLeadCount) * 100);
  }, [leads]);

  const averageConversionDays = useMemo(() => {
    const convertedLeads = leads.filter(lead => lead.stage === 'client' && lead.created_at && (lead.last_activity_at || lead.updated_at));
    if (!convertedLeads.length) return 0;
    const totalDays = convertedLeads.reduce((sum, lead) => {
      const endDate = new Date(lead.last_activity_at || lead.updated_at).getTime();
      const startDate = new Date(lead.created_at).getTime();
      return sum + Math.max(0, Math.round((endDate - startDate) / 86400000));
    }, 0);
    return Math.round(totalDays / convertedLeads.length);
  }, [leads]);

  // ── Render ────────────────────────────────────────────────────────────

  if (roleLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-ios-blue border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="card-section p-12 text-center">
        <TrendingUp className="w-10 h-10 text-ios-label4 mx-auto mb-3" />
        <p className="text-headline font-semibold text-ios-secondary">Sales Pipeline is admin-only</p>
        <p className="text-footnote text-ios-tertiary mt-1">Only admins can manage leads, onboarding, and CRM activity here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-title2 font-bold text-ios-primary">Sales Pipeline</h1>
          <p className="text-subhead text-ios-secondary">
            {leads.length} leads · Open pipeline {fmtEur(totalPipeline)}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {inactiveCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-2 bg-orange-50 border border-orange-100 rounded-ios text-footnote font-semibold text-ios-orange">
              <AlertCircle className="w-3.5 h-3.5" />
              {inactiveCount} with no activity for 5+ days
            </div>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-tertiary" />
            <input className="input pl-9 !py-2 w-44 text-footnote" placeholder="Search lead..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button onClick={() => { setEditingLeadId(null); setForm(EMPTY_LEAD); setShowAddLead(true); }} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" strokeWidth={2.5} /> New lead
          </button>
        </div>
      </div>

      {/* ── Summary cards ───────────────────────────────────────────── */}
      <div className="grid gap-3 md:grid-cols-3">
        <div className="card-section p-5">
          <p className="text-caption1 font-semibold text-ios-secondary mb-2">Pipeline total</p>
          <p className="text-title1 font-bold text-ios-primary">{fmtEur(totalPipeline)}</p>
          <p className="text-subhead text-ios-secondary mt-1">Open opportunities</p>
        </div>
        <div className="card-section p-5">
          <p className="text-caption1 font-semibold text-ios-secondary mb-2">Conversion rate</p>
          <p className="text-title1 font-bold text-ios-primary">{conversionRate}%</p>
          <p className="text-subhead text-ios-secondary mt-1">lead → client</p>
        </div>
        <div className="card-section p-5">
          <p className="text-caption1 font-semibold text-ios-secondary mb-2">Average time</p>
          <p className="text-title1 font-bold text-ios-primary">{averageConversionDays || '—'} {averageConversionDays === 1 ? 'day' : 'days'}</p>
          <p className="text-subhead text-ios-secondary mt-1">lead → client</p>
        </div>
      </div>

      {/* ── Kanban board ────────────────────────────────────────────── */}
      <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollSnapType: 'x mandatory' }}>
        {STAGES.map(stage => {
          const stageLeads = filteredLeads
            .filter(l => l.stage === stage.id)
            .sort((a, b) => (a.position ?? 9999) - (b.position ?? 9999));
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
                  const isDropTarget = dragOverLeadId === lead.id && dragLeadId.current !== lead.id;
                  return (
                    <div
                      key={lead.id}
                      draggable
                      onDragStart={() => handleDragStart(lead.id)}
                      onDragEnd={() => { dragLeadId.current = null; setDragOverLeadId(null); setDragOverPosition('after'); }}
                      onDragOver={event => {
                        event.preventDefault();
                        const rect = event.currentTarget.getBoundingClientRect();
                        const nextPosition = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
                        setDragOver(stage.id);
                        setDragOverLeadId(lead.id);
                        setDragOverPosition(nextPosition);
                      }}
                      onDrop={event => {
                        event.preventDefault();
                        if (!dragLeadId.current) return;
                        moveLeadToPosition(dragLeadId.current, stage.id, lead.id, dragOverPosition);
                        setDragOver(null);
                        setDragOverLeadId(null);
                        setDragOverPosition('after');
                        dragLeadId.current = null;
                      }}
                      onClick={() => setSelectedLead(lead)}
                      className={`relative bg-white rounded-ios px-3 pt-3 pb-2.5 shadow-ios-sm cursor-pointer hover:shadow-ios transition-all active:scale-95 select-none border-l-[3px] ${
                        inactive ? 'border-ios-orange' : 'border-transparent hover:border-ios-blue/40'
                      } ${isDropTarget ? 'ring-2 ring-ios-blue/35' : ''}`}
                    >
                      {isDropTarget && (
                        <div className={`absolute left-3 right-3 h-0.5 rounded-full bg-ios-blue ${dragOverPosition === 'before' ? 'top-1.5' : 'bottom-1.5'}`} />
                      )}
                      <div className="flex items-start justify-between gap-1.5">
                        <p className="text-footnote font-semibold text-ios-primary leading-snug line-clamp-2 flex-1">{lead.name}</p>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={event => {
                              event.stopPropagation();
                              openReminderEditor(lead);
                            }}
                            className={`inline-flex items-center justify-center w-6 h-6 rounded-full transition-colors ${
                              lead.reminder_at ? 'bg-purple-50 text-ios-purple hover:bg-purple-100' : 'bg-ios-fill text-ios-tertiary hover:text-ios-purple hover:bg-purple-50'
                            }`}
                            title={lead.reminder_at ? `Reminder ${fmtDate(lead.reminder_at)}` : 'Set reminder'}
                          >
                            <Bell className="w-3.5 h-3.5" />
                          </button>
                          {lead.value > 0 && (
                            <span className="text-caption2 font-bold text-ios-green shrink-0 mt-0.5">{fmtEur(lead.value)}</span>
                          )}
                        </div>
                      </div>
                      {lead.company && (
                        <p className="text-caption1 text-ios-secondary mt-0.5 line-clamp-1">{lead.company}</p>
                      )}
                      <div className="flex items-center justify-between mt-2 gap-2">
                        <span className="text-caption2 text-ios-tertiary">{src.emoji} {src.label}</span>
                        <div className="flex items-center gap-1.5">
                          {inactive && <AlertCircle className="w-3 h-3 text-ios-orange" title="5+ days without activity" />}
                          {lead.reminder_at && <span className="text-caption2 font-semibold text-ios-purple">{fmtDate(lead.reminder_at)}</span>}
                          {lead.expected_close_date && (
                            <span className="text-caption2 text-ios-tertiary">{fmtDate(lead.expected_close_date)}</span>
                          )}
                        </div>
                      </div>
                      {lead.reminder_note && (
                        <p className="mt-1.5 text-caption2 text-ios-purple line-clamp-2">{lead.reminder_note}</p>
                      )}
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
                    <p className="text-caption2 text-ios-label4">Empty</p>
                  </div>
                )}
              </div>

              {/* Quick add */}
              <button
                onClick={() => { setEditingLeadId(null); setForm({ ...EMPTY_LEAD, stage: stage.id }); setShowAddLead(true); }}
                className="mx-2 my-2 py-1.5 rounded-ios text-caption1 font-semibold text-ios-tertiary hover:text-ios-blue hover:bg-white/80 transition-colors flex items-center justify-center gap-1"
              >
                <Plus className="w-3 h-3" /> Add lead
              </button>
            </div>
          );
        })}
      </div>

      {/* ── Side stages (Follow-up + Decline) ───────────────────────── */}
      {SIDE_STAGES.map(stage => {
        const stageLeads = filteredLeads
          .filter(l => l.stage === stage.id)
          .sort((a, b) => (a.position ?? 9999) - (b.position ?? 9999));
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
          <p className="text-headline font-semibold text-ios-secondary">No leads yet</p>
          <p className="text-footnote text-ios-tertiary mt-1 mb-4">Add the first lead and start tracking real opportunities.</p>
          <button onClick={() => { setEditingLeadId(null); setForm(EMPTY_LEAD); setShowAddLead(true); }} className="btn-primary">
            <Plus className="w-4 h-4 inline mr-1.5" />Add first lead
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && (setEditingLeadId(null), setShowAddLead(false))}>
          <div className="bg-white rounded-ios-xl shadow-ios-modal w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-5 py-4 border-b border-ios-separator/30 flex items-center justify-between">
              <h3 className="text-headline font-bold text-ios-primary">{showAddLead === 'edit' ? 'Edit lead' : 'New lead'}</h3>
              <button onClick={() => { setEditingLeadId(null); setShowAddLead(false); }} className="w-7 h-7 rounded-full bg-ios-fill flex items-center justify-center hover:bg-ios-fill2 transition-colors">
                <X className="w-3.5 h-3.5 text-ios-secondary" />
              </button>
            </div>

            <div className="p-5 space-y-3 overflow-y-auto max-h-[80vh]">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="input-label">Lead name *</label>
                  <input className="input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="John Smith" autoFocus />
                </div>
                <div>
                  <label className="input-label">Company</label>
                  <input className="input" value={form.company} onChange={e => setForm(p => ({ ...p, company: e.target.value }))} placeholder="Company / brand" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="input-label">Email</label>
                  <input className="input" type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="name@company.com" />
                </div>
                <div>
                  <label className="input-label">Phone</label>
                  <input className="input" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="+40 7xx xxx xxx" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="input-label">Stage</label>
                  <select className="input" value={form.stage} onChange={e => setForm(p => ({ ...p, stage: e.target.value }))}>
                    {ALL_STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="input-label">Source</label>
                  <select className="input" value={form.source} onChange={e => setForm(p => ({ ...p, source: e.target.value }))}>
                    {SOURCES.map(s => <option key={s.id} value={s.id}>{s.emoji} {s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="input-label">Pipeline value (€)</label>
                  <input className="input" type="number" min="0" value={form.value} onChange={e => setForm(p => ({ ...p, value: e.target.value }))} placeholder="0" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="input-label">Owner</label>
                  <select className="input" value={form.assigned_to} onChange={e => setForm(p => ({ ...p, assigned_to: e.target.value }))}>
                    <option value="">Unassigned</option>
                    {members.map(m => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
                  </select>
                </div>
                <div>
                  <label className="input-label">Expected close</label>
                  <input className="input" type="date" value={form.expected_close_date} onChange={e => setForm(p => ({ ...p, expected_close_date: e.target.value }))} />
                </div>
                <div>
                  <label className="input-label">Reminder</label>
                  <input className="input" type="datetime-local" value={form.reminder_at} onChange={e => setForm(p => ({ ...p, reminder_at: e.target.value }))} />
                </div>
              </div>

              <div>
                <label className="input-label">Internal notes</label>
                <textarea className="input" rows={3} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Context, needs, objections, next steps..." />
              </div>

              <div className="flex gap-3 pt-1">
                <button className="btn-secondary flex-1" onClick={() => { setEditingLeadId(null); setShowAddLead(false); }}>Cancel</button>
                <button className="btn-primary flex-1" onClick={saveLead} disabled={saving || !form.name.trim()}>
                  {saving ? 'Saving...' : showAddLead === 'edit' ? 'Save changes' : 'Add lead'}
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
                <button onClick={() => { setEditingLeadId(selectedLead.id); setSelectedLead(null); setForm({ name: selectedLead.name, company: selectedLead.company || '', email: selectedLead.email || '', phone: selectedLead.phone || '', stage: selectedLead.stage, source: selectedLead.source || 'manual', value: selectedLead.value?.toString() || '', notes: selectedLead.notes || '', expected_close_date: selectedLead.expected_close_date || '', assigned_to: selectedLead.assigned_to || '', reminder_at: selectedLead.reminder_at ? new Date(selectedLead.reminder_at).toISOString().slice(0, 16) : '', reminder_note: selectedLead.reminder_note || '' }); setShowAddLead('edit'); }}
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
                <p className="text-caption2 font-bold text-ios-tertiary uppercase tracking-wide mb-2">Stage</p>
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
                      <span className="text-ios-tertiary">Value: </span>
                      <span className="font-bold text-ios-green">{fmtEur(selectedLead.value)}</span>
                    </span>
                  )}
                  {selectedLead.source && (
                    <span className="text-footnote">
                      <span className="text-ios-tertiary">Source: </span>
                      <span className="font-semibold">{srcInfo(selectedLead.source).emoji} {srcInfo(selectedLead.source).label}</span>
                    </span>
                  )}
                  {selectedLead.expected_close_date && (
                    <span className="text-footnote">
                      <span className="text-ios-tertiary">Close: </span>
                      <span className="font-semibold">{fmtDate(selectedLead.expected_close_date)}</span>
                    </span>
                  )}
                  {selectedLead.reminder_at && (
                    <span className="text-footnote">
                      <span className="text-ios-tertiary">Reminder: </span>
                      <span className="font-semibold">{fmtDate(selectedLead.reminder_at)}</span>
                    </span>
                  )}
                  {selectedLead.reminder_note && (
                    <span className="text-footnote">
                      <span className="text-ios-tertiary">Reminder note: </span>
                      <span className="font-semibold">{selectedLead.reminder_note}</span>
                    </span>
                  )}
                  {selectedLead.assignee?.full_name && (
                    <span className="text-footnote">
                      <span className="text-ios-tertiary">Owner: </span>
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
                    {converting ? 'Creating...' : 'Convert to client'}
                  </button>
                  <p className="text-caption2 text-ios-tertiary text-center mt-1">Create a real client profile in one click</p>
                </div>
              )}

              {selectedLead.converted_client_id && (
                <div className="px-5 py-2 border-b border-ios-separator/20">
                  <a href="/dashboard/clients" className="text-footnote text-ios-blue flex items-center gap-1.5 hover:underline">
                    <ExternalLink className="w-3.5 h-3.5" /> Open client profile
                  </a>
                </div>
              )}

              {/* Add activity */}
              <div className="px-5 py-3 border-b border-ios-separator/20">
                <p className="text-caption2 font-bold text-ios-tertiary uppercase tracking-wide mb-2">Activity log</p>
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
                    placeholder="What happened? Add a quick detail..."
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
                  <p className="text-caption1 text-ios-tertiary text-center py-4">No activity logged yet</p>
                )}
                {leadActivities.map(activity => {
                  const aType = ACTIVITY_TYPES.find(t => t.id === activity.type) || { emoji: '📝', label: 'Note' };
                  return (
                    <div key={activity.id} className="flex gap-3">
                      <div className="w-7 h-7 rounded-full bg-ios-fill flex items-center justify-center shrink-0 text-sm">{aType.emoji}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-caption1 font-semibold text-ios-primary">{activity.profiles?.full_name || 'System'}</span>
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
                Last activity: {fmtTimeAgo(selectedLead.last_activity_at)}
                {daysSince(selectedLead.last_activity_at) >= 5 && (
                  <span className="ml-1.5 text-ios-orange font-semibold">⚠️ {daysSince(selectedLead.last_activity_at)} days</span>
                )}
              </div>
              <button onClick={() => deleteLead(selectedLead)} className="text-caption1 text-ios-red hover:underline flex items-center gap-1 transition-opacity hover:opacity-70">
                <Trash2 className="w-3 h-3" /> Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {reminderEditorLead && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm" onClick={event => event.target === event.currentTarget && !savingReminder && setReminderEditorLead(null)}>
          <div className="bg-white rounded-ios-xl shadow-ios-modal w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-5 py-4 border-b border-ios-separator/30 flex items-center justify-between">
              <div>
                <h3 className="text-headline font-bold text-ios-primary">Lead reminder</h3>
                <p className="text-footnote text-ios-secondary mt-0.5">{reminderEditorLead.name}</p>
              </div>
              <button onClick={() => !savingReminder && setReminderEditorLead(null)} className="w-7 h-7 rounded-full bg-ios-fill flex items-center justify-center hover:bg-ios-fill2 transition-colors">
                <X className="w-3.5 h-3.5 text-ios-secondary" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="input-label">Reminder time</label>
                <input
                  className="input"
                  type="datetime-local"
                  value={reminderValue}
                  onChange={event => setReminderValue(event.target.value)}
                />
              </div>
              <div>
                <label className="input-label">Short message</label>
                <textarea
                  className="input"
                  rows={2}
                  maxLength={140}
                  placeholder="Call back after proposal / send onboarding checklist..."
                  value={reminderNote}
                  onChange={event => setReminderNote(event.target.value)}
                />
              </div>
              <div className="flex gap-3">
                <button
                  className="btn-secondary flex-1"
                  onClick={() => { setReminderValue(''); setReminderNote(''); }}
                  disabled={savingReminder}
                >
                  Clear
                </button>
                <button
                  className="btn-primary flex-1"
                  onClick={saveCardReminder}
                  disabled={savingReminder}
                >
                  {savingReminder ? 'Saving...' : 'Save reminder'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
