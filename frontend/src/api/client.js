import axios from 'axios';

export const TOKEN_KEY = 'hcm_lite_token';

// In dev this is empty, so requests go to /api and Vite proxies them to
// the backend. In production set VITE_API_URL to the deployed backend.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
});

let onUnauthorized = null;
export const setUnauthorizedHandler = (handler) => {
  onUnauthorized = handler;
};

export const getStoredToken = () => localStorage.getItem(TOKEN_KEY);
export const storeToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearStoredToken = () => localStorage.removeItem(TOKEN_KEY);

api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // An expired/revoked token anywhere means "logged out" everywhere:
    // clear it once here and let the auth context react to it.
    if (error.response?.status === 401 && getStoredToken()) {
      clearStoredToken();
      onUnauthorized?.();
    }
    return Promise.reject(error);
  },
);

// Every API module returns response.data, so pages never touch axios
// response wrappers. Error text: err.response?.data?.message.
export default api;
