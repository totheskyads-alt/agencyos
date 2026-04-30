'use client';

import { createPortal } from 'react-dom';
import { useEffect, useMemo, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import {
  ACTUAL_RESULTS_OPTIONS,
  createEmptyHealth,
  CURRENT_STATE_OPTIONS,
  deriveHealthInsight,
  FOCUS_AREA_OPTIONS,
  FUTURE_OUTLOOK_OPTIONS,
  getHealthLabel,
  getHealthOption,
} from '@/lib/clientHealth';

function ChoiceRow({ label, value, onChange, options }) {
  return (
    <div className="space-y-2">
      <p className="text-footnote font-semibold text-ios-secondary uppercase tracking-wide">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        {options.map(option => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`px-3 py-3 rounded-ios-lg text-left transition-all border ${
              value === option.value
                ? 'bg-ios-blue text-white border-ios-blue shadow-ios-sm'
                : 'bg-white text-ios-secondary border-ios-separator/50 hover:bg-ios-fill'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-[14px] flex items-center justify-center text-lg shrink-0 ${
                value === option.value ? 'bg-white/18' : 'bg-ios-fill'
              }`}>
                {option.emoji || '•'}
              </div>
              <div className="min-w-0">
                <p className="text-footnote font-semibold">{option.label}</p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ClientHealthSheet({
  open,
  onClose,
  onSave,
  entityLabel,
  scopeType,
  scopeId,
  initialHealth,
  loading = false,
}) {
  const [mounted, setMounted] = useState(false);
  const [form, setForm] = useState(createEmptyHealth(scopeType, scopeId));

  useEffect(() => {
    if (!open) return undefined;

    const html = document.documentElement;
    const body = document.body;
    const scrollbarWidth = Math.max(0, window.innerWidth - html.clientWidth);
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyPaddingRight = body.style.paddingRight;
    const previousHtmlPaddingRight = html.style.paddingRight;

    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    html.classList.add('modal-scroll-lock');
    body.classList.add('modal-scroll-lock');
    setMounted(true);
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      const gutter = `${scrollbarWidth}px`;
      html.style.paddingRight = gutter;
      body.style.paddingRight = gutter;
    }

    return () => {
      document.removeEventListener('keydown', handleKey);
      html.classList.remove('modal-scroll-lock');
      body.classList.remove('modal-scroll-lock');
      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
      html.style.paddingRight = previousHtmlPaddingRight;
      body.style.paddingRight = previousBodyPaddingRight;
      setMounted(false);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    setForm({
      ...createEmptyHealth(scopeType, scopeId),
      ...(initialHealth || {}),
      scope_type: scopeType,
      scope_id: scopeId,
    });
  }, [initialHealth, open, scopeId, scopeType]);

  const previewInsight = useMemo(
    () => deriveHealthInsight(form),
    [form]
  );
  const currentOption = getHealthOption('current_state', form.current_state);
  const futureOption = getHealthOption('future_outlook', form.future_outlook);
  const resultsOption = getHealthOption('actual_results', form.actual_results);

  if (!open || !mounted) return null;

  return createPortal((
    <div className="fixed inset-0 z-[110]">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 w-full sm:max-w-xl bg-white shadow-ios-modal flex flex-col">
        <div className="px-5 py-4 border-b border-ios-separator/50 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <p className="text-title3 font-bold text-ios-primary truncate">Client Health</p>
            <p className="text-footnote text-ios-secondary truncate">{entityLabel}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-ios-fill flex items-center justify-center hover:bg-ios-fill2 transition-colors">
            <X className="w-4 h-4 text-ios-secondary" strokeWidth={2.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          <div className="rounded-ios-xl border border-ios-separator/40 bg-gradient-to-br from-white to-ios-fill/60 p-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-[20px] bg-white border border-ios-separator/40 flex items-center justify-center text-2xl shadow-ios-sm">
                {currentOption?.emoji || '🫥'}
              </div>
              <div className="min-w-0">
                <p className="text-caption1 uppercase tracking-wide font-semibold text-ios-secondary">Live read</p>
                <p className="text-headline font-semibold text-ios-primary">{getHealthLabel('current_state', form.current_state)}</p>
                <p className="text-footnote text-ios-secondary mt-1">A quick pulse on how this relationship feels right now.</p>
              </div>
            </div>
            <div className="rounded-ios-lg bg-white/90 border border-ios-separator/30 px-3.5 py-3">
              <div className="flex items-center gap-2 mb-1.5">
                <Sparkles className="w-4 h-4 text-ios-blue" />
                <p className="text-caption1 uppercase tracking-wide font-semibold text-ios-secondary">Insight</p>
              </div>
              <p className="text-subhead font-semibold text-ios-primary leading-snug">{previewInsight}</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-ios-lg bg-white/90 border border-ios-separator/30 px-3 py-2">
                <p className="text-caption2 text-ios-tertiary">Current</p>
                <p className="text-footnote font-semibold text-ios-primary flex items-center gap-2 mt-1">
                  <span>{currentOption?.emoji || '🫥'}</span>
                  {getHealthLabel('current_state', form.current_state)}
                </p>
              </div>
              <div className="rounded-ios-lg bg-white/90 border border-ios-separator/30 px-3 py-2">
                <p className="text-caption2 text-ios-tertiary">Outlook</p>
                <p className="text-footnote font-semibold text-ios-primary flex items-center gap-2 mt-1">
                  <span>{futureOption?.emoji || '🫥'}</span>
                  {getHealthLabel('future_outlook', form.future_outlook)}
                </p>
              </div>
              <div className="rounded-ios-lg bg-white/90 border border-ios-separator/30 px-3 py-2">
                <p className="text-caption2 text-ios-tertiary">Results</p>
                <p className="text-footnote font-semibold text-ios-primary flex items-center gap-2 mt-1">
                  <span>{resultsOption?.emoji || '🫥'}</span>
                  {getHealthLabel('actual_results', form.actual_results)}
                </p>
              </div>
            </div>
          </div>

          <ChoiceRow
            label="Current State"
            value={form.current_state}
            options={CURRENT_STATE_OPTIONS}
            onChange={(value) => setForm(prev => ({ ...prev, current_state: value }))}
          />
          <ChoiceRow
            label="Future Outlook"
            value={form.future_outlook}
            options={FUTURE_OUTLOOK_OPTIONS}
            onChange={(value) => setForm(prev => ({ ...prev, future_outlook: value }))}
          />
          <ChoiceRow
            label="Actual Results"
            value={form.actual_results}
            options={ACTUAL_RESULTS_OPTIONS}
            onChange={(value) => setForm(prev => ({ ...prev, actual_results: value }))}
          />

          <div className="space-y-2">
            <p className="text-footnote font-semibold text-ios-secondary uppercase tracking-wide">Short note</p>
            <textarea
              rows={4}
              className="input min-h-[112px]"
              placeholder="Short context about how this relationship feels right now..."
              value={form.summary_note || ''}
              onChange={(e) => setForm(prev => ({ ...prev, summary_note: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <p className="text-footnote font-semibold text-ios-secondary uppercase tracking-wide">Focus area (optional)</p>
            <div className="flex flex-wrap gap-2">
              {FOCUS_AREA_OPTIONS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, focus_area: prev.focus_area === option.value ? '' : option.value }))}
                  className={`px-3 py-2 rounded-full text-footnote font-semibold border transition-all ${
                    form.focus_area === option.value
                      ? 'bg-ios-primary text-white border-ios-primary'
                      : 'bg-white text-ios-secondary border-ios-separator/50 hover:bg-ios-fill'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-ios-separator/50 flex items-center gap-3 shrink-0">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave({ ...form, insight: previewInsight })}
            className="btn-primary flex-1"
            disabled={loading}
          >
            {loading ? 'Saving...' : 'Save Health'}
          </button>
        </div>
      </div>
    </div>
  ), document.body);
}
