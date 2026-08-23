// Rendering only — the subject line lives on the outbox row itself
// (written at enqueue time), not here. Visual design and a full template
// engine are explicitly still open (brief §21); this is enough to
// exercise the outbox pipeline end-to-end.
const TEMPLATES = {
  booking_confirmation: (payload) => `
    <p>Hi ${payload.recipientName ?? ''},</p>
    <p>The appointment between ${payload.patientName} and ${payload.doctorName} is confirmed for
       <strong>${new Date(payload.startsAt).toUTCString()}</strong>.</p>
    <p>— City Health Clinic</p>
  `,
  appointment_cancellation: (payload) => `
    <p>Hi ${payload.recipientName ?? ''},</p>
    <p>The appointment between ${payload.patientName} and ${payload.doctorName} scheduled for
       <strong>${new Date(payload.startsAt).toUTCString()}</strong> has been cancelled.</p>
    <p>— City Health Clinic</p>
  `,
  appointment_reschedule: (payload) => `
    <p>Hi ${payload.recipientName ?? ''},</p>
    <p>The appointment between ${payload.patientName} and ${payload.doctorName} has been moved to
       <strong>${new Date(payload.startsAt).toUTCString()}</strong>.</p>
    <p>— City Health Clinic</p>
  `,
};

export function renderTemplate(templateKey, payload) {
  const render = TEMPLATES[templateKey];
  if (!render) throw new Error(`Unknown email template: ${templateKey}`);
  return render(payload);
}
