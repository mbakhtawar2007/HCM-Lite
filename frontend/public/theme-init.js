/* HCM Lite theme init — runs in <head> before React mounts, so the
   first paint already uses the saved/system theme (no flash).
   Same-origin script, so it satisfies the backend CSP scriptSrc 'self'
   (an inline script would be blocked). */
(function () {
  try {
    var saved = localStorage.getItem('hcm-lite-theme');
    var theme = saved === 'light' || saved === 'dark' ? saved
      : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch (e) { /* private mode etc. — default light theme applies */ }
})();
