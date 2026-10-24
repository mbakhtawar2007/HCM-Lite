import api from './client.js';

export const getSetupStatus = async () => (await api.get('/setup/status')).data;
export const runSetup = async (data) => (await api.post('/setup', data)).data;
