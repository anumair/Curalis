import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext.jsx';
import { cancelAppointment, getAppointment, getPostVisitSummary, rescheduleAppointment } from '../../api/appointments.js';
import { getAvailability } from '../../api/doctors.js';
import { formatLongDate, formatTimeRange } from '../../lib/format.js';
import { Card } from '../../components/ui/Card.jsx';
import { Tag } from '../../components/ui/Tag.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Field, Input } from '../../components/ui/Field.jsx';
import { Dialog, DialogTitle, DialogDescription, DialogActions, DialogClose } from '../../components/ui/Dialog.jsx';
import { useToast } from '../../components/ui/Toast.jsx';

const STATUS_LABEL = {
  CONFIRMED: 'Confirmed',
  COMPLETED: 'Completed',
  CANCELLED_BY_PATIENT: 'Cancelled by you',
  CANCELLED_BY_DOCTOR: 'Cancelled by the doctor',
  CANCELLED_BY_CLINIC: 'Cancelled by the clinic',
};

const STATUS_TAG_VARIANT = {
  CONFIRMED: 'accent-2',
  COMPLETED: 'accent',
  CANCELLED_BY_PATIENT: 'neutral',
  CANCELLED_BY_DOCTOR: 'neutral',
  CANCELLED_BY_CLINIC: 'neutral',
};

const INTAKE_FIELDS = [
  ['symptoms', 'Symptoms'],
  ['durationText', 'How long'],
  ['severity', 'Severity (1–10)'],
  ['existingConditions', 'Existing conditions'],
  ['currentMedications', 'Current medications'],
  ['allergies', 'Allergies'],
  ['additionalNotes', 'Additional notes'],
];

const CANCEL_REASONS = ["Something came up", "Found a different doctor", "Feeling better", 'Other'];

function RescheduleDialog({ open, onOpenChange, appointment }) {
  const [date, setDate] = useState('');
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  const availabilityQuery = useQuery({
    queryKey: ['availability', appointment.doctor.id, date],
    queryFn: () => getAvailability(appointment.doctor.id, date),
    enabled: Boolean(date),
  });

  const mutation = useMutation({
    mutationFn: (newStartsAt) => rescheduleAppointment(appointment.id, newStartsAt),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      toast('Appointment moved.');
      onOpenChange(false);
      navigate(`/appointments/${result.appointmentId}`, { replace: true });
    },
    onError: () => toast("Couldn't move that appointment. Please try another time."),
  });

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTitle>Move your appointment</DialogTitle>
      <DialogDescription>
        Currently {formatLongDate(new Date(appointment.startsAt), appointment.doctor.timezone ?? 'UTC')} with {appointment.doctor.fullName}.
      </DialogDescription>

      <Field label="New date">
        <Input type="date" min={todayStr} value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>

      {date && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 8 }}>
          {availabilityQuery.isLoading && <p style={{ fontSize: 13, opacity: 0.6 }}>Loading times…</p>}
          {availabilityQuery.data?.length === 0 && <p style={{ fontSize: 13, opacity: 0.6 }}>No open times that day.</p>}
          {availabilityQuery.data?.map((slot) => (
            <button
              key={slot.startsAt}
              type="button"
              className="btn"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate(slot.startsAt)}
              style={{ borderRadius: 999, border: '1px solid var(--color-divider)', background: 'transparent', fontSize: 13 }}
            >
              {new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(slot.startsAt))}
            </button>
          ))}
        </div>
      )}

      <p style={{ fontSize: 12, opacity: 0.7, margin: 0 }}>
        Everything you've already told your doctor moves with you. Your confirmation email will be updated automatically.
      </p>
      <DialogActions>
        <DialogClose asChild>
          <Button variant="secondary">Keep current time</Button>
        </DialogClose>
      </DialogActions>
    </Dialog>
  );
}

function CancelDialog({ open, onOpenChange, appointment }) {
  const [reason, setReason] = useState(CANCEL_REASONS[0]);
  const [otherReason, setOtherReason] = useState('');
  const toast = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => cancelAppointment(appointment.id, reason === 'Other' ? otherReason || 'Other' : reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['appointment', appointment.id] });
      toast('Appointment cancelled.');
      onOpenChange(false);
    },
    onError: () => toast("Couldn't cancel that appointment. Please try again."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTitle>Cancel this appointment?</DialogTitle>
      <DialogDescription>Why are you cancelling?</DialogDescription>
      <div style={{ display: 'grid', gap: 8 }}>
        {CANCEL_REASONS.map((r) => (
          <label key={r} className="radio">
            <input type="radio" name="cancelreason" checked={reason === r} onChange={() => setReason(r)} />
            <span className="dot" />
            {r}
          </label>
        ))}
      </div>
      {reason === 'Other' && (
        <Field label="Tell us more (optional)">
          <Input value={otherReason} onChange={(e) => setOtherReason(e.target.value)} />
        </Field>
      )}
      <p style={{ fontSize: 13, color: 'var(--color-accent-800)', margin: 0 }}>This can't be undone. The slot will be released to other patients.</p>
      <DialogActions>
        <DialogClose asChild>
          <Button variant="secondary">Keep my appointment</Button>
        </DialogClose>
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? 'Cancelling…' : 'Yes, cancel it'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function AppointmentDetailsPage() {
  const { appointmentId } = useParams();
  const { user } = useAuth();
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const { data: appointment, isLoading } = useQuery({
    queryKey: ['appointment', appointmentId],
    queryFn: () => getAppointment(appointmentId),
  });

  const isCompleted = appointment?.status === 'COMPLETED';
  const { data: visitSummary } = useQuery({
    queryKey: ['post-visit-summary', appointmentId],
    queryFn: () => getPostVisitSummary(appointmentId),
    enabled: isCompleted,
  });

  const timezone = user.timezone;
  const isUpcoming = appointment?.status === 'CONFIRMED' && new Date(appointment.startsAt) > new Date();
  const isCancelled = appointment?.status.startsWith('CANCELLED_');

  const rows = useMemo(() => {
    if (!appointment) return [];
    const startsAt = new Date(appointment.startsAt);
    const list = [
      ['Date', formatLongDate(startsAt, timezone)],
      ['Time', formatTimeRange(startsAt, new Date(appointment.endsAt), timezone)],
      ['Status', STATUS_LABEL[appointment.status] ?? appointment.status],
    ];
    if (appointment.cancelledAt) {
      list.push(['Cancelled on', formatLongDate(new Date(appointment.cancelledAt), timezone)]);
      if (appointment.cancellationReason) list.push(['Reason', appointment.cancellationReason]);
    }
    return list;
  }, [appointment, timezone]);

  if (isLoading) {
    return (
      <div className="pg" style={{ maxWidth: 1180, margin: '0 auto', padding: 'clamp(28px,4vw,52px) clamp(16px,4vw,28px) 96px' }}>
        <p style={{ opacity: 0.6 }}>Loading…</p>
      </div>
    );
  }

  if (!appointment) return null;

  const intake = INTAKE_FIELDS.filter(([key]) => appointment.symptomForm?.[key]);

  return (
    <div className="pg" style={{ maxWidth: 1180, margin: '0 auto', padding: 'clamp(28px,4vw,52px) clamp(16px,4vw,28px) 96px' }}>
      <Link to="/app" style={{ fontSize: 13 }}>
        ← Back to dashboard
      </Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap', margin: 'var(--space-6) 0 var(--space-2)' }}>
        <h1 style={{ fontSize: 'clamp(30px,3.8vw,46px)', margin: 0 }}>Appointment with {appointment.doctor.fullName}</h1>
        <Tag variant={STATUS_TAG_VARIANT[appointment.status] ?? 'neutral'}>{STATUS_LABEL[appointment.status] ?? appointment.status}</Tag>
      </div>
      <p style={{ opacity: 0.7 }}>{appointment.doctor.specialisation}</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 'var(--space-8)', alignItems: 'start', marginTop: 'var(--space-6)' }}>
        <div>
          <Card elevation="sm" style={{ padding: 'var(--space-6)', gap: 0, maxWidth: 620 }}>
            {rows.map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-4)', padding: '9px 0', borderBottom: '1px solid var(--color-divider)', fontSize: 14 }}>
                <span style={{ opacity: 0.6 }}>{k}</span>
                <span style={{ textAlign: 'right' }}>{v}</span>
              </div>
            ))}
          </Card>

          {isCancelled && (
            <div style={{ background: 'var(--color-accent-100)', borderRadius: 'calc(var(--radius-lg) * 1.15)', padding: 'var(--space-6)', marginTop: 'var(--space-6)', maxWidth: 620 }}>
              <h4 style={{ marginBottom: 6 }}>{STATUS_LABEL[appointment.status]}</h4>
              <p style={{ fontSize: 14, color: 'var(--color-accent-800)', marginBottom: 'var(--space-2)' }}>
                {appointment.cancellationReason ? `Reason given: ${appointment.cancellationReason}.` : 'This appointment was cancelled.'}
              </p>
              <Button as={Link} to="/doctors">
                Book another time
              </Button>
            </div>
          )}

          {isCompleted && visitSummary?.summary?.status === 'READY' && (
            <div style={{ marginTop: 'var(--space-8)', maxWidth: 680 }}>
              <h2 style={{ fontSize: 'clamp(26px,3vw,36px)', marginBottom: 6 }}>Your visit summary</h2>
              <p style={{ fontSize: 13, opacity: 0.6, marginBottom: 'var(--space-6)' }}>
                Written in plain language from {appointment.doctor.fullName}'s notes. Prepared automatically from what was written. Not medical advice.
              </p>
              <p style={{ fontSize: 16, lineHeight: 1.7, textWrap: 'pretty' }}>{visitSummary.summary.payload.summary}</p>

              {visitSummary.visitNote?.diagnosis && (
                <>
                  <h4 style={{ margin: 'var(--space-6) 0 var(--space-2)' }}>What you were diagnosed with</h4>
                  <p style={{ fontSize: 15, margin: 0 }}>{visitSummary.visitNote.diagnosis}</p>
                </>
              )}

              {visitSummary.summary.payload.medicationSchedule?.length > 0 && (
                <>
                  <h4 style={{ margin: 'var(--space-6) 0 var(--space-3)' }}>Your medication</h4>
                  <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
                    {visitSummary.summary.payload.medicationSchedule.map((m, i) => (
                      <Card key={i} style={{ padding: 'var(--space-4) var(--space-6)', gap: 2 }}>
                        <p style={{ fontFamily: 'var(--font-heading)', fontSize: 17, margin: 0 }}>
                          {m.drug} · {m.dose}
                        </p>
                        <p style={{ fontSize: 14, opacity: 0.8, margin: 0 }}>{m.whenToTake}</p>
                        <p style={{ fontSize: 13, opacity: 0.65, margin: 0 }}>
                          {m.howLong}
                          {m.notes ? ` · ${m.notes}` : ''}
                        </p>
                      </Card>
                    ))}
                  </div>
                </>
              )}

              {visitSummary.summary.payload.followUpSteps?.length > 0 && (
                <>
                  <h4 style={{ margin: 'var(--space-6) 0 var(--space-2)' }}>Next steps</h4>
                  <ul style={{ fontSize: 15, lineHeight: 1.7, paddingLeft: 20, margin: 0 }}>
                    {visitSummary.summary.payload.followUpSteps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ul>
                </>
              )}

              {visitSummary.visitNote?.followUpDate && (
                <div style={{ background: 'var(--color-accent-2-100)', borderRadius: 'calc(var(--radius-lg) * 1.15)', padding: 'var(--space-6)', marginTop: 'var(--space-6)' }}>
                  <h4 style={{ marginBottom: 4 }}>Follow-up appointment</h4>
                  <p style={{ fontSize: 14, color: 'var(--color-accent-2-800)', marginBottom: 'var(--space-3)' }}>
                    Recommended on or after {formatLongDate(new Date(visitSummary.visitNote.followUpDate), 'UTC')}.
                    {visitSummary.visitNote.followUpNotes ? ` ${visitSummary.visitNote.followUpNotes}` : ''}
                  </p>
                  <Button as={Link} to="/doctors">
                    Book follow-up
                  </Button>
                </div>
              )}
            </div>
          )}

          {isCompleted && visitSummary && visitSummary.summary?.status !== 'READY' && (
            <div style={{ background: 'var(--color-neutral-200)', borderRadius: 'calc(var(--radius-lg) * 1.15)', padding: 'var(--space-6)', marginTop: 'var(--space-8)', maxWidth: '56ch' }}>
              <p style={{ margin: 0, fontSize: 15, textWrap: 'pretty' }}>
                {appointment.doctor.fullName} has added their notes, and your summary is being prepared. You'll get an email as soon as it's ready.
              </p>
            </div>
          )}

          {intake.length > 0 && (
            <div style={{ marginTop: 'var(--space-8)', maxWidth: 680 }}>
              <h3 style={{ margin: 0 }}>What you told us</h3>
              <p style={{ fontSize: 12, opacity: 0.6, marginTop: 6 }}>Visible to you and your doctor only. Never included in emails or calendar entries.</p>
              <div style={{ display: 'grid', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
                {intake.map(([key, label]) => (
                  <div key={key} style={{ borderTop: '1px solid var(--color-divider)', paddingTop: 'var(--space-2)' }}>
                    <p style={{ fontSize: 12, opacity: 0.55, margin: 0 }}>{label}</p>
                    <p style={{ fontSize: 15, margin: '2px 0 0', textWrap: 'pretty' }}>{appointment.symptomForm[key]}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {isUpcoming && (
            <Card style={{ padding: 'var(--space-6)' }}>
              <h4 style={{ marginBottom: 'var(--space-2)' }}>Need to change something?</h4>
              <Button block style={{ margin: '0 0 var(--space-2)' }} onClick={() => setRescheduleOpen(true)}>
                Reschedule
              </Button>
              <Button variant="secondary" block style={{ margin: 0 }} onClick={() => setCancelOpen(true)}>
                Cancel appointment
              </Button>
            </Card>
          )}
          <Card style={{ padding: 'var(--space-6)', gap: 6 }}>
            <h4 style={{ marginBottom: 2 }}>Calendar</h4>
            <p style={{ fontSize: 13, opacity: 0.75, margin: 0 }}>Connect your Google Calendar in Settings to keep this in sync automatically.</p>
            <Button as={Link} to="/settings" variant="secondary" style={{ alignSelf: 'flex-start', marginTop: 'var(--space-2)' }}>
              Open Settings
            </Button>
          </Card>
        </aside>
      </div>

      {isUpcoming && rescheduleOpen && <RescheduleDialog open={rescheduleOpen} onOpenChange={setRescheduleOpen} appointment={appointment} />}
      {isUpcoming && cancelOpen && <CancelDialog open={cancelOpen} onOpenChange={setCancelOpen} appointment={appointment} />}
    </div>
  );
}
