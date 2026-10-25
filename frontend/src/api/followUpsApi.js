import { request, unwrap, makeResource } from './apiClient';
export const followUpsApi = {
  ...makeResource('/follow-ups'),
  complete: (id, outcome) => request('POST', `/follow-ups/${id}/complete`, { body: { outcome } }).then(unwrap),
  reschedule: (id, dueAt, note) => request('POST', `/follow-ups/${id}/reschedule`, { body: { dueAt, note } }).then(unwrap),
};
