import { request, normalizeList } from './apiClient';
export const activityApi = { list: (params) => request('GET', '/activity', { params }).then(normalizeList) };
