// Minutes from local midnight, in the PATIENT's timezone (brief §12).
// Persisted to prescription_item.times_of_day_minutes at save time, so a
// later change here never retroactively shifts an already-issued course.
export const FREQUENCY_TIMES = {
  OD: [540], // 09:00
  BD: [540, 1260], // 09:00, 21:00
  TDS: [480, 840, 1200], // 08:00, 14:00, 20:00
  QID: [480, 720, 960, 1200], // 08:00, 12:00, 16:00, 20:00
  HS: [1320], // 22:00
  SOS: [], // as needed — no scheduled reminders
};
