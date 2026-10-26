/* HCM Lite theme init — runs in <head> before React mounts, so the
   first paint already uses the saved theme (no flash).
   Same-origin script, so it satisfies the backend CSP scriptSrc 'self'
   (an inline script would be blocked).
   First-load default is DARK (user report: first load appeared light):
   a saved choice always wins, but with no saved choice the site opens
   dark instead of following the system light preference. */
(function () {
  try {
    var saved = localStorage.getItem('hcm-lite-theme');
    var theme = saved === 'light' || saved === 'dark' ? saved : 'dark';
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch (e) { /* private mode etc. — default light theme applies */ }
})();
