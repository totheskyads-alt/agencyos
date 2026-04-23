'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Download, Bug, Plus, Trash2, CheckCircle, Lightbulb, Edit2, X, Paperclip } from 'lucide-react';

const CATEGORIES = ['UI/Design', 'Timer', 'Tasks', 'Billing', 'Reports', 'Projects', 'Clients', 'Auth', 'Other'];
const EMPTY_BUG = { title: '', category: 'Other', description: '', steps: '', expected: '', actual: '', priority: 'medium' };
const EMPTY_IDEA = { title: '', description: '', priority: 'medium' };

export default function BugsPage() {
  const [bugs, setBugs] = useState([]);
  const [ideas, setIdeas] = useState([]);
  const [tab, setTab] = useState('bugs');
  const [form, setForm] = useState(EMPTY_BUG);
  const [ideaForm, setIdeaForm] = useState(EMPTY_IDEA);
  const [draftsLoaded, setDraftsLoaded] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingIdeaId, setEditingIdeaId] = useState(null);
  const [submitted, setSubmitted] = useState('');
  const [bugScreenshot, setBugScreenshot] = useState(null);

  const [currentUserId, setCurrentUserId] = useState('');
  const [currentUserName, setCurrentUserName] = useState('');

  useEffect(() => {
    load();
    try {
      const bugDraft = localStorage.getItem('sm_bug_draft');
      const ideaDraft = localStorage.getItem('sm_idea_draft');
      if (bugDraft) setForm(JSON.parse(bugDraft));
      if (ideaDraft) setIdeaForm(JSON.parse(ideaDraft));
    } catch {}
    setDraftsLoaded(true);
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const user = session?.user;
      if (user) {
        setCurrentUserId(user.id);
        const { data: p } = await supabase.from('profiles').select('full_name,nickname').eq('id', user.id).single();
        setCurrentUserName(p?.nickname || p?.full_name || user.email);
      }
    });
  }, []);
  useEffect(() => {
    if (!draftsLoaded) return;
    try { localStorage.setItem('sm_bug_draft', JSON.stringify(form)); } catch {}
  }, [form, draftsLoaded]);
  useEffect(() => {
    if (!draftsLoaded) return;
    try { localStorage.setItem('sm_idea_draft', JSON.stringify(ideaForm)); } catch {}
  }, [ideaForm, draftsLoaded]);

  async function load() {
    const [{ data: b }, { data: i }] = await Promise.all([
      supabase.from('bugs').select('*, reporter:reported_by(full_name,nickname,email)').order('created_at', { ascending: false }),
      supabase.from('ideas').select('*, reporter:reported_by(full_name,nickname,email)').order('created_at', { ascending: false }),
    ]);
    setBugs(b || []);
    setIdeas(i || []);
  }

  async function submitBug() {
    if (!form.title.trim()) return;
    let screenshotData = {};
    if (bugScreenshot && !editingId) {
      try {
        const path = `bugs/${Date.now()}_${bugScreenshot.name}`;
        const { error } = await supabase.storage.from('task-files').upload(path, bugScreenshot);
        if (!error) {
          const { data: { publicUrl } } = supabase.storage.from('task-files').getPublicUrl(path);
          screenshotData = { screenshot_name: bugScreenshot.name, screenshot_url: publicUrl, screenshot_type: bugScreenshot.type };
        }
      } catch {}
    }
    const payload = { title: form.title, description: form.description, steps_to_reproduce: form.steps, expected_behavior: form.expected, actual_behavior: form.actual, environment: form.category, priority: form.priority, ...screenshotData };
    if (editingId) {
      await supabase.from('bugs').update(payload).eq('id', editingId);
      setEditingId(null);
    } else {
      await supabase.from('bugs').insert({ ...payload, status: 'open', reported_by: currentUserId });
    }
    const empty = EMPTY_BUG;
    setForm(empty);
    setBugScreenshot(null);
    try { localStorage.setItem('sm_bug_draft', JSON.stringify(empty)); } catch {}
    setSubmitted('bug'); setTimeout(() => setSubmitted(''), 3000);
    load();
  }

  async function submitIdea() {
    if (!ideaForm.title.trim()) return;
    if (editingIdeaId) {
      await supabase.from('ideas').update({ title: ideaForm.title, description: ideaForm.description, priority: ideaForm.priority }).eq('id', editingIdeaId);
      setEditingIdeaId(null);
    } else {
      await supabase.from('ideas').insert({ title: ideaForm.title, description: ideaForm.description, priority: ideaForm.priority, status: 'open', reported_by: currentUserId });
    }
    setIdeaForm(EMPTY_IDEA);
    try { localStorage.setItem('sm_idea_draft', JSON.stringify(EMPTY_IDEA)); } catch {}
    setSubmitted('idea'); setTimeout(() => setSubmitted(''), 3000);
    load();
  }

  async function resolveBug(id) { await supabase.from('bugs').update({ status: 'resolved' }).eq('id', id); load(); }
  async function deleteBug(id) { await supabase.from('bugs').delete().eq('id', id); load(); }
  async function deleteIdea(id) { await supabase.from('ideas').delete().eq('id', id); load(); }
  async function resolveIdea(id) { await supabase.from('ideas').update({ status: 'done' }).eq('id', id); load(); }

  function downloadMarkdown(filename, markdown) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown' }));
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function downloadBugs() {
    const openBugs = bugs.filter(b => b.status !== 'resolved');
    if (openBugs.length === 0) { alert('No open bugs to export.'); return; }
    const md = `# Sky Metrics — Bug Report\nGenerated: ${new Date().toLocaleString()}\n\n---\n\n${openBugs.map((b, i) => `## Bug #${b.bug_number || i+1}: ${b.title}\n\n**Category:** ${b.environment || 'General'}\n**Priority:** ${b.priority}\n\n**Description:**\n${b.description || '—'}\n\n**Screenshot:** ${b.screenshot_url || '—'}\n\n**Steps to Reproduce:**\n${b.steps_to_reproduce || '—'}\n\n**Expected:** ${b.expected_behavior || '—'}\n\n**Actual:** ${b.actual_behavior || '—'}\n\n---`).join('\n\n')}\n`;
    downloadMarkdown(`skymetrics-bugs-${new Date().toISOString().slice(0,10)}.md`, md);
  }

  function downloadIdeas() {
    const exportIdeas = ideas.filter(i => i.status !== 'done');
    if (exportIdeas.length === 0) { alert('No open ideas to export.'); return; }
    const md = `# Sky Metrics — Ideas\nGenerated: ${new Date().toLocaleString()}\n\n---\n\n${exportIdeas.map((idea, i) => `## Idea #${i+1}: ${idea.title}\n\n**Priority:** ${idea.priority || 'medium'}\n**Status:** ${idea.status || 'open'}\n\n**Description:**\n${idea.description || '—'}\n\n---`).join('\n\n')}\n`;
    downloadMarkdown(`skymetrics-ideas-${new Date().toISOString().slice(0,10)}.md`, md);
  }

  const openBugs = bugs.filter(b => b.status !== 'resolved');
  const resolvedBugs = bugs.filter(b => b.status === 'resolved');
  const openIdeas = ideas.filter(i => i.status !== 'done');
  const doneIdeas = ideas.filter(i => i.status === 'done');
  const priorityColor = { low: 'text-ios-tertiary', medium: 'text-ios-orange', high: 'text-ios-red', critical: 'text-red-800' };

  return (
    <div className="space-y-5">
      {/* Tab switcher */}
      <div className="flex items-center justify-between">
        <div className="flex gap-0.5 bg-ios-fill p-1 rounded-ios">
          <button onClick={() => setTab('bugs')}
            className={`flex items-center gap-2 px-4 py-2 rounded-ios-sm text-footnote font-semibold transition-all ${tab==='bugs' ? 'bg-white shadow-ios-sm text-ios-primary' : 'text-ios-secondary'}`}>
            <Bug className="w-3.5 h-3.5" /> Bugs {openBugs.length > 0 && <span className="bg-ios-red text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{openBugs.length}</span>}
          </button>
          <button onClick={() => setTab('ideas')}
            className={`flex items-center gap-2 px-4 py-2 rounded-ios-sm text-footnote font-semibold transition-all ${tab==='ideas' ? 'bg-white shadow-ios-sm text-ios-primary' : 'text-ios-secondary'}`}>
            <Lightbulb className="w-3.5 h-3.5" /> Ideas {openIdeas.length > 0 && <span className="bg-ios-purple text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{openIdeas.length}</span>}
          </button>
        </div>
        {tab === 'bugs' && openBugs.length > 0 && (
          <button onClick={downloadBugs} className="btn-secondary flex items-center gap-2 text-footnote">
            <Download className="w-3.5 h-3.5" /> Download Bugs
          </button>
        )}
        {tab === 'ideas' && openIdeas.length > 0 && (
          <button onClick={downloadIdeas} className="btn-secondary flex items-center gap-2 text-footnote">
            <Download className="w-3.5 h-3.5" /> Download Ideas
          </button>
        )}
      </div>

      {/* BUGS TAB */}
      {tab === 'bugs' && (
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Form */}
          <div className="space-y-4">
            <div className="card p-5 space-y-4">
              <p className="text-headline font-semibold">{editingId ? `Edit Bug #${bugs.find(b=>b.id===editingId)?.bug_number}` : 'Report a Bug'}</p>
              {submitted === 'bug' && <div className="flex items-center gap-2 p-3 bg-green-50 rounded-ios text-ios-green text-footnote font-semibold"><CheckCircle className="w-4 h-4" /> Saved!</div>}
              <div><label className="input-label">Title *</label><input className="input" value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} placeholder="Short description" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="input-label">Section</label><select className="input" value={form.category} onChange={e=>setForm(p=>({...p,category:e.target.value}))}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></div>
                <div><label className="input-label">Priority</label><select className="input" value={form.priority} onChange={e=>setForm(p=>({...p,priority:e.target.value}))}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></div>
              </div>
              <div><label className="input-label">What's the problem?</label><textarea className="input" rows={3} value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} placeholder="Describe what's not working..."/></div>
              <div>
                <label className="input-label">Screenshot</label>
                <label className="flex items-center justify-between gap-3 px-3.5 py-3 rounded-ios bg-ios-fill cursor-pointer hover:bg-ios-fill2 transition-colors">
                  <span className="flex items-center gap-2 text-subhead text-ios-secondary min-w-0">
                    <Paperclip className="w-4 h-4 shrink-0" />
                    <span className="truncate">{bugScreenshot ? bugScreenshot.name : 'Add image for context'}</span>
                  </span>
                  <span className="text-caption1 font-semibold text-ios-blue">Choose</span>
                  <input type="file" accept="image/*" className="hidden" onChange={e => setBugScreenshot(e.target.files?.[0] || null)} />
                </label>
              </div>
              <div><label className="input-label">Steps to reproduce</label><textarea className="input" rows={3} value={form.steps} onChange={e=>setForm(p=>({...p,steps:e.target.value}))} placeholder={"1. Go to...\n2. Click...\n3. See error"}/></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="input-label">Expected</label><textarea className="input" rows={2} value={form.expected} onChange={e=>setForm(p=>({...p,expected:e.target.value}))} placeholder="What should happen?"/></div>
                <div><label className="input-label">Actual</label><textarea className="input" rows={2} value={form.actual} onChange={e=>setForm(p=>({...p,actual:e.target.value}))} placeholder="What happens instead?"/></div>
              </div>
              <div className="flex gap-2">
                {editingId && <button onClick={() => { setEditingId(null); setForm(EMPTY_BUG); setBugScreenshot(null); }} className="btn-secondary"><X className="w-4 h-4"/></button>}
                <button onClick={submitBug} disabled={!form.title.trim()} className="btn-primary flex-1">
                  {editingId ? 'Update Bug' : 'Save Bug Report'}
                </button>
              </div>
            </div>
          </div>

          {/* Bug list */}
          <div className="space-y-3">
            <p className="text-headline font-semibold">{openBugs.length} open bugs</p>
            {openBugs.length === 0 && <div className="card p-10 text-center"><Bug className="w-8 h-8 text-ios-label4 mx-auto mb-2"/><p className="text-subhead text-ios-secondary">No open bugs</p></div>}
            {openBugs.map(b => (
              <div key={b.id} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-caption2 font-bold text-ios-tertiary bg-ios-fill px-1.5 py-0.5 rounded">#{b.bug_number || '?'}</span>
                      <span className={`text-caption2 font-semibold uppercase ${priorityColor[b.priority]}`}>{b.priority}</span>
                      <span className="text-caption2 text-ios-blue font-semibold">{b.environment}</span>
                    </div>
                    <p className="text-subhead font-semibold">{b.title}</p>
                    {b.reporter && <p className="text-caption1 text-ios-tertiary">by {b.reporter.nickname || b.reporter.full_name || b.reporter.email}</p>}
                    {b.description && <p className="text-footnote text-ios-secondary mt-0.5 line-clamp-2">{b.description}</p>}
                    {b.screenshot_url && <a href={b.screenshot_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-caption1 text-ios-blue font-semibold mt-2 hover:underline"><Paperclip className="w-3 h-3"/>Screenshot</a>}
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => { setForm({ title:b.title, category:b.environment||'Other', description:b.description||'', steps:b.steps_to_reproduce||'', expected:b.expected_behavior||'', actual:b.actual_behavior||'', priority:b.priority||'medium' }); setEditingId(b.id); window.scrollTo({top:0,behavior:'smooth'}); }} className="p-1.5 rounded hover:bg-blue-50 text-ios-tertiary hover:text-ios-blue"><Edit2 className="w-3.5 h-3.5"/></button>
                    <button onClick={() => resolveBug(b.id)} className="p-1.5 rounded hover:bg-green-50 text-ios-tertiary hover:text-ios-green"><CheckCircle className="w-3.5 h-3.5"/></button>
                    <button onClick={() => deleteBug(b.id)} className="p-1.5 rounded hover:bg-red-50 text-ios-tertiary hover:text-ios-red"><Trash2 className="w-3.5 h-3.5"/></button>
                  </div>
                </div>
              </div>
            ))}
            {resolvedBugs.length > 0 && (
              <details className="mt-2">
                <summary className="text-caption1 text-ios-tertiary cursor-pointer px-1 py-2 font-semibold uppercase tracking-wide">{resolvedBugs.length} resolved</summary>
                <div className="space-y-2 mt-2">
                  {resolvedBugs.map(b => (
                    <div key={b.id} className="card p-3 opacity-50 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-caption2 font-bold text-ios-tertiary bg-ios-fill px-1.5 py-0.5 rounded">#{b.bug_number || '?'}</span>
                        <p className="text-footnote line-through text-ios-secondary">{b.title}</p>
                      </div>
                      <button onClick={() => deleteBug(b.id)} className="p-1 rounded hover:bg-red-50 text-ios-tertiary hover:text-ios-red shrink-0"><Trash2 className="w-3 h-3"/></button>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        </div>
      )}

      {/* IDEAS TAB */}
      {tab === 'ideas' && (
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Form */}
          <div className="card p-5 space-y-4">
            <p className="text-headline font-semibold">{editingIdeaId ? 'Edit Idea' : '💡 New Idea'}</p>
            {submitted === 'idea' && <div className="flex items-center gap-2 p-3 bg-purple-50 rounded-ios text-ios-purple text-footnote font-semibold"><CheckCircle className="w-4 h-4"/> Saved!</div>}
            <div><label className="input-label">Title *</label><input className="input" value={ideaForm.title} onChange={e=>setIdeaForm(p=>({...p,title:e.target.value}))} placeholder="What's the idea?" /></div>
            <div><label className="input-label">Details</label><textarea className="input" rows={4} value={ideaForm.description} onChange={e=>setIdeaForm(p=>({...p,description:e.target.value}))} placeholder="Describe the idea in more detail..."/></div>
            <div><label className="input-label">Priority</label>
              <div className="flex gap-2">
                {['low','medium','high'].map(p => (
                  <button key={p} onClick={() => setIdeaForm(f=>({...f,priority:p}))}
                    className={`flex-1 py-2 rounded-ios text-caption1 font-semibold capitalize transition-all ${ideaForm.priority===p ? 'bg-ios-purple text-white' : 'bg-ios-fill text-ios-secondary'}`}>{p}</button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              {editingIdeaId && <button onClick={() => { setEditingIdeaId(null); setIdeaForm(EMPTY_IDEA); }} className="btn-secondary"><X className="w-4 h-4"/></button>}
              <button onClick={submitIdea} disabled={!ideaForm.title.trim()} className="btn-primary flex-1" style={{background: editingIdeaId ? undefined : '#AF52DE'}}>
                {editingIdeaId ? 'Update' : 'Save Idea'}
              </button>
            </div>
          </div>

          {/* Ideas list */}
          <div className="space-y-3">
            <p className="text-headline font-semibold">{openIdeas.length} ideas</p>
            {openIdeas.length === 0 && <div className="card p-10 text-center"><Lightbulb className="w-8 h-8 text-ios-label4 mx-auto mb-2"/><p className="text-subhead text-ios-secondary">No ideas yet</p></div>}
            {openIdeas.map((idea, idx) => (
              <div key={idea.id} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-caption2 font-bold text-ios-tertiary bg-ios-fill px-1.5 py-0.5 rounded">#{idx+1}</span>
                      <span className={`text-caption2 font-semibold capitalize ${priorityColor[idea.priority]}`}>{idea.priority}</span>
                    </div>
                    <p className="text-subhead font-semibold">{idea.title}</p>
                    {idea.description && <p className="text-footnote text-ios-secondary mt-0.5">{idea.description}</p>}
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => { setIdeaForm({ title:idea.title, description:idea.description||'', priority:idea.priority||'medium' }); setEditingIdeaId(idea.id); window.scrollTo({top:0,behavior:'smooth'}); }} className="p-1.5 rounded hover:bg-blue-50 text-ios-tertiary hover:text-ios-blue"><Edit2 className="w-3.5 h-3.5"/></button>
                    <button onClick={() => resolveIdea(idea.id)} className="p-1.5 rounded hover:bg-green-50 text-ios-tertiary hover:text-ios-green" title="Mark done"><CheckCircle className="w-3.5 h-3.5"/></button>
                    <button onClick={() => deleteIdea(idea.id)} className="p-1.5 rounded hover:bg-red-50 text-ios-tertiary hover:text-ios-red"><Trash2 className="w-3.5 h-3.5"/></button>
                  </div>
                </div>
              </div>
            ))}
            {doneIdeas.length > 0 && (
              <details className="mt-2">
                <summary className="text-caption1 text-ios-tertiary cursor-pointer px-1 py-2 font-semibold uppercase tracking-wide">{doneIdeas.length} done</summary>
                <div className="space-y-2 mt-2">
                  {doneIdeas.map((idea, idx) => (
                    <div key={idea.id} className="card p-3 opacity-50 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-caption2 font-bold text-ios-tertiary bg-ios-fill px-1.5 py-0.5 rounded">#{idx+1}</span>
                        <p className="text-footnote line-through text-ios-secondary">{idea.title}</p>
                      </div>
                      <button onClick={() => deleteIdea(idea.id)} className="p-1 rounded hover:bg-red-50 text-ios-tertiary hover:text-ios-red shrink-0"><Trash2 className="w-3 h-3"/></button>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
