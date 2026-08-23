import * as clinicalService from './clinical.service.js';

export async function submitVisitNote(req, res) {
  await clinicalService.submitVisitNote(req.user.id, req.params.id, req.body);
  res.status(201).json({ status: 'COMPLETED' });
}

export async function getPostVisitSummary(req, res) {
  const result = await clinicalService.getPostVisitSummary(req.user.id, req.params.id);
  res.json(result);
}
