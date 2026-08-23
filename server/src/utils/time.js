// Pure calendar/timezone helpers — no DB, no business rules. Reused
// wherever "local wall-clock in some IANA zone" needs to become or come
// from a real UTC instant (availability, leave, medication reminders,
// calendar sync).

export function isValidTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

// "What calendar date is it right now, as experienced in this timezone?"
// en-CA formats as YYYY-MM-DD directly — a standard trick, no manual
// string surgery.
export function todayDateStringInZone(timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

// Pure calendar-label arithmetic on a YYYY-MM-DD string — deliberately
// anchored in UTC as a neutral sandbox for date math, not because the
// result represents any real-world instant. setUTCDate() normalises
// month/year rollovers correctly.
export function addDaysToDateString(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// The day-of-week of a calendar date does not depend on timezone — Sept 1
// 2026 is a Tuesday everywhere. Parsed as UTC purely as a neutral sandbox.
export function dayOfWeekOfDateString(dateString) {
  return new Date(`${dateString}T00:00:00Z`).getUTCDay();
}

export function minutesToTimeString(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
  const minutes = (totalMinutes % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}:00`;
}
