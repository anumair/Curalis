import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext.jsx';
import { listDoctorsAdmin, listFailedNotifications } from '../../api/admin.js';
import { summarizeWorkingDaysShort } from '../../lib/workingHours.js';
import { formatLongDate } from '../../lib/format.js';
import { Tag } from '../../components/ui/Tag.jsx';
import { Button } from '../../components/ui/Button.jsx';

function doctorStatus(doctor) {
  if (!doctor.isActive) return { label: 'Deactivated', variant: 'neutral' };
  if (doctor.onLeaveToday) return { label: 'On leave today', variant: 'accent' };
  if (!doctor.isAcceptingPatients) return { label: 'Not accepting', variant: 'neutral' };
  return { label: 'Accepting appointments', variant: 'accent-2' };
}

export function AdminDashboardPage() {
  const { user } = useAuth();
  const timezone = user.timezone;

  const doctorsQuery = useQuery({ queryKey: ['admin-doctors'], queryFn: listDoctorsAdmin });
  const failedQuery = useQuery({ queryKey: ['admin-notifications-failed', 1], queryFn: () => listFailedNotifications(1) });

  const doctors = doctorsQuery.data ?? [];
  const failedTotal = failedQuery.data?.total ?? 0;

  const stats = [
    { n: doctors.length, label: 'Doctors', color: 'var(--color-text)' },
    { n: doctors.filter((d) => d.isAcceptingPatients).length, label: 'Accepting appointments', color: 'var(--color-accent-2-700)' },
    { n: doctors.filter((d) => d.onLeaveToday).length, label: 'On leave today', color: 'var(--color-accent-700)' },
    { n: doctors.reduce((sum, d) => sum + d.appointmentsNext7Days, 0), label: 'Appointments, next 7 days', color: 'var(--color-text)' },
    { n: failedTotal, label: 'Failed notifications', color: failedTotal > 0 ? 'var(--color-accent-700)' : 'var(--color-text)' },
  ];

  const clinicToday = doctors.filter((d) => d.today.count > 0);

  return (
    <div className="pg" style={{ maxWidth: 1180, margin: '0 auto', padding: 'clamp(28px,4vw,52px) clamp(16px,4vw,28px) 96px' }}>
      <h1 style={{ fontSize: 'clamp(34px,4.4vw,52px)', marginBottom: 6 }}>Clinic administration</h1>
      <p style={{ opacity: 0.7, marginBottom: 'var(--space-6)' }}>{formatLongDate(new Date(), timezone)}</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-8)' }}>
        {stats.map((st) => (
          <div key={st.label} className="card" style={{ padding: 'var(--space-4) var(--space-6)', gap: 0 }}>
            <p style={{ fontFamily: 'var(--font-heading)', fontSize: 32, lineHeight: 1, margin: 0, color: st.color }}>{st.n}</p>
            <p style={{ fontSize: 12, opacity: 0.7, margin: '6px 0 0' }}>{st.label}</p>
          </div>
        ))}
      </div>

      {failedTotal > 0 && (
        <>
          <h3 style={{ marginBottom: 'var(--space-3)' }}>Needs attention</h3>
          <div style={{ display: 'grid', gap: 'var(--space-2)', marginBottom: 'var(--space-8)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap', background: 'var(--color-accent-100)', borderRadius: 'calc(var(--radius-lg) * 1.15)', padding: 'var(--space-3) var(--space-6)' }}>
              <p style={{ flex: 1, minWidth: 240, margin: 0, fontSize: 14, color: 'var(--color-accent-800)', textWrap: 'pretty' }}>
                {failedTotal} notification{failedTotal === 1 ? '' : 's'} failed to send and exhausted their retries.
              </p>
              <Button as={Link} to="/admin/notifications">
                Review
              </Button>
            </div>
          </div>
        </>
      )}

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
        <h3 style={{ margin: 0, flex: 1 }}>Doctors</h3>
        <Button as={Link} to="/admin/doctors/new">
          Add a doctor
        </Button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="table" style={{ minWidth: 760 }}>
          <thead>
            <tr>
              <th>Doctor</th>
              <th>Consulting days</th>
              <th>Next 7 days</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {doctors.map((d) => {
              const status = doctorStatus(d);
              return (
                <tr key={d.id}>
                  <td>
                    <span style={{ display: 'block', fontWeight: 700 }}>{d.fullName}</span>
                    <span style={{ display: 'block', fontSize: 12, opacity: 0.65 }}>
                      {d.specialisation} · {d.qualification}
                    </span>
                    <span style={{ display: 'block', fontSize: 12, opacity: 0.65 }}>{d.slotDurationMin} min consultations</span>
                  </td>
                  <td style={{ fontSize: 13 }}>{summarizeWorkingDaysShort(d.workingDays)}</td>
                  <td>{d.appointmentsNext7Days}</td>
                  <td>
                    <Tag variant={status.variant}>{status.label}</Tag>
                  </td>
                  <td>
                    <Button as={Link} to={`/admin/doctors/${d.id}`} variant="secondary">
                      Manage
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h3 style={{ margin: 'var(--space-8) 0 var(--space-3)' }}>Today across the clinic</h3>
      {clinicToday.length === 0 && <p style={{ opacity: 0.65 }}>No appointments booked for today.</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 'var(--space-3)' }}>
        {clinicToday.map((d) => (
          <div key={d.id} className="card" style={{ padding: 'var(--space-4) var(--space-6)', gap: 2 }}>
            <p style={{ fontFamily: 'var(--font-heading)', fontSize: 17, margin: 0 }}>{d.fullName}</p>
            <p style={{ fontSize: 13, opacity: 0.75, margin: 0 }}>
              {d.today.count} appointment{d.today.count === 1 ? '' : 's'}
            </p>
            <p style={{ fontSize: 13, opacity: 0.6, margin: 0 }}>
              {new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: timezone }).format(new Date(d.today.first))} –{' '}
              {new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: timezone }).format(new Date(d.today.last))}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
