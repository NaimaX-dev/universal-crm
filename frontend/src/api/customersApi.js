import { request, unwrap, makeResource } from './apiClient';
export const customersApi = {
  ...makeResource('/customers'),
  overview: (id) => request('GET', `/customers/${id}/overview`).then(unwrap),
  checkDuplicate: (params) => request('GET', '/customers/check-duplicate', { params }).then(unwrap),
};
