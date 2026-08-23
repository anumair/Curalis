import * as aiService from './ai.service.js';

export async function getPreVisitSummary(req, res) {
  const result = await aiService.getPreVisitSummary(req.user.id, req.params.id);
  res.json(result);
}

export async function regenerateSummary(req, res) {
  await aiService.regenerateSummary(req.user, req.params.id, req.body.type);
  res.status(202).json({ status: 'PENDING' });
}
