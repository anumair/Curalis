import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext.jsx';
import { getMySchedule, getMyAwaitingNotes, getMyWorkingHours } from '../../api/doctorSchedule.js';
import { getCalendarStatus } from '../../api/calendar.js';
import { summarizeWorkingHours } from '../../lib/workingHours.js';
import { formatLongDate } from '../../lib/format.js';
import { Tag } from '../../components/ui/Tag.jsx';
import { Button } from '../../components/ui/Button.jsx';

const URGENCY_VARIANT = { HIGH: 'accent', MEDIUM: 'accent-2', LOW: 'neutral' };
const URGENCY_BORDER = { HIGH: 'var(--color-accent-600)', MEDIUM: 'var(--color-accent-2-500)', LOW: 'var(--color-divider)' };

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function DoctorDashboardPage() {
  const { user } = useAuth();
  const timezone = user.timezone;
  const [date, setDate] = useState(() => new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date()));

  const scheduleQuery = useQuery({ queryKey: ['doctor-schedule', date], queryFn: () => getMySchedule(date) });
  const awaitingQuery = useQuery({ queryKey: ['doctor-awaiting-notes'], queryFn: getMyAwaitingNotes });
  const hoursQuery = useQuery({ queryKey: ['doctor-working-hours'], queryFn: getMyWorkingHours });
  const calendarQuery = useQuery({ queryKey: ['calendar-status'], queryFn: getCalendarStatus });

  const schedule = scheduleQuery.data ?? [];
  const awaiting = awaitingQuery.data ?? [];
  const hoursSummary = useMemo(() => (hoursQuery.data ? summarizeWorkingHours(hoursQuery.data.workingHours) : []), [hoursQuery.data]);

  const stats = [
    { n: schedule.length, label: "Today's appointments", color: 'var(--color-accent-700)' },
    { n: awaiting.length, label: 'Awaiting your notes', color: 'var(--color-accent-2-700)' },
  ];

  return (
    <div className="pg" style={{ maxWidth: 1180, margin: '0 auto', padding: 'clamp(28px,4vw,52px) clamp(16px,4vw,28px) 96px' }}>
      <h1 style={{ fontSize: 'clamp(34px,4.4vw,52px)', marginBottom: 6 }}>
        {greeting()}, {user.fullName}
      </h1>
      <p style={{ opacity: 0.7, marginBottom: 'var(--space-6)' }}>{formatLongDate(new Date(`${date}T12:00:00Z`), timezone)}</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-8)' }}>
        {stats.map((st) => (
          <div key={st.label} className="card" style={{ padding: 'var(--space-4) var(--space-6)', gap: 0 }}>
            <p style={{ fontFamily: 'var(--font-heading)', fontSize: 36, lineHeight: 1, margin: 0, color: st.color }}>{st.n}</p>
            <p style={{ fontSize: 13, opacity: 0.7, margin: '6px 0 0' }}>{st.label}</p>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 'var(--space-8)', alignItems: 'start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
            <h3 style={{ margin: 0, flex: 1 }}>Today's schedule</h3>
            <button type="button" className="btn btn-secondary btn-icon" onClick={() => setDate((d) => addDays(d, -1))}>
              ‹
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setDate(new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date()))}
            >
              Today
            </button>
            <button type="button" className="btn btn-secondary btn-icon" onClick={() => setDate((d) => addDays(d, 1))}>
              ›
            </button>
          </div>
          <p style={{ fontSize: 12, opacity: 0.6, marginBottom: 'var(--space-4)' }}>All times shown in {timezone}.</p>

          {schedule.map((a) => (
            <div
              key={a.id}
              className="card"
              style={{
                flexDirection: 'row',
                gap: 'var(--space-4)',
                flexWrap: 'wrap',
                alignItems: 'flex-start',
                marginBottom: 'var(--space-2)',
                padding: 'var(--space-4) var(--space-6)',
                borderLeft: `4px solid ${URGENCY_BORDER[a.urgency] ?? 'var(--color-divider)'}`,
              }}
            >
              <div style={{ minWidth: 110 }}>
                <p style={{ fontFamily: 'var(--font-heading)', fontSize: 17, margin: 0 }}>
                  {new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: timezone }).format(new Date(a.startsAt))}
                </p>
                <p style={{ fontSize: 12, opacity: 0.6, margin: '2px 0 0' }}>
                  {new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: timezone }).format(new Date(a.endsAt))}
                </p>
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <p style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{a.patient.fullName}</p>
                {(a.patient.age || a.patient.gender) && (
                  <p style={{ fontSize: 12, opacity: 0.65, margin: '2px 0 0' }}>
                    {[a.patient.age && `${a.patient.age}`, a.patient.gender].filter(Boolean).join(', ')}
                  </p>
                )}
                {a.complaint && <p style={{ fontSize: 14, margin: '6px 0 0', textWrap: 'pretty' }}>{a.complaint}</p>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                {a.urgency && <Tag variant={URGENCY_VARIANT[a.urgency] ?? 'neutral'}>{a.urgency}</Tag>}
                <span style={{ fontSize: 12, opacity: 0.6 }}>{a.status === 'COMPLETED' ? 'Notes added' : 'Confirmed'}</span>
                <Button as={Link} to={`/doctor/consultations/${a.id}`}>
                  Open
                </Button>
              </div>
            </div>
          ))}
          {!scheduleQuery.isLoading && schedule.length === 0 && <p style={{ opacity: 0.65 }}>No appointments scheduled for this day.</p>}
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div className="card" style={{ padding: 'var(--space-6)', gap: 'var(--space-3)' }}>
            <h4 style={{ margin: 0 }}>Awaiting your notes</h4>
            {awaiting.length === 0 && <p style={{ fontSize: 13, opacity: 0.6, margin: 0 }}>Nothing waiting on you right now.</p>}
            {awaiting.map((n) => (
              <div key={n.id} style={{ borderTop: '1px solid var(--color-divider)', paddingTop: 'var(--space-2)' }}>
                <p style={{ fontSize: 15, margin: 0 }}>{n.patient.fullName}</p>
                <p style={{ fontSize: 12, opacity: 0.65, margin: '2px 0 0' }}>{formatLongDate(new Date(n.startsAt), timezone)}</p>
                <Button as={Link} to={`/doctor/consultations/${n.id}`} variant="ghost" style={{ paddingLeft: 0 }}>
                  Add notes
                </Button>
              </div>
            ))}
          </div>

          <div className="card" style={{ padding: 'var(--space-6)', gap: 6 }}>
            <h4 style={{ margin: '0 0 var(--space-2)' }}>Your schedule</h4>
            {hoursSummary.length === 0 && <p style={{ fontSize: 13, opacity: 0.75, margin: 0 }}>No working hours set yet.</p>}
            {hoursSummary.map((line) => (
              <p key={line} style={{ fontSize: 13, margin: 0 }}>
                {line}
              </p>
            ))}
            {hoursQuery.data?.leaves.length > 0 && (
              <p style={{ fontSize: 13, opacity: 0.75, margin: 'var(--space-2) 0 0' }}>
                Leave: {hoursQuery.data.leaves.map((l) => formatLongDate(new Date(l.startsAt), timezone)).join(', ')}
              </p>
            )}
            <p style={{ fontSize: 12, opacity: 0.6, margin: 'var(--space-2) 0 0' }}>Your working hours and leave are managed by your clinic administrator.</p>
          </div>

          {!calendarQuery.data?.connected && (
            <div style={{ background: 'var(--color-accent-100)', borderRadius: 'calc(var(--radius-lg) * 1.15)', padding: 'var(--space-6)' }}>
              <p style={{ fontSize: 13, color: 'var(--color-accent-800)', margin: '0 0 var(--space-3)', textWrap: 'pretty' }}>
                Connect your Google Calendar in Settings to see your consultations alongside the rest of your day.
              </p>
              <Button as={Link} to="/settings">
                Open Settings
              </Button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
