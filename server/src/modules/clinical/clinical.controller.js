import * as clinicalService from './clinical.service.js';

export async function submitVisitNote(req, res) {
  await clinicalService.submitVisitNote(req.user.id, req.params.id, req.body);
  res.status(201).json({ status: 'COMPLETED' });
}

export async function getPostVisitSummary(req, res) {
  const result = await clinicalService.getPostVisitSummary(req.user.id, req.params.id);
  res.json(result);
}

export async function submitPrescription(req, res) {
  const result = await clinicalService.submitPrescription(req.user.id, req.params.id, req.body);
  res.status(201).json(result);
}

export async function listMyPrescriptions(req, res) {
  const prescriptions = await clinicalService.listMyPrescriptions(req.user.id);
  res.json({ prescriptions });
}

export async function updateReminderPreferences(req, res) {
  await clinicalService.updateReminderPreferences(req.user.id, req.body.medicationRemindersEnabled);
  res.status(204).send();
}
