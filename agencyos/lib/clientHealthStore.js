import { supabase } from '@/lib/supabase';

export async function loadHealthMap(scopeType, scopeIds = []) {
  if (!scopeIds.length) return {};
  const { data, error } = await supabase
    .from('client_health')
    .select('*')
    .eq('scope_type', scopeType)
    .in('scope_id', scopeIds);

  if (error) {
    console.warn('Client health table not available yet', error);
    return {};
  }

  return Object.fromEntries((data || []).map(item => [item.scope_id, item]));
}

export async function saveHealthRecord(record, userId, previousRecord = null) {
  if (!record?.scope_type || !record?.scope_id) {
    return { error: new Error('Missing health scope') };
  }

  const payload = {
    scope_type: record.scope_type,
    scope_id: record.scope_id,
    current_state: record.current_state,
    future_outlook: record.future_outlook,
    actual_results: record.actual_results,
    summary_note: record.summary_note || null,
    insight: record.insight || null,
    focus_area: record.focus_area || null,
    updated_by: userId || null,
  };

  if (previousRecord?.id) {
    await supabase.from('client_health_history').insert({
      client_health_id: previousRecord.id,
      scope_type: previousRecord.scope_type,
      scope_id: previousRecord.scope_id,
      current_state: previousRecord.current_state,
      future_outlook: previousRecord.future_outlook,
      actual_results: previousRecord.actual_results,
      summary_note: previousRecord.summary_note,
      insight: previousRecord.insight,
      focus_area: previousRecord.focus_area,
      updated_by: userId || null,
    });
  }

  const { data, error } = await supabase
    .from('client_health')
    .upsert(payload, { onConflict: 'scope_type,scope_id' })
    .select('*')
    .single();

  return { data, error };
}
