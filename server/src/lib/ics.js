// Every booking confirmation email carries this attachment (brief §14) —
// it works in every calendar app with zero OAuth, and is the fallback for
// users who never connect Google Calendar. Same privacy rule as a synced
// Google event: no symptoms, no diagnosis, no prescription, ever.

function toIcsDate(date) {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function foldAndEscape(text) {
  return String(text).replace(/[\\;,]/g, (match) => `\\${match}`).replace(/\n/g, '\\n');
}

export function buildBookingIcs({ uid, startsAt, endsAt, doctorName, patientName, clinicAddress }) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//City Health Clinic//Curalis//EN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}@curalis`,
    `DTSTAMP:${toIcsDate(new Date())}`,
    `DTSTART:${toIcsDate(new Date(startsAt))}`,
    `DTEND:${toIcsDate(new Date(endsAt))}`,
    `SUMMARY:${foldAndEscape(`Consultation with ${doctorName}`)}`,
    `DESCRIPTION:${foldAndEscape(`Booked via City Health Clinic for ${patientName}.`)}`,
    clinicAddress ? `LOCATION:${foldAndEscape(clinicAddress)}` : null,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);

  // iCalendar requires CRLF line endings.
  return lines.join('\r\n');
}
