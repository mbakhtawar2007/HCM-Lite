// Phase 2 — escape user input before it becomes a RegExp. Without this,
// a search string like "(a+)+$" is a ReDoS / regex-injection vector in
// directory search and AI employee search.
export const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
