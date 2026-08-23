// A curated list covering major regions, not the full IANA database — good
// enough for a picker where most users just confirm the auto-detected
// value. The detected zone is always included even if not in this list.
const COMMON_TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Australia/Sydney',
  'Pacific/Auckland',
  'UTC',
];

export function detectTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'Asia/Kolkata';
  }
}

export function timezoneOptions() {
  const detected = detectTimezone();
  return detected && !COMMON_TIMEZONES.includes(detected) ? [detected, ...COMMON_TIMEZONES] : COMMON_TIMEZONES;
}
