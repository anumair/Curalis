import * as availabilityService from './availability.service.js';

export async function getAvailability(req, res) {
  const slots = await availabilityService.getAvailability(req.params.doctorId, req.query.date);
  res.json(slots.map((slot) => ({ startsAt: slot.startsAt.toISOString(), endsAt: slot.endsAt.toISOString() })));
}
