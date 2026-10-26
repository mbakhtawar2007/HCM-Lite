// Theme: persisted in localStorage. First load (no saved choice) is
// DARK — the initial value is applied by public/theme-init.js
// (a same-origin script in <head>, so it satisfies the Phase 2 CSP
// scriptSrc 'self' — no inline script) before React mounts, so there
// is no flash of the wrong theme. A saved choice always wins.
export const THEME_KEY = 'hcm-lite-theme';

export function getTheme() {
  if (typeof document !== 'undefined' && document.documentElement.dataset.theme) {
    return document.documentElement.dataset.theme;
  }
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return 'dark';
}

export function setTheme(theme) {
  const t = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
  document.documentElement.style.colorScheme = t;
  localStorage.setItem(THEME_KEY, t);
  return t;
}
