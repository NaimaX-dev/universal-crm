import { request, unwrap } from './apiClient';
export const businessApi = {
  get: () => request('GET', '/business').then(unwrap),
  update: (body) => request('PUT', '/business', { body }).then(unwrap),
};
