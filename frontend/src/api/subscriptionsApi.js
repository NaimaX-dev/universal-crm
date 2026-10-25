import { request, unwrap, makeResource } from './apiClient';
export const subscriptionsApi = {
  ...makeResource('/subscriptions'),
  renew: (id, body) => request('POST', `/subscriptions/${id}/renew`, { body }).then(unwrap), // creates the next invoice (manual billing)
};
