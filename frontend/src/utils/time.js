// Human time <-> minutes helpers for the office-start input. The
// backend stores minutes after midnight (540 = 09:00) and that shape
// is unchanged: the conversion happens only in the form and must
// round-trip exactly (540 <-> "09:00").
export function minutesToTime(m) {
  const n = Number(m);
  if (!Number.isFinite(n) || n < 0) return '09:00';
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
}

export function timeToMinutes(t) {
  const [h, mm] = String(t || '').split(':');
  const hn = parseInt(h, 10);
  const mn = parseInt(mm, 10);
  if (!Number.isFinite(hn) || !Number.isFinite(mn)) return 540;
  return hn * 60 + mn;
}
