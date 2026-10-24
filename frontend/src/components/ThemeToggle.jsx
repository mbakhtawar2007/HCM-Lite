import { useEffect, useState } from 'react';
import { getTheme, setTheme } from '../utils/theme.js';
import Button from './ui/Button.jsx';

export default function ThemeToggle() {
  const [theme, setThemeState] = useState(() => getTheme());
  useEffect(() => { setTheme(theme); }, [theme]);
  return (
    <Button
      variant="ghost"
      className="btn btn-ghost btn-icon"
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      onClick={() => setThemeState((t) => (t === 'dark' ? 'light' : 'dark'))}
    >
      <span aria-hidden="true">{theme === 'dark' ? '☀️' : '🌙'}</span>
    </Button>
  );
}
