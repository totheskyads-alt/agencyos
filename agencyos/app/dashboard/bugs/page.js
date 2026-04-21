'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Download, Bug, Plus, Trash2, CheckCircle } from 'lucide-react';

const CATEGORIES = ['UI/Design', 'Timer', 'Tasks', 'Billing', 'Reports', 'Projects', 'Clients', 'Auth', 'Other'];

export default function BugsPage() {
  const [bugs, setBugs] = useState([]);
  const [form, setForm] = useState(() => {
    try {
      const saved = localStorage.getItem('sm_bug_draft');
      return saved ? JSON.parse(saved) : { title: '', category: 'Other', description: '', steps: '', expected: '', actual: '', priority: 'medium' };
    } catch { return { title: '', category: 'Other', description: '', steps: '', expected: '', actual: '', priority: 'medium' }; }
  });
  const [submitted, setSubmitted] = useState(false);
  const [editingBugId, setEditingBugId] = useState(null);

  useEffect(() => {
    try { localStorage.setItem('sm_bug_draft', JSON.stringify(form)); } catch {}
  }, [form]);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      setProfile(p);
      load();
    });
  }, []);

  async function load() {
    const { data } = await supabase.from('bugs').select('*').order('created_at', { ascending: false });
    setBugs(data || []);
  }

  async function submit() {
    if (!form.title.trim()) return;
    const payload = {
      title: form.title, description: form.description, steps_to_reproduce: form.steps,
      expected_behavior: form.expected, actual_behavior: form.actual,
      environment: form.category, priority: form.priority,
    };
    if (editingBugId) {
      await supabase.from('bugs').update(payload).eq('id', editingBugId);
      setEditingBugId(null);
    } else {
      await supabase.from('bugs').insert({ ...payload, status: 'open' });
    }
    const empty = { title: '', category: 'Other', description: '', steps: '', expected: '', actual: '', priority: 'medium' };
    setForm(empty);
    try { localStorage.setItem('sm_bug_draft', JSON.stringify(empty)); } catch {}
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
    load();
  }

  async function resolve(id) {
    await supabase.from('bugs').update({ status: 'resolved' }).eq('id', id);
    load();
  }

  async function del(id) {
    await supabase.from('bugs').delete().eq('id', id);
    load();
  }

  function downloadForClaude() {
    const open = bugs.filter(b => b.status !== 'resolved');
    if (open.length === 0) { alert('No open bugs to export.'); return; }

    const md = `# Sky Metrics — Bug Report
Generated: ${new Date().toLocaleString()}
Platform: https://sky-metrics.online
Stack: Next.js 14, Supabase, Vercel

---

${open.map((b, i) => `## Bug ${i + 1}: ${b.title}

**Category:** ${b.environment || 'General'}
**Priority:** ${b.priority}
**Status:** ${b.status}
**Reported:** ${new Date(b.created_at).toLocaleDateString()}

**Description:**
${b.description || '—'}

**Steps to Reproduce:**
${b.steps_to_reproduce || '—'}

**Expected:**
${b.expected_behavior || '—'}

**Actual:**
${b.actual_behavior || '—'}

---`).join('\n\n')}

## Instructions for Claude:
Please analyze the bugs above and provide fixed files.
Repository structure: agencyos/app/dashboard/ + agencyos/components/ + agencyos/lib/
`;

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `skymetrics-bugs-${new Date().toISOString().slice(0,10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const openBugs = bugs.filter(b => b.status !== 'resolved');
  const resolvedBugs = bugs.filter(b => b.status === 'resolved');

  const priorityColor = { low: 'text-ios-secondary', medium: 'text-ios-orange', high: 'text-ios-red', critical: 'text-red-800' };

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      {/* LEFT: Report form */}
      <div className="space-y-4">
        <div>
          <h1 className="text-title2 font-bold text-ios-primary">Report a Bug</h1>
          <p className="text-subhead text-ios-secondary">Describe the issue and download the report to send to Claude</p>
        </div>

        <div className="card p-5 space-y-4">
          {submitted && (
            <div className="flex items-center gap-2 p-3 bg-green-50 rounded-ios text-ios-green text-footnote font-semibold">
              <CheckCircle className="w-4 h-4" /> Bug reported! Download the file to send to Claude.
            </div>
          )}

          <div>
            <label className="input-label">Title *</label>
            <input className="input" value={form.title} onChange={e => setForm(p=>({...p,title:e.target.value}))} placeholder="Short description of the issue" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="input-label">Section</label>
              <select className="input" value={form.category} onChange={e => setForm(p=>({...p,category:e.target.value}))}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="input-label">Priority</label>
              <select className="input" value={form.priority} onChange={e => setForm(p=>({...p,priority:e.target.value}))}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>

          <div>
            <label className="input-label">What's the problem?</label>
            <textarea className="input" rows={3} value={form.description} onChange={e => setForm(p=>({...p,description:e.target.value}))} placeholder="Describe what's not working..." />
          </div>

          <div>
            <label className="input-label">Steps to reproduce</label>
            <textarea className="input" rows={3} value={form.steps} onChange={e => setForm(p=>({...p,steps:e.target.value}))} placeholder={"1. Go to...\n2. Click on...\n3. See error"} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="input-label">Expected</label>
              <textarea className="input" rows={2} value={form.expected} onChange={e => setForm(p=>({...p,expected:e.target.value}))} placeholder="What should happen?" />
            </div>
            <div>
              <label className="input-label">Actual</label>
              <textarea className="input" rows={2} value={form.actual} onChange={e => setForm(p=>({...p,actual:e.target.value}))} placeholder="What actually happens?" />
            </div>
          </div>

          <button onClick={submit} disabled={!form.title.trim()}
            className="btn-primary w-full flex items-center justify-center gap-2">
            <Bug className="w-4 h-4" /> {editingBugId ? 'Update Bug' : 'Save Bug Report'}
          </button>
        </div>

        {/* Download for Claude */}
        {openBugs.length > 0 && (
          <div className="card p-4 bg-blue-50 border border-blue-100">
            <p className="text-subhead font-semibold text-ios-blue mb-1">Send to Claude for fixing</p>
            <p className="text-footnote text-ios-secondary mb-3">
              Download a structured file with all {openBugs.length} open bug{openBugs.length > 1 ? 's' : ''}, then paste it in a new conversation with Claude.
            </p>
            <button onClick={downloadForClaude}
              className="btn-primary w-full flex items-center justify-center gap-2 bg-ios-blue">
              <Download className="w-4 h-4" /> Download Bug Report (.md)
            </button>
          </div>
        )}
      </div>

      {/* RIGHT: Bug list */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-headline font-semibold">{openBugs.length} open bugs</p>
          {resolvedBugs.length > 0 && <p className="text-footnote text-ios-tertiary">{resolvedBugs.length} resolved</p>}
        </div>

        {bugs.length === 0 ? (
          <div className="card p-12 text-center">
            <Bug className="w-8 h-8 text-ios-label4 mx-auto mb-3" />
            <p className="text-subhead text-ios-secondary">No bugs reported yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {openBugs.map(b => (
              <div key={b.id} className="card p-4">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div>
                    <span className="text-subhead font-semibold">{b.title}</span>
                    <span className={`ml-2 text-caption2 font-semibold uppercase ${priorityColor[b.priority]}`}>{b.priority}</span>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => { setForm({ title:b.title, category:b.environment||'Other', description:b.description||'', steps:b.steps_to_reproduce||'', expected:b.expected_behavior||'', actual:b.actual_behavior||'', priority:b.priority||'medium' }); setEditingBugId(b.id); window.scrollTo({top:0,behavior:'smooth'}); }} className="p-1.5 rounded hover:bg-blue-50 text-ios-tertiary hover:text-ios-blue" title="Edit">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    <button onClick={() => resolve(b.id)} className="p-1.5 rounded hover:bg-green-50 text-ios-tertiary hover:text-ios-green" title="Mark resolved">
                      <CheckCircle className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => del(b.id)} className="p-1.5 rounded hover:bg-red-50 text-ios-tertiary hover:text-ios-red" title="Delete">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <p className="text-caption1 text-ios-blue font-semibold mb-1">{b.environment}</p>
                {b.description && <p className="text-footnote text-ios-secondary">{b.description}</p>}
              </div>
            ))}

            {resolvedBugs.length > 0 && (
              <>
                <p className="text-caption1 text-ios-tertiary uppercase tracking-wide font-semibold mt-4 px-1">Resolved</p>
                {resolvedBugs.map(b => (
                  <div key={b.id} className="card p-4 opacity-50">
                    <div className="flex items-center justify-between">
                      <p className="text-subhead line-through text-ios-secondary">{b.title}</p>
                      <button onClick={() => del(b.id)} className="p-1.5 rounded hover:bg-red-50 text-ios-tertiary hover:text-ios-red">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
