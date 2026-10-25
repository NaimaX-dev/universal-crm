import { request, unwrap } from './apiClient';
export const authApi = {
  options: () => request('GET', '/auth/options').then(unwrap),
  login: (email, password) => request('POST', '/auth/login', { body: { email, password } }).then(unwrap),
  registerBusiness: (body) => request('POST', '/auth/register-business', { body }).then(unwrap),
  logout: () => request('POST', '/auth/logout', { body: {} }).then(unwrap),
  me: () => request('GET', '/auth/me').then(unwrap),
  updateProfile: (body) => request('PUT', '/auth/me', { body }).then(unwrap),
};
