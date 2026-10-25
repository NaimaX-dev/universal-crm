import { request, unwrap, makeResource } from './apiClient';
// "users" = Agents of the business (Admin only).  "team" = minimal id/name list for dropdowns.
export const usersApi = {
  ...makeResource('/users'),
  activity: (id) => request('GET', `/users/${id}/activity`).then(unwrap),
  team: () => request('GET', '/team').then(unwrap),
};
