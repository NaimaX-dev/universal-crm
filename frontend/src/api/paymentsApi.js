import { request, unwrap, makeResource } from './apiClient';
export const paymentsApi = {
  ...makeResource('/payments'),
  void: (id, reason) => request('POST', `/payments/${id}/void`, { body: { reason } }).then(unwrap),
  receipt: (id) => request('GET', `/payments/${id}/receipt`).then(unwrap),
};
