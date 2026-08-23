import { api } from './client.js';

export function listAppointments(status) {
  return api.get('/patients/me/appointments', { params: { status } }).then((res) => res.data.appointments);
}

export function getAppointment(id) {
  return api.get(`/appointments/${id}`).then((res) => res.data.appointment);
}

export function cancelAppointment(id, reason) {
  return api.post(`/appointments/${id}/cancel`, { reason }).then((res) => res.data);
}

export function rescheduleAppointment(id, newStartsAt) {
  return api.patch(`/appointments/${id}/reschedule`, { newStartsAt }).then((res) => res.data);
}
