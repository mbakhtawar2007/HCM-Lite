import api from './client.js';

export const fetchItems = async () => (await api.get('/items')).data;
export const createItem = async (data) => (await api.post('/items', data)).data;
export const updateItem = async (id, data) => (await api.put(`/items/${id}`, data)).data;
export const deleteItem = async (id) => (await api.delete(`/items/${id}`)).data;
