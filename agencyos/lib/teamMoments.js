export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const AUTO_MOMENT_POOLS = {
  dashboard_first_open: [
    { style: 'motivation', title: 'Move. No sleepy energy today.', body: 'Start clean, stay sharp, keep your foot on the gas.' },
    { style: 'focus', title: 'Lock in. One clean move at a time.', body: 'You do not need chaos. You need direction.' },
    { style: 'motivation', title: 'Good pace starts now.', body: 'Tiny excuses are banned for the next few hours.' },
  ],
  progress: [
    { style: 'win', title: 'That was a power move.', body: 'Keep the rhythm. The second good move gets easier.' },
    { style: 'fun', title: 'Tiny chaos. Excellent progress.', body: 'You are officially allowed one smug little smile.' },
    { style: 'win', title: 'Nice. That one had teeth.', body: 'Do not break the momentum now.' },
  ],
};

export function buildAutomaticMoment(triggerType) {
  const pool = AUTO_MOMENT_POOLS[triggerType] || AUTO_MOMENT_POOLS.dashboard_first_open;
  const choice = pool[Math.floor(Math.random() * pool.length)];
  return {
    ...choice,
    delivery_kind: 'automatic',
    trigger_type: triggerType,
    sender: { full_name: 'Sky Metrics' },
  };
}

export function emitMomentProgress(detail = {}) {
  if (typeof window === 'undefined') return;
  const payload = {
    source: detail.source || 'progress',
    taskId: detail.taskId || null,
    durationSeconds: detail.durationSeconds || null,
    at: Date.now(),
  };
  try {
    window.localStorage.setItem('sm_pending_progress_moment', JSON.stringify(payload));
  } catch {}
  window.dispatchEvent(new CustomEvent('sky:moment-progress', { detail: payload }));
}
