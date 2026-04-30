const CALL_META_PREFIX = '[[SM_CALL_META:';
const CALL_META_SUFFIX = ']]';

function encodeMeta(meta) {
  try {
    return encodeURIComponent(JSON.stringify(meta));
  } catch {
    return '';
  }
}

function decodeMeta(raw) {
  try {
    return JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
}

export function stripCallMetadata(text) {
  const value = text || '';
  const start = value.lastIndexOf(CALL_META_PREFIX);
  if (start === -1) return value;
  const end = value.indexOf(CALL_META_SUFFIX, start);
  if (end === -1) return value;
  return value.slice(0, start).trimEnd();
}

export function readCallMetadata(source) {
  const value = typeof source === 'string' ? source : (source?.description || '');
  if (!value) return null;
  const start = value.lastIndexOf(CALL_META_PREFIX);
  if (start === -1) return null;
  const end = value.indexOf(CALL_META_SUFFIX, start);
  if (end === -1) return null;
  return decodeMeta(value.slice(start + CALL_META_PREFIX.length, end));
}

export function embedCallMetadata(description, meta) {
  const clean = stripCallMetadata(description || '');
  if (!meta) return clean;
  const payload = {};
  if (meta.starts_at) payload.starts_at = meta.starts_at;
  if (meta.ends_at) payload.ends_at = meta.ends_at;
  if (meta.meeting_link) payload.meeting_link = meta.meeting_link;
  if (meta.call_note_template) payload.call_note_template = meta.call_note_template;
  if (Object.keys(payload).length === 0) return clean;
  const encoded = encodeMeta(payload);
  if (!encoded) return clean;
  return clean ? `${clean}\n\n${CALL_META_PREFIX}${encoded}${CALL_META_SUFFIX}` : `${CALL_META_PREFIX}${encoded}${CALL_META_SUFFIX}`;
}

export function getCallField(task, field) {
  if (task?.[field]) return task[field];
  return readCallMetadata(task)?.[field] || null;
}
