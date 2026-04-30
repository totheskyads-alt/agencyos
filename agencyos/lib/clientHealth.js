export const CURRENT_STATE_OPTIONS = [
  { value: 'poor', label: 'Poor', emoji: '🚨' },
  { value: 'fragile', label: 'Fragile', emoji: '🫨' },
  { value: 'good', label: 'Good', emoji: '🤝' },
  { value: 'excellent', label: 'Excellent', emoji: '🌟' },
];

export const FUTURE_OUTLOOK_OPTIONS = [
  { value: 'low', label: 'Low', emoji: '⚠️' },
  { value: 'uncertain', label: 'Uncertain', emoji: '🫥' },
  { value: 'solid', label: 'Solid', emoji: '🧭' },
  { value: 'strong', label: 'Strong', emoji: '🚀' },
];

export const ACTUAL_RESULTS_OPTIONS = [
  { value: 'weak', label: 'Weak', emoji: '📉' },
  { value: 'mixed', label: 'Mixed', emoji: '🌓' },
  { value: 'good', label: 'Good', emoji: '📈' },
  { value: 'strong', label: 'Strong', emoji: '🏆' },
];

export const FOCUS_AREA_OPTIONS = [
  { value: 'communication', label: 'Communication' },
  { value: 'results', label: 'Results' },
  { value: 'future_confidence', label: 'Future confidence' },
  { value: 'expectation_setting', label: 'Expectation setting' },
  { value: 'delivery', label: 'Delivery' },
];

export const HEALTH_BUCKETS = [
  { key: 'needs_attention', label: 'Needs attention', emoji: '🚨', description: 'This needs direct attention now.' },
  { key: 'fragile', label: 'Fragile', emoji: '🫨', description: 'Still recoverable, but easy to lose.' },
  { key: 'stable', label: 'Stable', emoji: '🤝', description: 'Healthy enough, keep the rhythm steady.' },
  { key: 'great', label: 'Great', emoji: '🌟', description: 'Strong relationship worth protecting and praising.' },
];

const OPTION_LOOKUPS = {
  current_state: Object.fromEntries(CURRENT_STATE_OPTIONS.map(option => [option.value, option.label])),
  future_outlook: Object.fromEntries(FUTURE_OUTLOOK_OPTIONS.map(option => [option.value, option.label])),
  actual_results: Object.fromEntries(ACTUAL_RESULTS_OPTIONS.map(option => [option.value, option.label])),
  focus_area: Object.fromEntries(FOCUS_AREA_OPTIONS.map(option => [option.value, option.label])),
};

export function getHealthLabel(field, value) {
  if (!value) return 'Not set';
  return OPTION_LOOKUPS[field]?.[value] || value;
}

export function getHealthOption(field, value) {
  let options = [];
  if (field === 'current_state') options = CURRENT_STATE_OPTIONS;
  if (field === 'future_outlook') options = FUTURE_OUTLOOK_OPTIONS;
  if (field === 'actual_results') options = ACTUAL_RESULTS_OPTIONS;
  if (field === 'focus_area') options = FOCUS_AREA_OPTIONS;
  return options.find(option => option.value === value) || null;
}

export function getHealthBucket(currentState) {
  switch (currentState) {
    case 'poor':
      return 'needs_attention';
    case 'fragile':
      return 'fragile';
    case 'good':
      return 'stable';
    case 'excellent':
      return 'great';
    default:
      return 'stable';
  }
}

export function getHealthBucketLabel(currentState) {
  const bucket = getHealthBucket(currentState);
  return HEALTH_BUCKETS.find(item => item.key === bucket)?.label || 'Stable';
}

export function getHealthTone(currentState) {
  switch (currentState) {
    case 'poor':
      return {
        badge: 'bg-red-50 text-red-600 border-red-100',
        dot: '#FF6B6B',
        cardAccent: 'from-red-400/90 to-orange-300/90',
      };
    case 'fragile':
      return {
        badge: 'bg-amber-50 text-amber-700 border-amber-100',
        dot: '#FFB340',
        cardAccent: 'from-amber-400/90 to-yellow-300/90',
      };
    case 'excellent':
      return {
        badge: 'bg-emerald-50 text-emerald-700 border-emerald-100',
        dot: '#34C759',
        cardAccent: 'from-emerald-400/90 to-teal-300/90',
      };
    case 'good':
    default:
      return {
        badge: 'bg-blue-50 text-ios-blue border-blue-100',
        dot: '#4F8DFF',
        cardAccent: 'from-blue-400/90 to-cyan-300/90',
      };
  }
}

export function deriveHealthInsight({ current_state, future_outlook, actual_results, focus_area }) {
  if ((current_state === 'poor' || current_state === 'fragile') && (actual_results === 'good' || actual_results === 'strong')) {
    return 'Good results, weak relationship';
  }
  if ((current_state === 'good' || current_state === 'excellent') && (actual_results === 'weak' || actual_results === 'mixed')) {
    return 'Results need improvement';
  }
  if ((current_state === 'good' || current_state === 'excellent') && (future_outlook === 'low' || future_outlook === 'uncertain')) {
    return 'Future confidence is slipping';
  }
  if ((current_state === 'poor' || current_state === 'fragile') && (future_outlook === 'low' || future_outlook === 'uncertain')) {
    return 'Communication risk';
  }
  if (focus_area === 'delivery') return 'Delivery needs closer attention';
  if (focus_area === 'expectation_setting') return 'Expectation setting needs work';
  if (focus_area === 'communication') return 'Communication risk';
  if (focus_area === 'results') return 'Results need improvement';
  if (focus_area === 'future_confidence') return 'Future confidence is slipping';
  return 'Healthy relationship to maintain';
}

export function isWhiteLabelClient(client) {
  return (client?.client_type || client?.type || 'direct') === 'whitelabel';
}

export function createEmptyHealth(scopeType = 'client', scopeId = '') {
  return {
    scope_type: scopeType,
    scope_id: scopeId,
    current_state: 'good',
    future_outlook: 'solid',
    actual_results: 'good',
    summary_note: '',
    insight: '',
    focus_area: '',
  };
}
