import { api } from './client.js';

export function getPreVisitSummary(appointmentId) {
  return api.get(`/appointments/${appointmentId}/pre-visit-summary`).then((res) => res.data);
}

export function submitVisitNote(appointmentId, data) {
  return api.post(`/appointments/${appointmentId}/visit-note`, data).then((res) => res.data);
}

export function getPrescriptionForAppointment(appointmentId) {
  return api.get(`/appointments/${appointmentId}/prescription`).then((res) => res.data.prescription);
}

export function submitPrescription(appointmentId, data) {
  return api.post(`/appointments/${appointmentId}/prescription`, data).then((res) => res.data);
}
