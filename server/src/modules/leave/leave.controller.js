import * as leaveService from './leave.service.js';

export async function previewLeave(req, res) {
  const result = await leaveService.previewLeave(req.params.id, req.body);
  res.json({
    startsAt: result.startsAt.toISOString(),
    endsAt: result.endsAt.toISOString(),
    affectedAppointments: result.affectedAppointments.map((appt) => ({
      ...appt,
      startsAt: appt.startsAt.toISOString(),
      endsAt: appt.endsAt.toISOString(),
    })),
  });
}

export async function applyLeave(req, res) {
  const result = await leaveService.applyLeave(req.user.id, req.params.id, req.body);
  res.status(201).json(result);
}

export async function deleteLeave(req, res) {
  await leaveService.deleteLeave(req.params.leaveId);
  res.status(204).send();
}
