import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getMe } from '../../api/auth.js';
import { listPrescriptions, updateReminderPreferences } from '../../api/prescriptions.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { Tag } from '../../components/ui/Tag.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { useToast } from '../../components/ui/Toast.jsx';

const FREQUENCY_LABEL = { OD: 'Once a day', BD: 'Twice a day', TDS: '3 times a day', QID: '4 times a day', HS: 'At bedtime', SOS: 'As needed' };

function formatMinutesOfDay(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function itemProgress(item, startStr, timezone) {
  const endStr = addDays(startStr, item.durationDays - 1);
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
  if (todayStr > endStr) return 'Course completed';
  if (todayStr < startStr) return 'Starts ' + new Date(`${startStr}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const dayNum = Math.round((Date.parse(todayStr) - Date.parse(startStr)) / 86_400_000) + 1;
  return `Day ${dayNum} of ${item.durationDays}`;
}

// Computed client-side from each item's scheduling window — there's no
// per-reminder GET on the backend, only the dispatch worker that actually
// sends them, so this is "what's scheduled," derived the same way the
// dashboard's today's-medication panel is.
function upcomingReminders(prescriptions, timezone, limit = 6) {
  const active = prescriptions.find((p) => p.status === 'ACTIVE');
  if (!active) return [];
  const startStr = active.startDate.slice(0, 10);
  const nowLocal = new Date();

  const reminders = [];
  for (const item of active.items) {
    const endStr = addDays(startStr, item.durationDays - 1);
    for (let d = startStr; d <= endStr; d = addDays(d, 1)) {
      for (const minutes of item.timesOfDayMinutes) {
        const [y, mo, da] = d.split('-').map(Number);
        const occursAt = new Date(Date.UTC(y, mo - 1, da, 0, minutes, 0));
        if (occursAt > nowLocal) {
          reminders.push({ name: item.drugName, dose: item.dose, at: occursAt, timeLabel: formatMinutesOfDay(minutes), dateStr: d });
        }
      }
    }
  }
  reminders.sort((a, b) => a.at - b.at);
  return reminders.slice(0, limit);
}

export function PrescriptionsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const timezone = user.timezone;

  const meQuery = useQuery({ queryKey: ['me'], queryFn: getMe });
  const prescriptionsQuery = useQuery({ queryKey: ['prescriptions'], queryFn: listPrescriptions });

  const [remindersOnOverride, setRemindersOnOverride] = useState(null);
  const remindersOn = remindersOnOverride ?? meQuery.data?.user.patientProfile?.medicationRemindersEnabled ?? true;

  const toggleMutation = useMutation({
    mutationFn: updateReminderPreferences,
    onError: (_err, enabled) => {
      setRemindersOnOverride(!enabled);
      toast("Couldn't update reminder preferences.");
    },
  });

  function toggleReminders() {
    const next = !remindersOn;
    setRemindersOnOverride(next);
    toggleMutation.mutate(next, { onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }) });
  }

  const prescriptions = prescriptionsQuery.data ?? [];
  const reminders = useMemo(() => (remindersOn ? upcomingReminders(prescriptions, timezone) : []), [prescriptions, remindersOn, timezone]);

  return (
    <div className="pg" style={{ maxWidth: 1180, margin: '0 auto', padding: 'clamp(28px,4vw,52px) clamp(16px,4vw,28px) 96px' }}>
      <h1 style={{ fontSize: 'clamp(34px,4.4vw,52px)', marginBottom: 6 }}>Your prescriptions</h1>
      <p style={{ opacity: 0.7, marginBottom: 'var(--space-8)' }}>Everything your doctors have prescribed, and when to take it.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 'var(--space-8)', alignItems: 'start' }}>
        <div>
          {prescriptions.length === 0 && !prescriptionsQuery.isLoading && <p style={{ opacity: 0.6 }}>You don't have any prescriptions yet.</p>}

          {prescriptions.map((p) => {
            const startStr = p.startDate.slice(0, 10);
            return (
              <div key={p.id} style={{ marginBottom: 'var(--space-8)' }}>
                <p style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.08em', opacity: 0.5, marginBottom: 'var(--space-2)' }}>
                  {p.status === 'ACTIVE' ? 'Current' : 'Past'}
                </p>
                <div className="card elev-sm" style={{ padding: 'clamp(20px,2.6vw,30px)', gap: 'var(--space-3)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <div>
                      <p style={{ fontFamily: 'var(--font-heading)', fontSize: 20, margin: 0 }}>{p.doctor.fullName}</p>
                      <p style={{ fontSize: 13, opacity: 0.7, margin: '2px 0 0' }}>
                        {p.doctor.specialisation} · Issued {new Date(p.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                    <Tag variant={p.status === 'ACTIVE' ? 'accent-2' : 'neutral'}>{p.status === 'ACTIVE' ? 'Active' : 'Superseded'}</Tag>
                  </div>
                  {p.items.map((item) => (
                    <div key={item.id} style={{ borderTop: '1px solid var(--color-divider)', paddingTop: 'var(--space-3)' }}>
                      <p style={{ fontFamily: 'var(--font-heading)', fontSize: 17, margin: 0 }}>
                        {item.drugName} · {item.dose}
                      </p>
                      <p style={{ fontSize: 14, margin: '3px 0 0' }}>
                        {FREQUENCY_LABEL[item.frequency] ?? item.frequency}
                        {item.timesOfDayMinutes.length > 0 && ` — ${item.timesOfDayMinutes.map(formatMinutesOfDay).join(', ')}`}
                      </p>
                      <p style={{ fontSize: 13, opacity: 0.7, margin: '2px 0 0' }}>
                        {item.durationDays} day{item.durationDays === 1 ? '' : 's'}
                        {item.instructions ? ` · ${item.instructions}` : ''}
                      </p>
                      <p style={{ fontSize: 13, color: 'var(--color-accent-2-700)', margin: '4px 0 0' }}>{itemProgress(item, startStr, timezone)}</p>
                    </div>
                  ))}
                  <Button as={Link} to={`/appointments/${p.appointmentId}`} variant="ghost" style={{ alignSelf: 'flex-start' }}>
                    View that visit
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div className="card" style={{ padding: 'var(--space-6)', gap: 'var(--space-2)' }}>
            <h4 style={{ margin: 0 }}>Medication reminders</h4>
            <p style={{ fontSize: 13, opacity: 0.75, margin: 0 }}>We'll email you when it's time to take each dose, based on your prescription.</p>
            <label className="radio" style={{ marginTop: 'var(--space-2)' }}>
              <input type="checkbox" checked={remindersOn} onChange={toggleReminders} />
              <span className="dot" />
              {remindersOn ? 'Reminders on' : 'Reminders off'}
            </label>
            <p style={{ fontSize: 12, opacity: 0.6, margin: 'var(--space-2) 0 0' }}>Reminders are sent in your time zone ({timezone}). Nothing is sent between 10:00 PM and 7:00 AM.</p>
          </div>

          <div className="card" style={{ padding: 'var(--space-6)', gap: 'var(--space-2)' }}>
            <h4 style={{ margin: 0 }}>Next reminders</h4>
            {remindersOn ? (
              reminders.length > 0 ? (
                <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
                  {reminders.map((r, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', fontSize: 13, borderBottom: '1px solid var(--color-divider)', paddingBottom: 6 }}>
                      <span>
                        {r.name} {r.dose}
                      </span>
                      <span style={{ opacity: 0.7, textAlign: 'right' }}>{r.timeLabel}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: 13, opacity: 0.7, margin: 0 }}>No upcoming reminders.</p>
              )
            ) : (
              <p style={{ fontSize: 13, opacity: 0.7, margin: 0 }}>Reminders are turned off. Turn them on above to see your schedule.</p>
            )}
          </div>

          <p
            style={{
              fontSize: 13,
              background: 'var(--color-accent-100)',
              color: 'var(--color-accent-800)',
              padding: 'var(--space-4) var(--space-6)',
              borderRadius: 'calc(var(--radius-lg) * 1.15)',
              margin: 0,
              textWrap: 'pretty',
            }}
          >
            Curalis reminds you what your doctor prescribed. It never changes a dose or a schedule. If something here doesn't match what you were told, contact your doctor.
          </p>
        </aside>
      </div>
    </div>
  );
}
