'use client';

import { AlertCircle, ArrowUpRight, HeartPulse, Sparkles } from 'lucide-react';
import {
  getHealthBucket,
  getHealthBucketLabel,
  getHealthLabel,
  getHealthOption,
  getHealthTone,
  HEALTH_BUCKETS,
} from '@/lib/clientHealth';

export default function ClientHealthSummaryCard({
  health,
  title,
  subtitle,
  compact = false,
  onClick,
}) {
  const tone = getHealthTone(health?.current_state);
  const isUnset = health?.is_unset;
  const insight = health?.insight || 'No health note yet';
  const bucket = getHealthBucket(health?.current_state);
  const bucketMeta = HEALTH_BUCKETS.find(item => item.key === bucket);
  const currentOption = getHealthOption('current_state', health?.current_state);
  const futureOption = getHealthOption('future_outlook', health?.future_outlook);
  const resultsOption = getHealthOption('actual_results', health?.actual_results);
  const focusOption = getHealthOption('focus_area', health?.focus_area);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-ios-xl border border-ios-separator/40 bg-white transition-all hover:-translate-y-0.5 hover:shadow-ios-lg ${
        compact ? 'p-3' : 'p-4'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-caption1 font-semibold border ${isUnset ? 'bg-ios-fill text-ios-secondary border-ios-separator/50' : tone.badge}`}>
              <span className="text-[13px] leading-none">{isUnset ? '🫥' : bucketMeta?.emoji}</span>
              {isUnset ? 'Not reviewed' : getHealthBucketLabel(health?.current_state)}
            </p>
            <span className="text-caption1 text-ios-tertiary">{subtitle}</span>
          </div>
          <div className={`flex items-center gap-3 ${compact ? 'mt-3' : 'mt-4'}`}>
            <div
              className={`shrink-0 rounded-[18px] border border-white/70 bg-gradient-to-br shadow-ios-sm ${
                compact ? 'w-12 h-12 text-xl' : 'w-14 h-14 text-2xl'
              } flex items-center justify-center`}
              style={{
                backgroundImage: isUnset
                  ? 'linear-gradient(135deg, rgba(242,242,247,1), rgba(229,229,234,1))'
                  : `linear-gradient(135deg, ${tone.dot}22, ${tone.dot}40)`,
              }}
            >
              {isUnset ? '🫥' : (currentOption?.emoji || bucketMeta?.emoji)}
            </div>
            <div className="min-w-0">
              <p className={`font-semibold text-ios-primary truncate ${compact ? 'text-subhead' : 'text-headline'}`}>{title}</p>
              <p className="text-footnote text-ios-secondary mt-0.5 truncate">
                {isUnset ? 'No pulse captured yet.' : (bucketMeta?.description || 'Healthy relationship to maintain.')}
              </p>
            </div>
          </div>
        </div>
        <ArrowUpRight className="w-4 h-4 text-ios-tertiary shrink-0" />
      </div>

      <div className={`grid grid-cols-1 sm:grid-cols-3 gap-2 ${compact ? 'mt-3' : 'mt-4'}`}>
        <div className="rounded-ios-lg border border-ios-separator/40 bg-white px-3 py-3 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
          <p className="text-caption1 font-semibold uppercase tracking-wide text-ios-secondary">Current</p>
          <p className="text-footnote font-semibold text-ios-primary flex items-center gap-2 mt-1">
            <span>{currentOption?.emoji || '🫥'}</span>
            {getHealthLabel('current_state', health?.current_state)}
          </p>
        </div>
        <div className="rounded-ios-lg border border-ios-separator/40 bg-white px-3 py-3 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
          <p className="text-caption1 font-semibold uppercase tracking-wide text-ios-secondary">Outlook</p>
          <p className="text-footnote font-semibold text-ios-primary flex items-center gap-2 mt-1">
            <span>{futureOption?.emoji || '🫥'}</span>
            {getHealthLabel('future_outlook', health?.future_outlook)}
          </p>
        </div>
        <div className="rounded-ios-lg border border-ios-separator/40 bg-white px-3 py-3 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
          <p className="text-caption1 font-semibold uppercase tracking-wide text-ios-secondary">Results</p>
          <p className="text-footnote font-semibold text-ios-primary flex items-center gap-2 mt-1">
            <span>{resultsOption?.emoji || '🫥'}</span>
            {getHealthLabel('actual_results', health?.actual_results)}
          </p>
        </div>
      </div>

      <div className={`rounded-ios-lg ${isUnset ? 'bg-ios-fill text-ios-primary' : `bg-gradient-to-r ${tone.cardAccent} text-white`} px-3.5 py-3 ${compact ? 'mt-3' : 'mt-4'}`}>
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-3.5 h-3.5 shrink-0" />
          <p className="text-caption1 font-semibold uppercase tracking-wide">Insight</p>
        </div>
        <p className={`${compact ? 'text-footnote' : 'text-subhead'} font-semibold leading-snug`}>{insight}</p>
      </div>

      {health?.summary_note && (
        <div className={`flex items-start gap-2 text-ios-secondary ${compact ? 'mt-3' : 'mt-4'}`}>
          <HeartPulse className="w-4 h-4 mt-0.5 shrink-0 text-ios-blue" />
          <p className="text-footnote leading-6">{health.summary_note}</p>
        </div>
      )}

      {health?.focus_area && (
        <div className={`flex items-center gap-2 text-ios-secondary ${compact ? 'mt-2' : 'mt-3'}`}>
          <AlertCircle className="w-4 h-4 shrink-0 text-ios-orange" />
          <p className="text-caption1 font-medium">
            Focus: {focusOption?.label || getHealthLabel('focus_area', health.focus_area)}
          </p>
        </div>
      )}
    </button>
  );
}
