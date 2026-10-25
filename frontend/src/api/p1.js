import api from './client.js';

export const changePassword = async (data) => (await api.post('/auth/change-password', data)).data;
export const listUsers = async () => (await api.get('/users')).data;
export const createUser = async (data) => (await api.post('/users', data)).data;
export const updateUser = async (id, data) => (await api.patch(`/users/${id}`, data)).data;
export const resetUserPassword = async (id, data) => (await api.post(`/users/${id}/reset-password`, data)).data;

export const getSetting = async () => (await api.get('/org/settings')).data;
export const updateSetting = async (data) => (await api.patch('/org/settings', data)).data;
export const orgList = async (section) => (await api.get(`/org/${section}`)).data;
export const orgCreate = async (section, data) => (await api.post(`/org/${section}`, data)).data;
export const orgUpdate = async (section, id, data) => (await api.patch(`/org/${section}/${id}`, data)).data;
export const orgDelete = async (section, id) => (await api.delete(`/org/${section}/${id}`)).data;

export const listEmployees = async (params = {}) => (await api.get('/employees', { params })).data;
export const createEmployee = async (data) => (await api.post('/employees', data)).data;
export const getEmployee360 = async (id) => (await api.get(`/employees/${id}/360`)).data;
export const updateEmployee = async (id, data) => (await api.patch(`/employees/${id}`, data)).data;
export const exportEmployees = async () => {
  const res = await api.get('/employees/export/csv', { responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'employees.csv';
  a.click();
  URL.revokeObjectURL(url);
};
export const importDryRun = async (csv) => (await api.post('/employees/import/dry-run', { csv })).data;
export const importEmployees = async (csv) => (await api.post('/employees/import', { csv })).data;

export const checkIn = async (location = null) => (await api.post('/attendance/check-in', location || {})).data;
export const checkOut = async () => (await api.post('/attendance/check-out')).data;
export const cameraCheckIn = async (data) => (await api.post('/attendance/check-in/camera', data)).data;
export const myAttendance = async () => (await api.get('/attendance/me')).data;
export const attendanceBoard = async (date) => (await api.get('/attendance/board', { params: { date } })).data;
export const requestCorrection = async (data) => (await api.post('/attendance/corrections', data)).data;
export const listCorrections = async () => (await api.get('/attendance/corrections')).data;
export const decideCorrection = async (id, data) => (await api.patch(`/attendance/corrections/${id}`, data)).data;

export const applyLeave = async (data) => (await api.post('/leaves', data)).data;
export const listLeaves = async (params = {}) => (await api.get('/leaves', { params })).data;
export const leaveBalances = async (params = {}) => (await api.get('/leaves/balances', { params })).data;
export const cancelLeave = async (id) => (await api.patch(`/leaves/${id}/cancel`)).data;
export const decideLeave = async (id, data) => (await api.patch(`/leaves/${id}/decision`, data)).data;

export const listPayrollRuns = async () => (await api.get('/payroll/runs')).data;
export const createPayrollRun = async (data) => (await api.post('/payroll/runs', data)).data;
export const getPayrollRun = async (id) => (await api.get(`/payroll/runs/${id}`)).data;
export const finalizePayrollRun = async (id) => (await api.post(`/payroll/runs/${id}/finalize`)).data;
export const myPayslips = async () => (await api.get('/payroll/my-payslips')).data;
export const downloadPayslipPdf = async (runId, employeeId, month) => {
  // Via the axios client so the Authorization header is included.
  const res = await api.get(`/payroll/runs/${runId}/payslip/${employeeId}/pdf`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `payslip-${month}-${employeeId}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
};

export const listAuditLogs = async (params = {}) => (await api.get('/audit-logs', { params })).data;
export const listAnnouncements = async () => (await api.get('/announcements')).data;
export const createAnnouncement = async (data) => (await api.post('/announcements', data)).data;
export const deleteAnnouncement = async (id) => (await api.delete(`/announcements/${id}`)).data;
export const listNotifications = async () => (await api.get('/notifications')).data;
export const markNotificationRead = async (id) => (await api.patch(`/notifications/${id}/read`)).data;
