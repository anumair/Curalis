import { prisma } from '../../lib/prisma.js';
import { boss } from '../../lib/boss.js';
import { QUEUES } from '../../config/queues.js';
import { ApiError } from '../../utils/errors.js';
import { getPostVisitSummary as readPostVisitSummary } from '../ai/ai.service.js';

export async function submitVisitNote(doctorId, appointmentId, data) {
  const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appointment) throw new ApiError(404, 'NOT_FOUND', 'Appointment not found.');
  if (appointment.doctorId !== doctorId) {
    throw new ApiError(403, 'FORBIDDEN', 'This appointment does not belong to you.');
  }
  if (appointment.status !== 'CONFIRMED') {
    throw new ApiError(409, 'APPOINTMENT_NOT_CONFIRMED', 'Only a confirmed appointment can be completed with a visit note.');
  }

  await prisma.$transaction(async (tx) => {
    await tx.visitNote.create({
      data: {
        appointmentId,
        clinicalNotes: data.clinicalNotes,
        diagnosis: data.diagnosis,
        followUpDate: data.followUpDate ? new Date(data.followUpDate) : undefined,
        followUpNotes: data.followUpNotes,
      },
    });
    await tx.appointment.update({ where: { id: appointmentId }, data: { status: 'COMPLETED' } });
    await tx.aiSummary.create({ data: { appointmentId, type: 'POST_VISIT', status: 'PENDING' } });
  });

  // Enqueued after commit — matches the same "durable rows first, enqueue
  // after" pattern as booking confirmation (brief §7.2).
  await boss.send(QUEUES.AI_POSTVISIT, { appointmentId });
}

export async function getPostVisitSummary(patientId, appointmentId) {
  return readPostVisitSummary(patientId, appointmentId);
}
