'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Camera, Save, Lock } from 'lucide-react';

export default function ProfilePage() {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({ full_name: '', nickname: '' });
  const [pwForm, setPwForm] = useState({ newPw: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [msg, setMsg] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [uploading, setUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');
  const fileRef = useRef();

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;
    const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    setProfile({ ...p, email: user.email });
    setForm({ full_name: p?.full_name || '', nickname: p?.nickname || '' });
    setAvatarUrl(p?.avatar_url || '');
  }

  async function saveProfile() {
    setSaving(true); setMsg('');
    await supabase.from('profiles').update({ full_name: form.full_name, nickname: form.nickname }).eq('id', profile.id);
    setMsg('Saved!'); setSaving(false);
    setTimeout(() => setMsg(''), 3000);
  }

  async function changePassword() {
    if (pwForm.newPw !== pwForm.confirm) { setPwMsg('Passwords do not match.'); return; }
    if (pwForm.newPw.length < 6) { setPwMsg('Minimum 6 characters.'); return; }
    setSavingPw(true); setPwMsg('');
    const { error } = await supabase.auth.updateUser({ password: pwForm.newPw });
    setPwMsg(error ? error.message : 'Password changed!');
    if (!error) setPwForm({ newPw: '', confirm: '' });
    setSavingPw(false);
    setTimeout(() => setPwMsg(''), 4000);
  }

  async function uploadAvatar(file) {
    if (!file || !profile) return;
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `avatars/${profile.id}.${ext}`;
    await supabase.storage.from('task-files').upload(path, file, { upsert: true });
    const { data } = supabase.storage.from('task-files').getPublicUrl(path);
    await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', profile.id);
    setAvatarUrl(data.publicUrl + '?t=' + Date.now());
    setUploading(false);
  }

  const initials = (form.full_name || profile?.email || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);
  const roleColor = { admin:'bg-purple-100 text-purple-700', manager:'bg-blue-100 text-blue-700', operator:'bg-gray-100 text-gray-500' };

  return (
    <div className="max-w-lg space-y-5">
      <div>
        <h1 className="text-title2 font-bold text-ios-primary">My Profile</h1>
        <p className="text-subhead text-ios-secondary">Manage your account</p>
      </div>

      {/* Avatar + info */}
      <div className="card p-6">
        <div className="flex items-center gap-5 mb-6">
          <div className="relative">
            {avatarUrl
              ? <img src={avatarUrl} alt="Avatar" className="w-20 h-20 rounded-full object-cover ring-2 ring-ios-separator" />
              : <div className="w-20 h-20 bg-ios-blue rounded-full flex items-center justify-center text-white text-title2 font-bold">{initials}</div>
            }
            <button onClick={() => fileRef.current?.click()}
              className="absolute bottom-0 right-0 w-7 h-7 bg-ios-blue rounded-full flex items-center justify-center text-white shadow-ios-sm hover:bg-blue-600">
              <Camera className="w-3.5 h-3.5" />
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={e => e.target.files?.[0] && uploadAvatar(e.target.files[0])} />
          </div>
          <div>
            <p className="text-headline font-bold">{form.full_name || profile?.email}</p>
            <p className="text-footnote text-ios-secondary">{profile?.email}</p>
            <span className={`text-caption2 font-semibold px-2 py-0.5 rounded-full mt-1 inline-block ${roleColor[profile?.role] || roleColor.operator}`}>
              {profile?.role?.charAt(0).toUpperCase() + profile?.role?.slice(1)}
            </span>
          </div>
        </div>
        {uploading && <p className="text-caption1 text-ios-blue mb-3">Uploading photo...</p>}

        <div className="space-y-3">
          <div>
            <label className="input-label">Full Name</label>
            <input className="input" value={form.full_name} onChange={e => setForm(p=>({...p,full_name:e.target.value}))} placeholder="Your full name" />
          </div>
          <div>
            <label className="input-label">Nickname</label>
            <input className="input" value={form.nickname} onChange={e => setForm(p=>({...p,nickname:e.target.value}))} placeholder="e.g. Mihai" />
          </div>
          <div>
            <label className="input-label">Email (cannot change)</label>
            <input className="input bg-ios-fill text-ios-tertiary" value={profile?.email||''} disabled />
          </div>
        </div>
        {msg && <p className="text-footnote mt-3 font-semibold text-ios-green">{msg}</p>}
        <button onClick={saveProfile} disabled={saving} className="btn-primary w-full mt-4 flex items-center justify-center gap-2">
          <Save className="w-4 h-4" />{saving ? 'Saving...' : 'Save Profile'}
        </button>
      </div>

      {/* Password */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Lock className="w-4 h-4 text-ios-secondary" />
          <p className="text-headline font-semibold">Change Password</p>
        </div>
        <div className="space-y-3">
          <div>
            <label className="input-label">New Password</label>
            <input className="input" type="password" value={pwForm.newPw} onChange={e => setPwForm(p=>({...p,newPw:e.target.value}))} placeholder="Minimum 6 characters" />
          </div>
          <div>
            <label className="input-label">Confirm Password</label>
            <input className="input" type="password" value={pwForm.confirm} onChange={e => setPwForm(p=>({...p,confirm:e.target.value}))} placeholder="Repeat password" />
            {pwForm.confirm && (
              <p className={`text-caption1 mt-1 ${pwForm.newPw===pwForm.confirm?'text-ios-green':'text-ios-red'}`}>
                {pwForm.newPw===pwForm.confirm ? '✓ Match' : 'Do not match'}
              </p>
            )}
          </div>
        </div>
        {pwMsg && <p className={`text-footnote mt-3 font-semibold ${pwMsg.includes('!')?'text-ios-green':'text-ios-red'}`}>{pwMsg}</p>}
        <button onClick={changePassword} disabled={savingPw||!pwForm.newPw||pwForm.newPw!==pwForm.confirm}
          className="btn-primary w-full mt-4">
          {savingPw ? 'Changing...' : 'Change Password'}
        </button>
      </div>
    </div>
  );
}
