const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatMinutes(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

// One line per day that has shifts, e.g. "Monday: 9:00 AM–1:00 PM, 3:00 PM–6:00 PM".
export function summarizeWorkingHours(workingHours) {
  const byDay = new Map();
  for (const shift of workingHours) {
    const list = byDay.get(shift.dayOfWeek) ?? [];
    list.push(shift);
    byDay.set(shift.dayOfWeek, list);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a - b)
    .map(([dayOfWeek, shifts]) => {
      const ranges = shifts
        .sort((a, b) => a.startMinute - b.startMinute)
        .map((s) => `${formatMinutes(s.startMinute)}–${formatMinutes(s.endMinute)}`)
        .join(', ');
      return `${DAY_NAMES[dayOfWeek]}: ${ranges}`;
    });
}
