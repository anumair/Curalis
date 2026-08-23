import { api } from './client.js';

export function holdAppointment(doctorId, startsAt) {
  return api.post('/appointments/hold', { doctorId, startsAt }).then((res) => res.data);
}

export function confirmAppointment(appointmentId, holdToken, symptomForm) {
  return api.post(`/appointments/${appointmentId}/confirm`, { holdToken, symptomForm }).then((res) => res.data);
}

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

export function getPostVisitSummary(id) {
  return api.get(`/appointments/${id}/post-visit-summary`).then((res) => res.data);
}
