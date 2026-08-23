import { api } from './client.js';

export function getCalendarStatus() {
  return api.get('/calendar/status').then((res) => res.data);
}

export function getConnectUrl() {
  return api.get('/calendar/google/connect').then((res) => res.data.authUrl);
}

export function disconnectCalendar() {
  return api.delete('/calendar/google');
}
