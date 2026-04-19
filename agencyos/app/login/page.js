'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [mode, setMode] = useState('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const router = useRouter();

  async function handle(e) {
    e.preventDefault();
    setError(''); setSuccess('');

    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match.'); return;
    }
    if (mode === 'signup' && password.length < 6) {
      setError('Password must be at least 6 characters.'); return;
    }

    setLoading(true);
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { setError(error.message); setLoading(false); return; }
      router.push('/dashboard');
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) { setError(error.message); setLoading(false); return; }
      if (data.user) {
        await supabase.from('profiles').upsert({
          id: data.user.id, email, role: 'operator',
          full_name: email.split('@')[0],
        });
      }
      setSuccess('Account created! You can now sign in.');
      setMode('login'); setPassword(''); setConfirmPassword(''); setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-ios-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src="/logo.jpg" alt="Sky Metrics" className="w-20 h-20 rounded-full object-cover mx-auto mb-4 shadow-ios-lg ring-4 ring-white" />
          <h1 className="text-title1 font-bold text-ios-primary">Sky Metrics</h1>
          <p className="text-subhead text-ios-secondary mt-1">Project & time management</p>
        </div>

        <div className="card p-6">
          {/* Tab switcher */}
          <div className="flex gap-0.5 bg-ios-fill p-1 rounded-ios mb-6">
            {[['login','Sign In'],['signup','Create Account']].map(([k,v]) => (
              <button key={k} onClick={() => { setMode(k); setError(''); setSuccess(''); setPassword(''); setConfirmPassword(''); }}
                className={`flex-1 py-2 rounded-ios-sm text-footnote font-semibold transition-all ${mode===k ? 'bg-white text-ios-primary shadow-ios-sm' : 'text-ios-secondary'}`}>{v}</button>
            ))}
          </div>

          {error && <div className="bg-red-50 border border-red-100 rounded-ios p-3 mb-4 text-footnote text-ios-red">{error}</div>}
          {success && <div className="bg-green-50 border border-green-100 rounded-ios p-3 mb-4 text-footnote text-ios-green">{success}</div>}

          <form onSubmit={handle} className="space-y-4" autoComplete="on">
            <div>
              <label className="input-label">Email</label>
              <input className="input" type="email" name="email" autoComplete="email"
                placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>

            <div>
              <label className="input-label">Password</label>
              <div className="relative">
                <input className="input pr-10" type={showPw ? 'text' : 'password'}
                  name="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ios-tertiary hover:text-ios-secondary">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirm password — signup only */}
            {mode === 'signup' && (
              <div>
                <label className="input-label">Confirm Password</label>
                <div className="relative">
                  <input className="input pr-10" type={showConfirm ? 'text' : 'password'}
                    name="confirm-password" autoComplete="new-password"
                    placeholder="••••••••" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
                  <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ios-tertiary hover:text-ios-secondary">
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-caption1 text-ios-red mt-1">Passwords do not match</p>
                )}
                {confirmPassword && password === confirmPassword && (
                  <p className="text-caption1 text-ios-green mt-1">✓ Passwords match</p>
                )}
              </div>
            )}

            <button type="submit"
              disabled={loading || !email || !password || (mode === 'signup' && password !== confirmPassword)}
              className="btn-primary w-full py-3.5 text-subhead disabled:opacity-50">
              {loading ? 'Loading...' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
