import { api } from './client.js';

export function listDoctorsAdmin() {
  return api.get('/admin/doctors').then((res) => res.data.doctors);
}

export function getDoctorAdmin(id) {
  return api.get(`/admin/doctors/${id}`).then((res) => res.data.doctor);
}

export function createDoctor(data) {
  return api.post('/admin/doctors', data).then((res) => res.data);
}

export function updateDoctor(id, data) {
  return api.patch(`/admin/doctors/${id}`, data).then((res) => res.data.user);
}

export function setWorkingHours(id, shifts) {
  return api.put(`/admin/doctors/${id}/working-hours`, shifts).then((res) => res.data.workingHours);
}

export function listFailedNotifications(page = 1) {
  return api.get('/admin/notifications/failed', { params: { page } }).then((res) => res.data);
}

export function retryNotification(id) {
  return api.post(`/admin/notifications/${id}/retry`).then((res) => res.data.notification);
}

export function previewLeave(doctorId, body) {
  return api.post(`/admin/doctors/${doctorId}/leave/preview`, body).then((res) => res.data);
}

export function createLeave(doctorId, body) {
  return api.post(`/admin/doctors/${doctorId}/leave`, body).then((res) => res.data);
}

export function deleteLeave(leaveId) {
  return api.delete(`/admin/leave/${leaveId}`);
}
