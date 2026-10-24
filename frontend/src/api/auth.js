import api from './client.js';

export const loginUser = async (data) => (await api.post('/auth/login', data)).data;
export const logoutUser = async () => (await api.post('/auth/logout')).data;
export const fetchMe = async () => (await api.get('/users/me')).data;
