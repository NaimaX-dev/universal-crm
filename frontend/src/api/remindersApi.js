import { request, unwrap } from './apiClient';
export const remindersApi = {
  status: () => request('GET', '/reminders/status').then(unwrap),
  send: () => request('POST', '/reminders/send', { body: {} }).then(unwrap),
};
