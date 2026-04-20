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

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) { setUserId(user.id); loadTimer(user.id); }
    });
    return () => { clearInterval(intervalRef.current); clearInterval(pollRef.current); };
  }, []);

  // Poll every 5s to stay in sync
  useEffect(() => {
    if (!userId) return;
    pollRef.current = setInterval(() => loadTimer(userId), 5000);
    return () => clearInterval(pollRef.current);
  }, [userId]);

  useEffect(() => {
    clearInterval(intervalRef.current);
    if (!activeTimer?.start_time) { setElapsed(0); return; }
    const tick = () => setElapsed(getElapsed(activeTimer.start_time));
    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => clearInterval(intervalRef.current);
  }, [activeTimer]);

  async function loadTimer(uid) {
    const { data } = await supabase.from('time_entries')
      .select('*, projects(name,color), tasks(title)')
      .eq('user_id', uid || userId).is('end_time', null).maybeSingle();
    setActiveTimer(prev => {
      // If timer was active and now stopped externally, show overview
      if (prev?.id && !data) {
        supabase.from('time_entries').select('*, projects(name,color), tasks(title)').eq('id', prev.id).single()
          .then(({ data: stopped }) => { if (stopped) { setStoppedEntry(stopped); } });
      }
      return data || null;
    });
  }

  const startTimer = useCallback(async ({ projectId, taskId, description }) => {
    if (!userId) return;
    // Stop existing
    if (activeTimer) {
      const dur = getElapsed(activeTimer.start_time);
      await supabase.from('time_entries').update({ end_time: new Date().toISOString(), duration_seconds: dur }).eq('id', activeTimer.id);
    }
    const { data } = await supabase.from('time_entries').insert({
      user_id: userId, project_id: projectId,
      task_id: taskId || null, description: description || null,
      start_time: new Date().toISOString(),
    }).select('*, projects(name,color), tasks(title)').single();
    setActiveTimer(data);
    setStoppedEntry(null);
    return data;
  }, [userId, activeTimer]);

  const stopTimer = useCallback(async () => {
    if (!activeTimer) return;
    const dur = getElapsed(activeTimer.start_time);
    await supabase.from('time_entries').update({ end_time: new Date().toISOString(), duration_seconds: dur }).eq('id', activeTimer.id);
    const { data: stopped } = await supabase.from('time_entries').select('*, projects(name,color), tasks(title)').eq('id', activeTimer.id).single();
    setStoppedEntry(stopped);
    setActiveTimer(null); setElapsed(0);
    setIsPaused(false); setPausedAt(null); setPauseSeconds(0);
  }, [activeTimer]);

  const dismissOverview = useCallback(() => setStoppedEntry(null), []);

  const pauseTimer = useCallback(async () => {
    if (!activeTimer) return;
    if (isPaused) {
      const pauseDur = Math.round((Date.now() - pausedAt) / 1000);
      const newTotal = pauseSeconds + pauseDur;
      setPauseSeconds(newTotal); setPausedAt(null); setIsPaused(false);
      await supabase.from('time_entries').update({ pause_seconds: newTotal, paused_at: null }).eq('id', activeTimer.id);
    } else {
      setPausedAt(Date.now()); setIsPaused(true);
      await supabase.from('time_entries').update({ paused_at: new Date().toISOString() }).eq('id', activeTimer.id);
    }
  }, [activeTimer, isPaused, pausedAt, pauseSeconds]);

  const effectiveElapsed = isPaused
    ? Math.max(0, elapsed - (pausedAt ? Math.round((Date.now()-pausedAt)/1000) : 0) - pauseSeconds)
    : Math.max(0, elapsed - pauseSeconds);

  return (
    <TimerContext.Provider value={{ activeTimer, elapsed: effectiveElapsed, rawElapsed: elapsed, userId, stoppedEntry, isPaused, startTimer, stopTimer, pauseTimer, dismissOverview, loadTimer }}>
      {children}
    </TimerContext.Provider>
  );
}

export function useTimer() {
  const ctx = useContext(TimerContext);
  if (!ctx) throw new Error('useTimer must be used within TimerProvider');
  return ctx;
}
