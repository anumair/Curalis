import { api } from './client.js';

export function listPrescriptions() {
  return api.get('/patients/me/prescriptions').then((res) => res.data.prescriptions);
}
