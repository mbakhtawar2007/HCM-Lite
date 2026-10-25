import api from './client.js';

// P3 — the browser never talks to the AI provider and never sees a key.
// Every call goes to our own backend, which enforces role scope, the
// salary guard, the hourly rate limit, and the 15s provider timeout.
export const aiChat = async (message, history = [], language) =>
  (await api.post('/ai/chat', { message, history, ...(language ? { language } : {}) })).data;
export const aiDashboardSummary = async (kpi) => (await api.post('/ai/dashboard-summary', { kpi })).data;
export const aiSmartLeave = async (text) => (await api.post('/ai/smart-leave', { text })).data;
