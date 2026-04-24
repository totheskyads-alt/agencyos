'use client';
import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { getElapsed, parseUTC } from '@/lib/utils';
import { emitMomentProgress } from '@/lib/teamMoments';

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
  const pauseStateRef = useRef({ isPaused: false, pausedAt: null, pauseSeconds: 0 });
  const lockRef = useRef(false); // prevents poll from interfering during start/stop

  useEffect(() => { activeTimerRef.current = activeTimer; }, [activeTimer]);
  useEffect(() => {
    pauseStateRef.current = { isPaused, pausedAt, pauseSeconds };
  }, [isPaused, pausedAt, pauseSeconds]);

  function getTrackedDuration(entry) {
    if (!entry?.start_time) return 1;
    const total = getElapsed(entry.start_time);
    const pauseState = pauseStateRef.current;
    const storedPause = Number(entry.pause_seconds ?? pauseState.pauseSeconds ?? 0) || 0;
    const pauseStartedAt = pauseState.isPaused
      ? pauseState.pausedAt
      : entry.paused_at
        ? parseUTC(entry.paused_at)?.getTime()
        : null;
    const activePause = pauseStartedAt ? Math.max(0, Math.round((Date.now() - pauseStartedAt) / 1000)) : 0;
    return Math.max(1, total - storedPause - activePause);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user;
      if (user) { setUserId(user.id); loadTimer(user.id); }
    });
    return () => { clearInterval(intervalRef.current); clearInterval(pollRef.current); };
  }, []);

  useEffect(() => {
    if (!userId) return;
    pollRef.current = setInterval(() => {
      if (!lockRef.current) loadTimer(userId);
    }, 8000);
    return () => clearInterval(pollRef.current);
  }, [userId]);

  useEffect(() => {
    clearInterval(intervalRef.current);
    if (!activeTimer?.start_time) { setElapsed(0); return; }
    const tick = () => setElapsed(getElapsed(activeTimer.start_time));
    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => clearInterval(intervalRef.current);
  }, [activeTimer?.id]);

  async function loadTimer(uid) {
    if (lockRef.current) return;
    // Use limit(1) + order so multiple ghost entries don't break .maybeSingle()
    const { data: rows } = await supabase.from('time_entries')
      .select('*, projects(name,color), tasks(title)')
      .eq('user_id', uid || userId).is('end_time', null)
      .order('created_at', { ascending: false }).limit(5);
    const data = rows?.[0] || null;

    // Clean up ghost entries (older duplicates with no end_time)
    if (rows && rows.length > 1) {
      const ghostIds = rows.slice(1).map(r => r.id);
      const dur = Math.max(1, getElapsed(rows[0].start_time));
      await Promise.all(ghostIds.map(id =>
        supabase.from('time_entries').update({ end_time: new Date().toISOString(), duration_seconds: 1 }).eq('id', id)
      ));
    }

    if (lockRef.current) return; // check again after await

    setActiveTimer(prev => {
      if (prev?.id && !data && !lockRef.current) {
        supabase.from('time_entries')
          .select('*, projects(name,color), tasks(title)')
          .eq('id', prev.id).single()
          .then(({ data: stopped }) => {
            if (stopped?.end_time) setStoppedEntry(stopped);
          });
      }
      return data || null;
    });

    if (data?.paused_at && !data.end_time) {
      setIsPaused(true);
      setPausedAt(new Date(data.paused_at + (data.paused_at.endsWith('Z') ? '' : 'Z')).getTime());
      setPauseSeconds(data.pause_seconds || 0);
    } else if (!data) {
      setIsPaused(false); setPausedAt(null); setPauseSeconds(0);
    }
  }

  const startTimer = useCallback(async ({ projectId, taskId, description }) => {
    if (!userId || !projectId) return null;
    lockRef.current = true; // lock polling
    try {
      const cur = activeTimerRef.current;
      if (cur) {
        const dur = getTrackedDuration(cur);
        await supabase.from('time_entries')
          .update({ end_time: new Date().toISOString(), duration_seconds: dur })
          .eq('id', cur.id);
      }
      const { data, error } = await supabase.from('time_entries').insert({
        user_id: userId, project_id: projectId,
        task_id: taskId || null, description: description || null,
        start_time: new Date().toISOString(),
      }).select('*, projects(name,color), tasks(title)').single();
      if (error) { console.error('startTimer:', error); return null; }
      setActiveTimer(data);
      setStoppedEntry(null);
      setIsPaused(false); setPausedAt(null); setPauseSeconds(0);
      return data;
    } finally {
      // Release lock after a short delay to let state settle
      setTimeout(() => { lockRef.current = false; }, 2000);
    }
  }, [userId]);

  const stopTimer = useCallback(async () => {
    const cur = activeTimerRef.current;
    if (!cur) return;
    lockRef.current = true;
    try {
      const dur = getTrackedDuration(cur);
      const { data: stopped } = await supabase.from('time_entries')
        .update({ end_time: new Date().toISOString(), duration_seconds: dur })
        .eq('id', cur.id)
        .select('*, projects(name,color), tasks(title)').single();
      setStoppedEntry(stopped || cur);
      if (dur >= 1500) {
        emitMomentProgress({
          source: 'timer_stop',
          taskId: cur.task_id || null,
          durationSeconds: dur,
        });
      }
      setActiveTimer(null); setElapsed(0);
      setIsPaused(false); setPausedAt(null); setPauseSeconds(0);
    } finally {
      setTimeout(() => { lockRef.current = false; }, 2000);
    }
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
    ? Math.max(0, elapsed - (pausedAt ? Math.round((Date.now() - pausedAt) / 1000) : 0) - pauseSeconds)
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
