import * as notificationsService from './notifications.service.js';

export async function listFailed(req, res) {
  const result = await notificationsService.listFailed(req.query);
  res.json(result);
}

export async function retry(req, res) {
  const notification = await notificationsService.retryNotification(req.params.id);
  res.json({ notification });
}
