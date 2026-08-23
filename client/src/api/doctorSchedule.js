import { api } from './client.js';

export function getMySchedule(date) {
  return api.get('/doctors/me/schedule', { params: { date } }).then((res) => res.data.appointments);
}

export function getMyAwaitingNotes() {
  return api.get('/doctors/me/awaiting-notes').then((res) => res.data.appointments);
}

export function getMyWorkingHours() {
  return api.get('/doctors/me/working-hours').then((res) => res.data);
}
