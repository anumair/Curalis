import { api } from './client.js';

export function listDoctors(params) {
  return api.get('/doctors', { params }).then((res) => res.data);
}

export function getDoctor(id) {
  return api.get(`/doctors/${id}`).then((res) => res.data.doctor);
}

export function listSpecialisations() {
  return api.get('/specialisations').then((res) => res.data.specialisations);
}

export function getAvailability(doctorId, date) {
  return api.get(`/doctors/${doctorId}/availability`, { params: { date } }).then((res) => res.data);
}
