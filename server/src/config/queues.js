// Central registry of pg-boss queue names (brief §18). Producers and
// consumers both import from here so a typo can't silently create two
// different queues.
export const QUEUES = {
  HOLD_SWEEPER: 'hold.sweeper',
  NOTIFICATION_DISPATCH: 'notification.dispatch',
  AI_PREVISIT: 'ai.previsit',
  AI_POSTVISIT: 'ai.postvisit',
  AI_RETRY: 'ai.retry',
  CALENDAR_SYNC: 'calendar.sync',
  CALENDAR_RETRY: 'calendar.retry',
  APPT_REMINDER: 'appt.reminder',
  MEDICATION_DISPATCH: 'medication.dispatch',
};
