import { api } from './client.js';

export function login(email, password) {
  return api.post('/auth/login', { email, password }).then((res) => res.data);
}

export function register(data) {
  return api.post('/auth/register', data).then((res) => res.data);
}

export function logout() {
  return api.post('/auth/logout');
}

export function getMe() {
  return api.get('/auth/me').then((res) => res.data);
}
