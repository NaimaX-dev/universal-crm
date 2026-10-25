import { request, unwrap } from './apiClient';
export const reportsApi = {
  get: (type, params) => request('GET', `/reports/${type}`, { params }).then(unwrap),
};
export const dashboardApi = {
  get: () => request('GET', '/dashboard').then(unwrap),
};
