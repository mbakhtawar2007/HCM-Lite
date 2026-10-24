// Flat config (ESLint 10). Minimal, matching the existing code style:
// ES modules + Node globals, no unused vars (except caught errors and
// leading-underscore args). Server startup/db logs in src/ are intentional
// and kept; frontend has no console output at all.
import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: globals.node },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-undef': 'error',
    },
  },
  { ignores: ['node_modules/**', 'dist/**'] },
];
