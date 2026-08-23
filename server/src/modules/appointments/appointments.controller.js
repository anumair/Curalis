import * as appointmentsService from './appointments.service.js';

export async function hold(req, res) {
  const result = await appointmentsService.holdSlot(req.user.id, req.body);
  res.status(201).json({
    appointmentId: result.appointmentId,
    holdToken: result.holdToken,
    holdExpiresAt: result.holdExpiresAt.toISOString(),
    doctor: result.doctor,
    startsAt: result.startsAt.toISOString(),
    endsAt: result.endsAt.toISOString(),
  });
}

export async function confirm(req, res) {
  const result = await appointmentsService.confirmAppointment(req.user.id, req.params.id, req.body);
  res.json({ appointmentId: result.appointmentId, status: 'CONFIRMED' });
}
