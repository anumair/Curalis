import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '../../context/AuthContext.jsx';
import { getDoctor, getAvailability } from '../../api/doctors.js';
import { holdAppointment, confirmAppointment as confirmAppointmentApi } from '../../api/appointments.js';
import { getCalendarStatus } from '../../api/calendar.js';
import { initialsOf } from '../../lib/initials.js';
import { formatLongDate, formatTimeRange } from '../../lib/format.js';
import { Button } from '../../components/ui/Button.jsx';
import { Field, Input, Textarea } from '../../components/ui/Field.jsx';

const STEPS = [
  { n: 1, label: 'Pick a time' },
  { n: 2, label: 'Symptom details' },
  { n: 3, label: 'Confirmation' },
];

const symptomSchema = z.object({
  symptoms: z.string().min(1, "Please describe what you're experiencing so your doctor can prepare."),
  durationText: z.string().optional(),
  severity: z.number().int().min(1).max(10),
  existingConditions: z.string().optional(),
  currentMedications: z.string().optional(),
  allergies: z.string().optional(),
  additionalNotes: z.string().optional(),
});

function dateChips(days = 30) {
  const chips = [];
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    chips.push(d);
  }
  return chips;
}

function useCountdown(targetIso) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!targetIso) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [targetIso]);
  if (!targetIso) return { msLeft: 0, expired: false };
  const msLeft = Date.parse(targetIso) - now;
  return { msLeft: Math.max(0, msLeft), expired: msLeft <= 0 };
}

function StepIndicator({ step }) {
  return (
    <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', margin: 'var(--space-6) 0 var(--space-8)' }}>
      {STEPS.map((st) => {
        const active = st.n === step;
        const done = st.n < step;
        return (
          <span
            key={st.n}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              padding: '6px 18px 6px 6px',
              borderRadius: 999,
              background: active ? 'var(--color-accent-700)' : done ? 'var(--color-accent-100)' : 'var(--color-neutral-100)',
              color: active ? 'var(--color-accent-100)' : 'var(--color-text)',
              fontSize: 13,
            }}
          >
            <span
              style={{
                width: 26,
                height: 26,
                borderRadius: 999,
                background: active ? 'var(--color-accent-400)' : 'var(--color-accent-200)',
                color: 'var(--color-accent-900)',
                display: 'grid',
                placeItems: 'center',
                fontFamily: 'var(--font-heading)',
                fontSize: 12,
              }}
            >
              {done ? '✓' : st.n}
            </span>
            {st.label}
          </span>
        );
      })}
    </div>
  );
}

function DoctorSummaryCard({ doctor }) {
  return (
    <div className="card" style={{ padding: 'var(--space-6)', gap: 'var(--space-2)' }}>
      <span
        style={{
          width: 52,
          height: 52,
          borderRadius: 999,
          background: 'var(--color-accent-200)',
          color: 'var(--color-accent-800)',
          display: 'grid',
          placeItems: 'center',
          fontFamily: 'var(--font-heading)',
          fontSize: 18,
        }}
      >
        {initialsOf(doctor.fullName)}
      </span>
      <p style={{ fontFamily: 'var(--font-heading)', fontSize: 21, lineHeight: 1.15, margin: 'var(--space-2) 0 0' }}>{doctor.fullName}</p>
      <p style={{ fontSize: 13, color: 'var(--color-accent-700)', margin: 0 }}>{doctor.specialisation}</p>
      {doctor.qualification && <p style={{ fontSize: 12, opacity: 0.6, margin: 0 }}>{doctor.qualification}</p>}
      {doctor.bio && <p style={{ fontSize: 13, opacity: 0.8, margin: 'var(--space-2) 0 0', textWrap: 'pretty' }}>{doctor.bio}</p>}
      <div style={{ borderTop: '1px solid var(--color-divider)', marginTop: 'var(--space-3)', paddingTop: 'var(--space-3)', display: 'grid', gap: 6, fontSize: 13 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
          <span style={{ opacity: 0.6 }}>Fee</span>
          <span>₹{doctor.consultationFee}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
          <span style={{ opacity: 0.6 }}>Length</span>
          <span>{doctor.slotDurationMin} min</span>
        </div>
      </div>
    </div>
  );
}

export function BookAppointmentPage() {
  const { doctorId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const timezone = user.timezone;

  const [step, setStep] = useState(1);
  const [selectedDate, setSelectedDate] = useState(() => new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date()));
  const [hold, setHold] = useState(null); // { appointmentId, holdToken, holdExpiresAt, startsAt, endsAt }
  const [holdExpired, setHoldExpired] = useState(false);
  const [confirmedAppointmentId, setConfirmedAppointmentId] = useState(null);

  const doctorQuery = useQuery({ queryKey: ['doctor', doctorId], queryFn: () => getDoctor(doctorId) });
  const availabilityQuery = useQuery({
    queryKey: ['availability', doctorId, selectedDate],
    queryFn: () => getAvailability(doctorId, selectedDate),
    enabled: Boolean(selectedDate),
  });

  const calendarQuery = useQuery({ queryKey: ['calendar-status'], queryFn: getCalendarStatus });

  const holdMutation = useMutation({
    mutationFn: (startsAt) => holdAppointment(doctorId, startsAt),
    onSuccess: (result) => {
      setHold(result);
      setHoldExpired(false);
      setStep(2);
    },
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(symptomSchema), defaultValues: { severity: 5 } });
  const severity = watch('severity');

  const confirmMutation = useMutation({
    mutationFn: (symptomForm) => confirmAppointmentApi(hold.appointmentId, hold.holdToken, symptomForm),
    onSuccess: (result) => {
      setConfirmedAppointmentId(result.appointmentId);
      setStep(3);
    },
    onError: (err) => {
      if (err.response?.status === 410) setHoldExpired(true);
    },
  });

  const { msLeft, expired } = useCountdown(step === 2 && !holdExpired ? hold?.holdExpiresAt : null);
  useEffect(() => {
    if (step === 2 && expired && hold) setHoldExpired(true);
  }, [expired, step, hold]);

  const chips = useMemo(() => dateChips(30), []);

  if (doctorQuery.isLoading) {
    return (
      <div className="pg" style={{ maxWidth: 1180, margin: '0 auto', padding: 'clamp(28px,4vw,52px) clamp(16px,4vw,28px) 96px' }}>
        <p style={{ opacity: 0.6 }}>Loading…</p>
      </div>
    );
  }
  const doctor = doctorQuery.data;
  if (!doctor) return null;

  function retryHold() {
    if (!hold) return;
    holdMutation.mutate(hold.startsAt);
  }

  function backToStep1() {
    setHold(null);
    setHoldExpired(false);
    setStep(1);
  }

  function onSubmitSymptoms(values) {
    confirmMutation.mutate(values);
  }

  const clock = holdExpired ? '00:00' : `${String(Math.floor(msLeft / 60000)).padStart(2, '0')}:${String(Math.floor((msLeft % 60000) / 1000)).padStart(2, '0')}`;

  return (
    <div className="pg" style={{ maxWidth: 1180, margin: '0 auto', padding: 'clamp(28px,4vw,52px) clamp(16px,4vw,28px) 96px' }}>
      <Link to="/doctors" style={{ fontSize: 13 }}>
        ← Back to all doctors
      </Link>

      <StepIndicator step={step} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 'var(--space-8)', alignItems: 'start' }}>
        <div>
          {step === 1 && (
            <div>
              <h1 style={{ fontSize: 'clamp(30px,3.8vw,44px)', marginBottom: 'var(--space-2)' }}>Book with {doctor.fullName}</h1>
              <p style={{ opacity: 0.7, fontSize: 14 }}>You can book up to 30 days ahead. Times shown in your time zone ({timezone}).</p>

              <h6 style={{ opacity: 0.6, margin: 'var(--space-6) 0 var(--space-3)' }}>Pick a date</h6>
              <div style={{ display: 'flex', gap: 'var(--space-2)', overflowX: 'auto', paddingBottom: 'var(--space-3)' }}>
                {chips.map((d) => {
                  const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(d);
                  const active = dateStr === selectedDate;
                  return (
                    <button
                      key={dateStr}
                      type="button"
                      onClick={() => setSelectedDate(dateStr)}
                      style={{
                        flex: 'none',
                        width: 78,
                        padding: '12px 0',
                        borderRadius: 'var(--radius-lg)',
                        border: active ? '1px solid var(--color-accent-700)' : '1px solid var(--color-divider)',
                        background: active ? 'var(--color-accent-700)' : 'transparent',
                        color: active ? 'var(--color-accent-100)' : 'var(--color-text)',
                        cursor: 'pointer',
                        fontFamily: 'var(--font-body)',
                      }}
                    >
                      <span style={{ display: 'block', fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', opacity: 0.7 }}>
                        {new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: timezone }).format(d)}
                      </span>
                      <span style={{ display: 'block', fontFamily: 'var(--font-heading)', fontSize: 22, lineHeight: 1.2 }}>
                        {new Intl.DateTimeFormat('en-US', { day: 'numeric', timeZone: timezone }).format(d)}
                      </span>
                      <span style={{ display: 'block', fontSize: 11, opacity: 0.7 }}>{new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: timezone }).format(d)}</span>
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)', flexWrap: 'wrap', margin: 'var(--space-6) 0 var(--space-2)' }}>
                <h3 style={{ margin: 0 }}>Available times on {formatLongDate(new Date(`${selectedDate}T12:00:00Z`), timezone)}</h3>
                <button type="button" className="btn btn-ghost" onClick={() => availabilityQuery.refetch()}>
                  Refresh availability
                </button>
              </div>
              <p style={{ fontSize: 12, opacity: 0.6 }}>All times shown in {timezone}. Slots can be taken by others while you're deciding.</p>

              {availabilityQuery.data?.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(155px,1fr))', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
                  {availabilityQuery.data.map((slot) => (
                    <button
                      key={slot.startsAt}
                      type="button"
                      onClick={() => holdMutation.mutate(slot.startsAt)}
                      disabled={holdMutation.isPending}
                      style={{ padding: 12, borderRadius: 999, border: '1px solid var(--color-divider)', background: 'transparent', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)' }}
                    >
                      {new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: timezone }).format(new Date(slot.startsAt))}
                    </button>
                  ))}
                </div>
              )}
              {availabilityQuery.data?.length === 0 && (
                <div style={{ marginTop: 'var(--space-4)', background: 'var(--color-accent-100)', borderRadius: 'calc(var(--radius-lg) * 1.15)', padding: 'var(--space-6)', maxWidth: '52ch' }}>
                  <h4 style={{ marginBottom: 6 }}>No times available that day</h4>
                  <p style={{ fontSize: 14, margin: '0 0 var(--space-3)', color: 'var(--color-accent-800)' }}>Try a different date, or see another {doctor.specialisation} doctor.</p>
                  <Button as={Link} to="/doctors" variant="secondary">
                    See other {doctor.specialisation} doctors
                  </Button>
                </div>
              )}
              {holdMutation.isError && (
                <p style={{ fontSize: 13, color: 'var(--color-accent-800)', marginTop: 'var(--space-3)' }}>
                  That slot was just taken. Please pick another time.
                </p>
              )}
            </div>
          )}

          {step === 2 && (
            <div>
              {holdExpired && (
                <div style={{ background: 'var(--color-accent-200)', borderRadius: 'calc(var(--radius-lg) * 1.15)', padding: 'var(--space-6)', marginBottom: 'var(--space-6)', maxWidth: '56ch' }}>
                  <h3 style={{ marginBottom: 6 }}>Your hold has expired</h3>
                  <p style={{ fontSize: 14, color: 'var(--color-accent-900)' }}>The 10 minutes ran out and the slot returned to the schedule. It may still be free.</p>
                  <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    <Button onClick={retryHold} disabled={holdMutation.isPending}>
                      Try that time again
                    </Button>
                    <Button variant="secondary" onClick={backToStep1}>
                      Pick a different time
                    </Button>
                  </div>
                  <p style={{ fontSize: 12, opacity: 0.7, margin: 'var(--space-3) 0 0' }}>What you've written so far has been kept.</p>
                </div>
              )}

              <h1 style={{ fontSize: 'clamp(30px,3.8vw,44px)', marginBottom: 'var(--space-2)' }}>Tell us what's going on</h1>
              <p style={{ opacity: 0.75, maxWidth: '56ch', textWrap: 'pretty' }}>Your doctor reads this before your appointment, so the consultation can start with what matters.</p>

              <div
                style={{
                  background: 'var(--color-accent-700)',
                  color: 'var(--color-accent-100)',
                  borderRadius: 'calc(var(--radius-lg) * 1.15)',
                  padding: 'var(--space-6)',
                  margin: 'var(--space-6) 0',
                  maxWidth: '62ch',
                }}
              >
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, lineHeight: 1.55, textWrap: 'pretty' }}>
                  If you're experiencing chest pain, difficulty breathing, sudden weakness or numbness, severe bleeding, or thoughts of harming yourself — do not book an
                  appointment. Call your local emergency number now.
                </p>
              </div>

              <form onSubmit={handleSubmit(onSubmitSymptoms)} style={{ display: 'grid', gap: 'var(--space-4)', maxWidth: 640 }}>
                <Field label="What are you experiencing?" error={errors.symptoms?.message} hint={!errors.symptoms ? "Describe your symptoms in your own words. There's no wrong way to say it." : undefined}>
                  <Textarea style={{ borderRadius: 'var(--radius-lg)', minHeight: 110 }} placeholder="Describe your symptoms in your own words." {...register('symptoms')} />
                </Field>
                <Field label="How long has this been going on?">
                  <Input placeholder="For example: 3 days, since last Monday, on and off for a month" {...register('durationText')} />
                </Field>
                <Field label={`How severe is it right now? — ${severity} out of 10`} hint="A scale from 1 to 10, where 1 is barely noticeable and 10 is the worst you've felt.">
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={severity}
                    onChange={(e) => setValue('severity', Number(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--color-accent)' }}
                  />
                </Field>
                <Field label="Any ongoing conditions?">
                  <Input placeholder="diabetes, high blood pressure, asthma — or None" {...register('existingConditions')} />
                </Field>
                <Field label="What medication are you currently taking?">
                  <Input placeholder="Include the name and dose if you know it, and anything over the counter" {...register('currentMedications')} />
                </Field>
                <Field label="Any allergies?">
                  <Input placeholder="Medications, foods, or anything else your doctor should know about" {...register('allergies')} />
                </Field>
                <Field label="Anything else you'd like your doctor to know?">
                  <Textarea style={{ borderRadius: 'var(--radius-lg)' }} placeholder="Optional. Anything that didn't fit above." {...register('additionalNotes')} />
                </Field>

                <p
                  style={{
                    fontSize: 13,
                    background: 'var(--color-accent-2-100)',
                    color: 'var(--color-accent-2-800)',
                    padding: '12px 18px',
                    borderRadius: 'var(--radius-md)',
                    maxWidth: '62ch',
                    textWrap: 'pretty',
                  }}
                >
                  What you write here is shared with your doctor only. It never appears in emails or calendar entries.
                </p>

                <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
                  <Button type="submit" style={{ padding: '12px 28px', fontSize: 15 }} disabled={isSubmitting || confirmMutation.isPending || holdExpired}>
                    {confirmMutation.isPending ? 'Confirming…' : 'Confirm appointment'}
                  </Button>
                  <Button type="button" variant="secondary" onClick={backToStep1}>
                    Choose a different time
                  </Button>
                </div>
                <p style={{ fontSize: 12, opacity: 0.6 }}>Choosing a different time releases the slot you're holding.</p>
              </form>
            </div>
          )}

          {step === 3 && confirmedAppointmentId && (
            <div>
              <span
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 999,
                  background: 'var(--color-accent-2-500)',
                  color: 'var(--color-bg)',
                  display: 'grid',
                  placeItems: 'center',
                  fontFamily: 'var(--font-heading)',
                  fontSize: 26,
                }}
              >
                ✓
              </span>
              <h1 style={{ fontSize: 'clamp(34px,4.4vw,52px)', margin: 'var(--space-4) 0 var(--space-2)' }}>You're booked</h1>
              <p style={{ opacity: 0.75 }}>We've sent a confirmation to {user.email}.</p>

              <div className="card elev-sm" style={{ padding: 'var(--space-6)', maxWidth: 560, marginTop: 'var(--space-6)', gap: 0 }}>
                {[
                  ['Doctor', doctor.fullName],
                  ['Specialisation', doctor.specialisation],
                  ['Date', formatLongDate(new Date(hold.startsAt), timezone)],
                  ['Time', formatTimeRange(new Date(hold.startsAt), new Date(hold.endsAt), timezone)],
                  ['Fee', `₹${doctor.consultationFee}`],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-4)', padding: '9px 0', borderBottom: '1px solid var(--color-divider)', fontSize: 14 }}>
                    <span style={{ opacity: 0.6 }}>{k}</span>
                    <span style={{ textAlign: 'right' }}>{v}</span>
                  </div>
                ))}
              </div>

              <h3 style={{ margin: 'var(--space-8) 0 var(--space-4)' }}>What happens next</h3>
              <div style={{ display: 'grid', gap: 'var(--space-4)', maxWidth: 600 }}>
                {[
                  ['1', 'Check your email', "We've sent a confirmation with everything you need to know."],
                  ['2', 'Get ready', 'Jot down any other questions you want to ask before the visit.'],
                  ['3', "You'll get reminders", "We'll email you 24 hours and 1 hour before your appointment."],
                  ['4', 'After your visit', "A plain-language summary appears in your appointment details once it's ready."],
                ].map(([n, t, b]) => (
                  <div key={n} style={{ display: 'flex', gap: 'var(--space-3)' }}>
                    <span
                      style={{
                        width: 30,
                        height: 30,
                        flex: 'none',
                        borderRadius: 999,
                        background: 'var(--color-accent-200)',
                        color: 'var(--color-accent-800)',
                        display: 'grid',
                        placeItems: 'center',
                        fontFamily: 'var(--font-heading)',
                        fontSize: 14,
                      }}
                    >
                      {n}
                    </span>
                    <div>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>{t}</p>
                      <p style={{ margin: '2px 0 0', fontSize: 14, opacity: 0.75, textWrap: 'pretty' }}>{b}</p>
                    </div>
                  </div>
                ))}
              </div>

              {!calendarQuery.data?.connected && (
                <div style={{ background: 'var(--color-accent-100)', borderRadius: 'calc(var(--radius-lg) * 1.15)', padding: 'var(--space-6)', marginTop: 'var(--space-6)', maxWidth: 600 }}>
                  <h4 style={{ marginBottom: 6 }}>Want appointments to appear in your calendar automatically?</h4>
                  <p style={{ fontSize: 14, color: 'var(--color-accent-800)', textWrap: 'pretty' }}>Connect Google Calendar once, and every booking, change, and cancellation syncs on its own.</p>
                  <Button as={Link} to="/settings">
                    Connect Google Calendar
                  </Button>
                </div>
              )}

              <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', marginTop: 'var(--space-6)' }}>
                <Button style={{ padding: '12px 24px' }} onClick={() => navigate(`/appointments/${confirmedAppointmentId}`)}>
                  View appointment details
                </Button>
                <Button variant="secondary" style={{ padding: '12px 24px' }} onClick={() => navigate('/app')}>
                  Back to dashboard
                </Button>
              </div>
              <p style={{ fontSize: 13, opacity: 0.65, marginTop: 'var(--space-4)', maxWidth: '52ch', textWrap: 'pretty' }}>
                Arrive a few minutes early. If anything changes, you can reschedule or cancel from your appointment details.
              </p>
            </div>
          )}
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {step === 2 && hold && (
            <div
              style={{
                background: holdExpired ? 'var(--color-neutral-200)' : 'var(--color-accent-700)',
                color: holdExpired ? 'var(--color-text)' : 'var(--color-accent-100)',
                borderRadius: 'calc(var(--radius-lg) * 1.15)',
                padding: 'var(--space-6)',
              }}
            >
              <p style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', margin: 0, opacity: 0.75 }}>Time remaining to confirm</p>
              <p style={{ fontFamily: 'var(--font-heading)', fontSize: 44, lineHeight: 1.1, margin: '6px 0 var(--space-2)' }}>{clock}</p>
              <p style={{ fontSize: 13, margin: 0, opacity: 0.85, textWrap: 'pretty' }}>
                {holdExpired ? 'This slot has been released.' : "We're holding this slot for you while you fill this in."}
              </p>
              <div style={{ marginTop: 'var(--space-4)', borderTop: '1px solid color-mix(in srgb, currentColor 25%, transparent)', paddingTop: 'var(--space-3)', fontSize: 14 }}>
                <p style={{ margin: 0, fontWeight: 700 }}>{doctor.fullName}</p>
                <p style={{ margin: '2px 0 0', opacity: 0.8 }}>{doctor.specialisation}</p>
                <p style={{ margin: '6px 0 0' }}>{formatLongDate(new Date(hold.startsAt), timezone)}</p>
                <p style={{ margin: '2px 0 0', opacity: 0.8 }}>{doctor.slotDurationMin} min</p>
              </div>
            </div>
          )}

          {step !== 3 && <DoctorSummaryCard doctor={doctor} />}
        </aside>
      </div>
    </div>
  );
}
