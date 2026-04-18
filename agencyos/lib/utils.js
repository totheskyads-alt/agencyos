// ─── Timezone fix ─────────────────────────────────────────────────────────────
// Supabase returns timestamps WITHOUT 'Z', so JS treats them as local time.
// We always append 'Z' to force UTC parsing.
export function parseUTC(dateStr) {
  if (!dateStr) return null;
  const s = typeof dateStr === 'string' ? dateStr : dateStr.toString();
  return new Date(s.endsWith('Z') ? s : s + 'Z');
}

export function getElapsed(startTime) {
  if (!startTime) return 0;
  return Math.floor((Date.now() - parseUTC(startTime).getTime()) / 1000);
}

// ─── Formatting ───────────────────────────────────────────────────────────────
export function fmtClock(seconds) {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600).toString().padStart(2, '0');
  const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${h}:${m}:${sec}`;
}

export function fmtDuration(seconds) {
  if (!seconds || seconds < 0) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function fmtDurationLong(seconds) {
  if (!seconds || seconds < 0) return '0:00:00';
  return fmtClock(seconds);
}

export function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const d = parseUTC(dateStr);
  return d.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtDateShort(dateStr) {
  if (!dateStr) return '—';
  const d = parseUTC(dateStr);
  return d.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' });
}

export function fmtTime(dateStr) {
  if (!dateStr) return '—';
  const d = parseUTC(dateStr);
  return d.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
}

export function fmtCurrency(amount, currency = 'EUR') {
  if (amount == null) return '—';
  return new Intl.NumberFormat('ro-RO', {
    style: 'currency', currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function fmtPercent(value) {
  if (value == null) return '—';
  return `${Math.round(value)}%`;
}

// ─── Analytics helpers ────────────────────────────────────────────────────────
export function calcProfitability(revenue, costPerHour, totalSeconds) {
  if (!revenue || !costPerHour || !totalSeconds) return null;
  const cost = (totalSeconds / 3600) * costPerHour;
  const profit = revenue - cost;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  return { cost, profit, margin };
}

export function getNeglectScore(lastActivityDate) {
  if (!lastActivityDate) return 100;
  const days = Math.floor((Date.now() - parseUTC(lastActivityDate).getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 1) return 0;
  if (days <= 3) return 20;
  if (days <= 7) return 50;
  if (days <= 14) return 75;
  return 100;
}

export function getNeglectLabel(score) {
  if (score === 0)  return { label: 'Activ',     color: 'badge-green' };
  if (score <= 20)  return { label: 'Bun',       color: 'badge-blue' };
  if (score <= 50)  return { label: 'Atenție',   color: 'badge-orange' };
  return               { label: 'Neglijat',  color: 'badge-red' };
}

// ─── Color utils ──────────────────────────────────────────────────────────────
export const PROJECT_COLORS = [
  '#007AFF','#34C759','#FF9500','#FF3B30',
  '#AF52DE','#32ADE6','#5856D6','#FF2D55',
  '#00C7BE','#FFD60A',
];

export const TASK_STATUS = {
  todo:        { label: 'De făcut',  color: 'badge-gray' },
  in_progress: { label: 'În lucru', color: 'badge-blue' },
  review:      { label: 'Review',   color: 'badge-orange' },
  done:        { label: 'Finalizat',color: 'badge-green' },
};

export const TASK_PRIORITY = {
  low:    { label: 'Scăzut',  color: 'badge-gray' },
  medium: { label: 'Mediu',   color: 'badge-orange' },
  high:   { label: 'Ridicat', color: 'badge-red' },
  urgent: { label: 'Urgent',  color: 'badge-red' },
};

export const ROLES = {
  admin:    { label: 'Admin',    color: 'badge-purple' },
  manager:  { label: 'Manager', color: 'badge-blue' },
  operator: { label: 'Operator',color: 'badge-gray' },
};

// ─── Date ranges ──────────────────────────────────────────────────────────────
export function getDateRange(range) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (range) {
    case 'today':
      return { from: today, to: new Date(today.getTime() + 86400000) };
    case 'week': {
      const start = new Date(today);
      start.setDate(today.getDate() - today.getDay() + 1);
      return { from: start, to: new Date() };
    }
    case 'month':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date() };
    case 'last_month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: start, to: end };
    }
    default:
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date() };
  }
}
