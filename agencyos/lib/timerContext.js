'use client';
import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { getElapsed } from '@/lib/utils';

const TimerContext = createContext(null);

export function TimerProvider({ children }) {
  const [activeTimer, setActiveTimer] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [userId, setUserId] = useState(null);
  const [stoppedEntry, setStoppedEntry] = useState(null);
  const [isPaused, setIsPaused] = useState(false);
  const [pausedAt, setPausedAt] = useState(null);
  const [pauseSeconds, setPauseSeconds] = useState(0);
  const intervalRef = useRef(null);
  const pollRef = useRef(null);
  const activeTimerRef = useRef(null);

  // Keep ref in sync so callbacks always have latest
  useEffect(() => { activeTimerRef.current = activeTimer; }, [activeTimer]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) { setUserId(user.id); loadTimer(user.id); }
    });
    return () => { clearInterval(intervalRef.current); clearInterval(pollRef.current); };
  }, []);

  // Poll every 8s
  useEffect(() => {
    if (!userId) return;
    pollRef.current = setInterval(() => loadTimer(userId), 8000);
    return () => clearInterval(pollRef.current);
  }, [userId]);

  // Tick every second
  useEffect(() => {
    clearInterval(intervalRef.current);
    if (!activeTimer?.start_time) { setElapsed(0); return; }
    const tick = () => setElapsed(getElapsed(activeTimer.start_time));
    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => clearInterval(intervalRef.current);
  }, [activeTimer?.id]); // only restart tick when timer ID changes, not on every re-render

  async function loadTimer(uid) {
    const { data } = await supabase.from('time_entries')
      .select('*, projects(name,color), tasks(title)')
      .eq('user_id', uid || userId).is('end_time', null).maybeSingle();

    setActiveTimer(prev => {
      // Timer stopped externally — show overview
      if (prev?.id && !data && !stoppedEntry) {
        supabase.from('time_entries')
          .select('*, projects(name,color), tasks(title)')
          .eq('id', prev.id).single()
          .then(({ data: stopped }) => { if (stopped?.end_time) setStoppedEntry(stopped); });
      }
      return data || null;
    });

    // Restore pause state from DB
    if (data?.paused_at && !data.end_time) {
      setIsPaused(true);
      setPausedAt(new Date(data.paused_at+'Z').getTime());
      setPauseSeconds(data.pause_seconds || 0);
    } else if (!data) {
      setIsPaused(false); setPausedAt(null); setPauseSeconds(0);
    }
  }

  const startTimer = useCallback(async ({ projectId, taskId, description }) => {
    if (!userId) return null;
    // Stop existing if any
    const cur = activeTimerRef.current;
    if (cur) {
      const dur = getElapsed(cur.start_time);
      await supabase.from('time_entries')
        .update({ end_time: new Date().toISOString(), duration_seconds: dur })
        .eq('id', cur.id);
    }
    const { data, error } = await supabase.from('time_entries').insert({
      user_id: userId, project_id: projectId,
      task_id: taskId || null, description: description || null,
      start_time: new Date().toISOString(),
    }).select('*, projects(name,color), tasks(title)').single();
    if (error) { console.error('startTimer error:', error); return null; }
    setActiveTimer(data);
    setStoppedEntry(null);
    setIsPaused(false); setPausedAt(null); setPauseSeconds(0);
    return data;
  }, [userId]);

  const stopTimer = useCallback(async () => {
    const cur = activeTimerRef.current;
    if (!cur) return;
    const dur = Math.max(1, getElapsed(cur.start_time));
    const { data: stopped } = await supabase.from('time_entries')
      .update({ end_time: new Date().toISOString(), duration_seconds: dur })
      .eq('id', cur.id)
      .select('*, projects(name,color), tasks(title)').single();
    setStoppedEntry(stopped || cur);
    setActiveTimer(null); setElapsed(0);
    setIsPaused(false); setPausedAt(null); setPauseSeconds(0);
  }, []);

  const pauseTimer = useCallback(async () => {
    const cur = activeTimerRef.current;
    if (!cur) return;
    if (isPaused) {
      const pauseDur = Math.round((Date.now() - pausedAt) / 1000);
      const newTotal = pauseSeconds + pauseDur;
      setPauseSeconds(newTotal); setPausedAt(null); setIsPaused(false);
      await supabase.from('time_entries').update({ pause_seconds: newTotal, paused_at: null }).eq('id', cur.id);
    } else {
      const now = Date.now();
      setPausedAt(now); setIsPaused(true);
      await supabase.from('time_entries').update({ paused_at: new Date(now).toISOString() }).eq('id', cur.id);
    }
  }, [isPaused, pausedAt, pauseSeconds]);

  const dismissOverview = useCallback(() => setStoppedEntry(null), []);

  const effectiveElapsed = isPaused
    ? Math.max(0, elapsed - (pausedAt ? Math.round((Date.now()-pausedAt)/1000) : 0) - pauseSeconds)
    : Math.max(0, elapsed - pauseSeconds);

  return (
    <TimerContext.Provider value={{
      activeTimer, elapsed: effectiveElapsed, userId, stoppedEntry, isPaused,
      startTimer, stopTimer, pauseTimer, dismissOverview, loadTimer
    }}>
      {children}
    </TimerContext.Provider>
  );
}

export function useTimer() {
  const ctx = useContext(TimerContext);
  if (!ctx) throw new Error('useTimer must be used within TimerProvider');
  return ctx;
}
