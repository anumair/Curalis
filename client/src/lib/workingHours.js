const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Compact label for a list of dayOfWeek numbers, e.g. [1,2,3,4,5] -> "Mon–Fri".
export function summarizeWorkingDaysShort(workingDays) {
  if (workingDays.length === 0) return 'No working days set';
  if (workingDays.length === 7) return 'Every day';
  const sorted = [...workingDays].sort((a, b) => a - b);
  const isContiguous = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  if (isContiguous && sorted.length > 1) {
    return `${DAY_SHORT[sorted[0]]}–${DAY_SHORT[sorted[sorted.length - 1]]}`;
  }
  return sorted.map((d) => DAY_SHORT[d]).join(', ');
}

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
