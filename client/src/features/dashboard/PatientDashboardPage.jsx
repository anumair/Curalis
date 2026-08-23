import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext.jsx';
import { listAppointments } from '../../api/appointments.js';
import { listPrescriptions } from '../../api/prescriptions.js';
import { getCalendarStatus } from '../../api/calendar.js';
import { formatLongDate, formatTimeRange, formatRelativeDay } from '../../lib/format.js';
import { todaysDoses } from '../../lib/medication.js';
import { Card } from '../../components/ui/Card.jsx';
import { Tag } from '../../components/ui/Tag.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { SegmentedControl } from '../../components/ui/SegmentedControl.jsx';

const FILTERS = ['All', 'Upcoming', 'Completed', 'Cancelled'];

function AppointmentRow({ appointment, timezone, tone }) {
  const startsAt = new Date(appointment.startsAt);
  return (
    <Card
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 'var(--space-4)',
        flexWrap: 'wrap',
        marginBottom: 'var(--space-2)',
        padding: 'var(--space-4) var(--space-6)',
        ...(tone === 'past' ? { background: 'transparent', border: '1px solid var(--color-divider)' } : {}),
      }}
    >
      <div style={{ flex: 1, minWidth: 180 }}>
        <p style={{ fontFamily: 'var(--font-heading)', fontSize: 17, margin: 0 }}>{appointment.doctor.fullName}</p>
        <p style={{ fontSize: 13, opacity: 0.7, margin: '2px 0 0' }}>{appointment.doctor.specialisation}</p>
      </div>
      <div style={{ minWidth: 170 }}>
        <p style={{ fontSize: 14, margin: 0 }}>{formatLongDate(startsAt, timezone)}</p>
        <p style={{ fontSize: 13, opacity: 0.7, margin: '2px 0 0' }}>{formatTimeRange(startsAt, new Date(appointment.endsAt), timezone)}</p>
      </div>
      <Tag variant={tone === 'past' ? 'neutral' : 'accent-2'}>{appointment.status.replaceAll('_', ' ')}</Tag>
      <Button as={Link} to={`/appointments/${appointment.id}`} variant="ghost">
        View details
      </Button>
    </Card>
  );
}

export function PatientDashboardPage() {
  const { user } = useAuth();
  const firstName = user.fullName.split(' ')[0];
  const timezone = user.timezone;
  const [filter, setFilter] = useState('All');

  const upcomingQuery = useQuery({ queryKey: ['appointments', 'upcoming'], queryFn: () => listAppointments('upcoming') });
  const pastQuery = useQuery({ queryKey: ['appointments', 'past'], queryFn: () => listAppointments('past') });
  const prescriptionsQuery = useQuery({ queryKey: ['prescriptions'], queryFn: listPrescriptions });
  const calendarQuery = useQuery({ queryKey: ['calendar-status'], queryFn: getCalendarStatus });

  const upcoming = upcomingQuery.data ?? [];
  const past = pastQuery.data ?? [];
  const completed = past.filter((a) => a.status === 'COMPLETED');
  const cancelled = past.filter((a) => a.status.startsWith('CANCELLED_'));
  const nextAppointment = upcoming[0];
  const doses = prescriptionsQuery.data ? todaysDoses(prescriptionsQuery.data, timezone) : [];

  const showUpcoming = filter === 'All' || filter === 'Upcoming';
  const showCompleted = filter === 'All' || filter === 'Completed';
  const showCancelled = filter === 'All' || filter === 'Cancelled';
  const nothingToShow =
    (!showUpcoming || upcoming.length === 0) && (!showCompleted || completed.length === 0) && (!showCancelled || cancelled.length === 0);

  return (
    <div className="pg" style={{ maxWidth: 1180, margin: '0 auto', padding: 'clamp(28px,4vw,52px) clamp(16px,4vw,28px) 96px' }}>
      <h1 style={{ fontSize: 'clamp(34px,4.4vw,52px)', marginBottom: 6 }}>Hello, {firstName}</h1>
      <p style={{ opacity: 0.7, marginBottom: 'var(--space-8)' }}>Here's where things stand.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 'var(--space-6)', alignItems: 'start' }}>
        <div>
          <h6 style={{ opacity: 0.6, marginBottom: 'var(--space-3)' }}>Your next appointment</h6>
          {nextAppointment ? (
            <Card
              elevation="md"
              style={{ padding: 'clamp(20px,3vw,32px)', background: 'var(--color-accent-2-700)', color: 'var(--color-accent-2-100)', gap: 'var(--space-3)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-4)', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div>
                  <p style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(22px,2.6vw,30px)', lineHeight: 1.15, margin: 0 }}>{nextAppointment.doctor.fullName}</p>
                  <p style={{ margin: '4px 0 0', opacity: 0.8, fontSize: 14 }}>{nextAppointment.doctor.specialisation}</p>
                </div>
                <span className="tag" style={{ background: 'var(--color-accent-400)', color: 'var(--color-accent-900)' }}>
                  {formatRelativeDay(new Date(nextAppointment.startsAt), timezone)}
                </span>
              </div>
              <p style={{ fontSize: 17, margin: 'var(--space-2) 0 0' }}>{formatLongDate(new Date(nextAppointment.startsAt), timezone)}</p>
              <p style={{ fontSize: 15, opacity: 0.85, margin: 0 }}>{formatTimeRange(new Date(nextAppointment.startsAt), new Date(nextAppointment.endsAt), timezone)}</p>
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginTop: 'var(--space-3)' }}>
                <Button as={Link} to={`/appointments/${nextAppointment.id}`} style={{ background: 'var(--color-accent-2-100)', color: 'var(--color-accent-2-900)' }}>
                  View details
                </Button>
              </div>
            </Card>
          ) : (
            <Card style={{ padding: 'var(--space-6)' }}>
              <p style={{ margin: 0, opacity: 0.75 }}>You don't have an upcoming appointment.</p>
              <Button as={Link} to="/doctors" variant="secondary" style={{ marginTop: 'var(--space-3)', alignSelf: 'flex-start' }}>
                Find a doctor
              </Button>
            </Card>
          )}

          <h6 style={{ opacity: 0.6, margin: 'var(--space-8) 0 var(--space-3)' }}>Your appointments</h6>
          <SegmentedControl options={FILTERS} value={filter} onChange={setFilter} name="apptfilter" style={{ marginBottom: 'var(--space-4)' }} />

          {showUpcoming && upcoming.length > 0 && (
            <>
              {filter === 'All' && <p style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.08em', opacity: 0.5, marginBottom: 'var(--space-2)' }}>Upcoming</p>}
              {upcoming.map((appointment) => (
                <AppointmentRow key={appointment.id} appointment={appointment} timezone={timezone} tone="upcoming" />
              ))}
            </>
          )}

          {showCompleted && completed.length > 0 && (
            <>
              {filter === 'All' && <p style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.08em', opacity: 0.5, margin: 'var(--space-6) 0 var(--space-2)' }}>Completed</p>}
              {completed.map((appointment) => (
                <AppointmentRow key={appointment.id} appointment={appointment} timezone={timezone} tone="past" />
              ))}
            </>
          )}

          {showCancelled && cancelled.length > 0 && (
            <>
              {filter === 'All' && <p style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.08em', opacity: 0.5, margin: 'var(--space-6) 0 var(--space-2)' }}>Cancelled</p>}
              {cancelled.map((appointment) => (
                <AppointmentRow key={appointment.id} appointment={appointment} timezone={timezone} tone="past" />
              ))}
            </>
          )}

          {nothingToShow && (
            <p style={{ opacity: 0.6, fontSize: 14 }}>
              {filter === 'All' ? 'Your appointments will appear here.' : `No ${filter.toLowerCase()} appointments.`}
            </p>
          )}
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <div>
            <h6 style={{ opacity: 0.6, marginBottom: 'var(--space-3)' }}>Today's medication</h6>
            <Card style={{ padding: 'var(--space-6)', gap: 'var(--space-3)' }}>
              {doses.length > 0 ? (
                doses.map((dose, i) => (
                  <div key={i} style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'baseline', borderBottom: '1px solid var(--color-divider)', paddingBottom: 'var(--space-2)' }}>
                    <span style={{ fontFamily: 'var(--font-heading)', fontSize: 15, minWidth: 72 }}>{dose.time}</span>
                    <span style={{ flex: 1 }}>
                      <span style={{ display: 'block', fontSize: 14 }}>
                        {dose.name} · {dose.dose}
                      </span>
                      {dose.instr && <span style={{ display: 'block', fontSize: 12, opacity: 0.65 }}>{dose.instr}</span>}
                    </span>
                  </div>
                ))
              ) : (
                <p style={{ margin: 0, fontSize: 14, opacity: 0.65 }}>Nothing scheduled for today.</p>
              )}
              <Button as={Link} to="/prescriptions" variant="secondary">
                View all prescriptions
              </Button>
            </Card>
          </div>

          <div>
            <h6 style={{ opacity: 0.6, marginBottom: 'var(--space-3)' }}>Quick actions</h6>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <Button as={Link} to="/doctors" variant="secondary" block style={{ margin: 0, justifyContent: 'flex-start', padding: '12px 20px' }}>
                Find a doctor
              </Button>
              <Button as={Link} to="/prescriptions" variant="secondary" block style={{ margin: 0, justifyContent: 'flex-start', padding: '12px 20px' }}>
                View prescriptions
              </Button>
              <Button as={Link} to="/settings" variant="secondary" block style={{ margin: 0, justifyContent: 'flex-start', padding: '12px 20px' }}>
                Account settings
              </Button>
            </div>
          </div>

          {!calendarQuery.data?.connected && (
            <div style={{ background: 'var(--color-accent-100)', borderRadius: 'calc(var(--radius-lg) * 1.15)', padding: 'var(--space-6)' }}>
              <p style={{ fontSize: 13, color: 'var(--color-accent-800)', margin: '0 0 var(--space-3)', textWrap: 'pretty' }}>
                Connect your Google Calendar in Settings and your appointments will sync automatically — including changes and cancellations.
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
