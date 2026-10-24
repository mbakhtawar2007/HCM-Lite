import api from './client.js';

export const getAdminDashboard = async (params = {}) => (await api.get('/dashboards/admin', { params })).data;
export const getHrDashboard = async (params = {}) => (await api.get('/dashboards/hr', { params })).data;
export const getEmployeeDashboard = async (params = {}) => (await api.get('/dashboards/employee', { params })).data;
