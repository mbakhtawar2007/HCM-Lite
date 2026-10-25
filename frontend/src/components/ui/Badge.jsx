// Status badge: colour is never the only signal — every badge carries a
// text label and a glyph. Status keys come from the API (present, late,
// absent, half_day, missing_checkout, on_leave, pending, approved,
// rejected, DRAFT, FINALIZED, …). Unknown statuses render as plain text.
const GLYPHS = {
  present: '✓',
  late: '◷',
  absent: '✕',
  half_day: '◐',
  half: '◐',
  missing_checkout: '◷',
  on_leave: '○',
  pending: '…',
  approved: '✓',
  rejected: '✕',
  DRAFT: '✎',
  FINALIZED: '🔒',
};

export default function Badge({ status, label }) {
  if (!status && !label) return null;
  const key = String(status ?? '');
  const cls = key ? `badge-${key.toLowerCase()}` : '';
  const text = label ?? key.replace(/_/g, ' ');
  return (
    <span className={`badge ${cls}`}>
      <span aria-hidden="true">{GLYPHS[key] || '•'}</span> {text}
    </span>
  );
}
