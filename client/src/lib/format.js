export function formatLongDate(date, timezone) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: timezone }).format(date);
}

export function formatTimeRange(startsAt, endsAt, timezone) {
  const timeFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: timezone });
  const tzAbbr = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short', timeZone: timezone })
    .formatToParts(startsAt)
    .find((part) => part.type === 'timeZoneName')?.value;
  return `${timeFmt.format(startsAt)} – ${timeFmt.format(endsAt)} · ${timezone}${tzAbbr ? ` (${tzAbbr})` : ''}`;
}

// "In 3 days" / "Tomorrow" / "2 days ago" — compares calendar dates in the
// given timezone, not raw elapsed hours, so an appointment at 11pm tonight
// still reads as "Today" rather than flipping to "Tomorrow" on a slow clock.
export function formatRelativeDay(date, timezone) {
  const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(date);
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
  const diffDays = Math.round((Date.parse(dateStr) - Date.parse(todayStr)) / 86_400_000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  return diffDays > 1 ? `In ${diffDays} days` : `${Math.abs(diffDays)} days ago`;
}
