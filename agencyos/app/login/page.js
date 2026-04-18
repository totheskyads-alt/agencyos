'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Clock, Mail, Lock, User, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', full_name: '' });

  const handle = async (e) => {
    e.preventDefault();
    setLoading(true); setError(''); setSuccess('');
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
        if (error) throw error;
        router.push('/dashboard');
      } else {
        const { error } = await supabase.auth.signUp({
          email: form.email, password: form.password,
          options: { data: { full_name: form.full_name } }
        });
        if (error) throw error;
        setSuccess('Cont creat! Te poți autentifica acum.');
        setMode('login');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-ios-bg flex flex-col items-center justify-center p-4">
      {/* Logo */}
      <div className="flex flex-col items-center mb-8">
        <div className="w-16 h-16 bg-ios-blue rounded-ios-xl flex items-center justify-center shadow-ios mb-4">
          <Clock className="w-9 h-9 text-white" strokeWidth={2.5} />
        </div>
        <h1 className="text-title2 font-bold text-ios-primary">Agency OS</h1>
        <p className="text-subhead text-ios-secondary mt-1">Gestionează agenția ta</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-white rounded-ios-xl shadow-ios overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-ios-separator/50">
          {['login', 'register'].map(m => (
            <button key={m} onClick={() => { setMode(m); setError(''); setSuccess(''); }}
              className={`flex-1 py-3.5 text-subhead font-semibold transition-colors ${
                mode === m ? 'text-ios-blue border-b-2 border-ios-blue' : 'text-ios-secondary'
              }`}>
              {m === 'login' ? 'Autentificare' : 'Cont nou'}
            </button>
          ))}
        </div>

        <form onSubmit={handle} className="p-5 space-y-4">
          {(error || success) && (
            <div className={`p-3 rounded-ios text-subhead ${
              success ? 'bg-green-50 text-ios-green' : 'bg-red-50 text-ios-red'
            }`}>
              {success || error}
            </div>
          )}

          {mode === 'register' && (
            <div>
              <label className="input-label">Nume complet</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-tertiary" />
                <input className="input pl-10" placeholder="Ion Popescu" value={form.full_name}
                  onChange={e => setForm({ ...form, full_name: e.target.value })} required />
              </div>
            </div>
          )}

          <div>
            <label className="input-label">Email</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-tertiary" />
              <input className="input pl-10" type="email" placeholder="email@agentie.com" value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })} required />
            </div>
          </div>

          <div>
            <label className="input-label">Parolă</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-tertiary" />
              <input className="input pl-10 pr-10" type={showPass ? 'text' : 'password'} placeholder="••••••••"
                value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required minLength={6} />
              <button type="button" onClick={() => setShowPass(!showPass)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ios-tertiary hover:text-ios-secondary">
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button type="submit" className="btn-primary w-full py-3 mt-2" disabled={loading}>
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Se procesează...
              </span>
            ) : mode === 'login' ? 'Autentificare' : 'Crează cont'}
          </button>
        </form>
      </div>

      <p className="text-caption1 text-ios-tertiary mt-6">Agency OS v2.0 © 2025</p>
    </div>
  );
}
