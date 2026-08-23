function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatMinutesOfDay(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

// Doses due today from the single ACTIVE prescription, derived from each
// item's [startDate, startDate + durationDays) window and timesOfDayMinutes
// — there's no per-dose "taken" tracking on the backend yet, so this is
// purely "what's scheduled," not "what's done."
export function todaysDoses(prescriptions, timezone) {
  const active = prescriptions.find((p) => p.status === 'ACTIVE');
  if (!active) return [];

  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
  const startStr = active.startDate.slice(0, 10);

  const doses = [];
  for (const item of active.items) {
    const endStr = addDays(startStr, item.durationDays - 1);
    if (todayStr < startStr || todayStr > endStr) continue;

    for (const minutes of item.timesOfDayMinutes) {
      doses.push({
        minutes,
        time: formatMinutesOfDay(minutes),
        name: item.drugName,
        dose: item.dose,
        instr: item.instructions,
      });
    }
  }
  return doses.sort((a, b) => a.minutes - b.minutes);
}
