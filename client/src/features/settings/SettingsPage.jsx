import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext.jsx';
import { getMe, updateMe, changePassword } from '../../api/auth.js';
import { updateReminderPreferences } from '../../api/prescriptions.js';
import { getCalendarStatus, getConnectUrl, disconnectCalendar } from '../../api/calendar.js';
import { getDoctor } from '../../api/doctors.js';
import { getMyWorkingHours } from '../../api/doctorSchedule.js';
import { summarizeWorkingHours } from '../../lib/workingHours.js';
import { timezoneOptions } from '../../lib/timezones.js';
import { Field, Input, Select } from '../../components/ui/Field.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { useToast } from '../../components/ui/Toast.jsx';

const ROLE_LABEL = { PATIENT: 'Patient', DOCTOR: 'Doctor', ADMIN: 'Clinic administrator' };

const EMAIL_LIST_BY_ROLE = {
  PATIENT: [
    'Booking confirmations, reschedules, and cancellations',
    'Appointment reminders, 24 hours and 1 hour before',
    'Medication reminders, if turned on below',
    'Your visit summary, once your doctor completes their notes',
  ],
  DOCTOR: ['Booking confirmations, reschedules, and cancellations for your appointments', 'Notices when a patient is affected by leave you take'],
  ADMIN: ['Curalis does not currently send email notifications to administrator accounts.'],
};

export function SettingsPage() {
  const { user, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [fullName, setFullName] = useState(user.fullName);
  const [phone, setPhone] = useState(user.phone ?? '');
  const [timezone, setTimezone] = useState(user.timezone);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const meQuery = useQuery({ queryKey: ['me'], queryFn: getMe });
  const calendarQuery = useQuery({ queryKey: ['calendar-status'], queryFn: getCalendarStatus, enabled: user.role !== 'ADMIN' });
  const doctorProfileQuery = useQuery({ queryKey: ['doctor', user.id], queryFn: () => getDoctor(user.id), enabled: user.role === 'DOCTOR' });
  const doctorHoursQuery = useQuery({ queryKey: ['doctor-working-hours'], queryFn: getMyWorkingHours, enabled: user.role === 'DOCTOR' });

  const calendarParam = searchParams.get('calendar');
  useEffect(() => {
    if (!calendarParam) return;
    const messages = {
      connected: 'Google Calendar connected.',
      denied: 'Google Calendar connection was cancelled.',
      invalid_state: "Couldn't verify that request. Please try connecting again.",
      no_refresh_token: "Google didn't grant lasting access. Please try connecting again.",
      error: 'Something went wrong connecting Google Calendar.',
    };
    toast(messages[calendarParam] ?? 'Calendar updated.');
    queryClient.invalidateQueries({ queryKey: ['calendar-status'] });
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarParam]);

  const saveMutation = useMutation({
    mutationFn: () => updateMe({ fullName, phone: phone || undefined, timezone }),
    onSuccess: async () => {
      await refreshUser();
      toast('Changes saved.');
    },
    onError: () => toast("Couldn't save your changes."),
  });

  const [remindersOnOverride, setRemindersOnOverride] = useState(null);
  const remindersOn = remindersOnOverride ?? meQuery.data?.user.patientProfile?.medicationRemindersEnabled ?? true;
  const reminderMutation = useMutation({
    mutationFn: updateReminderPreferences,
    onError: (_err, enabled) => {
      setRemindersOnOverride(!enabled);
      toast("Couldn't update reminder preferences.");
    },
  });
  function toggleReminders() {
    const next = !remindersOn;
    setRemindersOnOverride(next);
    reminderMutation.mutate(next, { onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }) });
  }

  const connectMutation = useMutation({
    mutationFn: getConnectUrl,
    onSuccess: (authUrl) => {
      window.location.href = authUrl;
    },
    onError: () => toast("Couldn't start the Google Calendar connection."),
  });
  const disconnectMutation = useMutation({
    mutationFn: disconnectCalendar,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-status'] });
      toast('Google Calendar disconnected.');
    },
  });

  const [passwordError, setPasswordError] = useState('');
  const passwordMutation = useMutation({
    mutationFn: () => changePassword(currentPassword, newPassword),
    onSuccess: () => {
      toast('Password updated. Please sign in again.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      logout().then(() => navigate('/sign-in'));
    },
    onError: (err) => {
      setPasswordError(err.response?.status === 401 ? 'Current password is incorrect.' : 'Something went wrong. Please try again.');
    },
  });
  function onUpdatePassword() {
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords don't match.");
      return;
    }
    setPasswordError('');
    passwordMutation.mutate();
  }

  async function handleSignOut() {
    await logout();
    navigate('/');
  }

  const calendar = calendarQuery.data;
  const doctorHoursSummary = doctorHoursQuery.data ? summarizeWorkingHours(doctorHoursQuery.data.workingHours) : [];

  return (
    <div className="pg" style={{ maxWidth: 1180, margin: '0 auto', padding: 'clamp(28px,4vw,52px) clamp(16px,4vw,28px) 96px' }}>
      <h1 style={{ fontSize: 'clamp(34px,4.4vw,52px)', marginBottom: 'var(--space-8)' }}>Account settings</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 'var(--space-8)', alignItems: 'start' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 'var(--space-8)', minWidth: 0 }}>
          <section>
            <h3 style={{ marginBottom: 'var(--space-4)' }}>Your details</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 'var(--space-3)', maxWidth: 700 }}>
              <Field label="Full name">
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </Field>
              <Field label="Email address" hint="This is where all your Curalis emails are sent.">
                <Input value={user.email} disabled />
              </Field>
              <Field label="Phone number">
                <Input type="tel" placeholder="+91 98450 22117" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </Field>
              <Field label="Time zone" hint="Used to schedule reminders and show times that make sense to you.">
                <Select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                  {timezoneOptions().map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {user.role === 'DOCTOR' && doctorProfileQuery.data && (
              <div className="card" style={{ padding: 'var(--space-4) var(--space-6)', marginTop: 'var(--space-4)', maxWidth: 700, gap: 4 }}>
                <p style={{ fontSize: 13, margin: 0 }}>
                  {doctorProfileQuery.data.specialisation} · {doctorProfileQuery.data.qualification}
                </p>
                <p style={{ fontSize: 13, margin: 0, opacity: 0.8 }}>
                  {doctorProfileQuery.data.slotDurationMin} minute consultations · {doctorHoursSummary.join(', ') || 'No working hours set'}
                </p>
                <p style={{ fontSize: 12, opacity: 0.6, margin: '6px 0 0' }}>Your professional details and schedule are managed by your clinic administrator. Contact them to make changes.</p>
              </div>
            )}

            <Button style={{ marginTop: 'var(--space-4)' }} onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </section>

          {user.role !== 'ADMIN' && (
            <section>
              <h3 style={{ marginBottom: 'var(--space-3)' }}>Google Calendar</h3>
              <div className="card" style={{ padding: 'var(--space-6)', maxWidth: 640, gap: 'var(--space-2)' }}>
                {calendar?.connected ? (
                  <div>
                    <p style={{ fontSize: 14, margin: 0 }}>Connected as {calendar.googleEmail}</p>
                    <p style={{ fontSize: 13, opacity: 0.7, margin: '2px 0 0' }}>Your appointments sync to this calendar automatically.</p>
                    <Button variant="secondary" style={{ marginTop: 'var(--space-3)' }} onClick={() => disconnectMutation.mutate()} disabled={disconnectMutation.isPending}>
                      Disconnect
                    </Button>
                  </div>
                ) : (
                  <div>
                    <p style={{ fontSize: 14, margin: '0 0 var(--space-2)', textWrap: 'pretty' }}>
                      Connect your Google Calendar and Curalis will add each appointment automatically — and update or remove it if anything changes.
                    </p>
                    <p style={{ fontSize: 13, opacity: 0.7, margin: '0 0 4px' }}>Curalis only creates and manages the events it makes. It never reads the rest of your calendar.</p>
                    <p style={{ fontSize: 13, opacity: 0.7, margin: '0 0 var(--space-3)' }}>Your appointments appear as "Consultation — Curalis Clinic". No symptoms, notes, or prescriptions are ever included.</p>
                    <Button onClick={() => connectMutation.mutate()} disabled={connectMutation.isPending}>
                      Connect Google Calendar
                    </Button>
                  </div>
                )}
              </div>
            </section>
          )}

          {user.role === 'PATIENT' && (
            <section>
              <h3 style={{ marginBottom: 'var(--space-3)' }}>Medication reminders</h3>
              <label className="radio">
                <input type="checkbox" checked={remindersOn} onChange={toggleReminders} />
                <span className="dot" />
                Email me when it's time to take my medication
              </label>
              <p style={{ fontSize: 13, opacity: 0.7, margin: 'var(--space-2) 0 0', maxWidth: '56ch' }}>
                Reminders follow your prescription and are sent in your time zone. Nothing is sent between 10:00 PM and 7:00 AM.
              </p>
              {!remindersOn && <p style={{ fontSize: 13, color: 'var(--color-accent-800)', margin: '6px 0 0' }}>Reminders are off. Your prescriptions are still visible under Prescriptions.</p>}
            </section>
          )}

          <section>
            <h3 style={{ marginBottom: 'var(--space-3)' }}>Email notifications</h3>
            <ul style={{ fontSize: 15, lineHeight: 1.8, margin: 0, paddingLeft: 20, maxWidth: '56ch' }}>
              {EMAIL_LIST_BY_ROLE[user.role].map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {user.role !== 'ADMIN' && (
              <p style={{ fontSize: 12, opacity: 0.6, margin: 'var(--space-3) 0 0', maxWidth: '56ch', textWrap: 'pretty' }}>
                Appointment emails can't be switched off — they carry information you need about bookings you've made.
              </p>
            )}
          </section>

          <section>
            <h3 style={{ marginBottom: 'var(--space-4)' }}>Password</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 'var(--space-3)', maxWidth: 700 }}>
              <Field label="Current password" error={passwordError && passwordError.includes('Current') ? passwordError : undefined}>
                <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
              </Field>
              <Field label="New password" hint="At least 8 characters." error={passwordError && passwordError.includes('New') ? passwordError : undefined}>
                <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </Field>
              <Field label="Confirm new password" error={passwordError.includes("don't match") ? passwordError : undefined}>
                <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
              </Field>
            </div>
            <Button style={{ marginTop: 'var(--space-4)' }} onClick={onUpdatePassword} disabled={passwordMutation.isPending || !currentPassword || !newPassword}>
              {passwordMutation.isPending ? 'Updating…' : 'Update password'}
            </Button>
          </section>
        </div>

        <aside>
          <div className="card" style={{ padding: 'var(--space-6)', gap: 'var(--space-2)' }}>
            <h4 style={{ margin: 0 }}>Signed in as</h4>
            <p style={{ fontSize: 14, margin: 0 }}>{user.fullName}</p>
            <p style={{ fontSize: 13, opacity: 0.65, margin: 0 }}>{ROLE_LABEL[user.role]}</p>
            <Button variant="secondary" block style={{ marginTop: 'var(--space-3)' }} onClick={handleSignOut}>
              Sign out
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
