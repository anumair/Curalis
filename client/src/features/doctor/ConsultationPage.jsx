import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext.jsx';
import { getAppointment, cancelAppointment } from '../../api/appointments.js';
import { getPreVisitSummary, getPrescriptionForAppointment, submitVisitNote, submitPrescription } from '../../api/consultation.js';
import { formatLongDate, formatTimeRange } from '../../lib/format.js';
import { Tag } from '../../components/ui/Tag.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Field, Input, Textarea, Select } from '../../components/ui/Field.jsx';
import { useToast } from '../../components/ui/Toast.jsx';

const FREQUENCIES = ['OD', 'BD', 'TDS', 'QID', 'HS', 'SOS'];
const FREQUENCY_LABEL = { OD: 'Once a day', BD: 'Twice a day', TDS: '3 times a day', QID: '4 times a day', HS: 'At bedtime', SOS: 'As needed' };
const FREQUENCY_TIMES = { OD: [540], BD: [540, 1260], TDS: [480, 840, 1200], QID: [480, 720, 960, 1200], HS: [1320], SOS: [] };

function formatMinutesOfDay(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function timesPreview(freq) {
  const times = FREQUENCY_TIMES[freq] ?? [];
  return times.length > 0 ? times.map(formatMinutesOfDay).join(', ') : 'No scheduled reminders';
}

function emptyMed() {
  return { drugName: '', dose: '', frequency: 'OD', durationDays: 7, instructions: '' };
}

const INTAKE_FIELDS = [
  ['symptoms', 'Symptoms'],
  ['durationText', 'How long'],
  ['severity', 'Severity (1–10)'],
  ['existingConditions', 'Existing conditions'],
  ['currentMedications', 'Current medications'],
  ['allergies', 'Allergies'],
  ['additionalNotes', 'Additional notes'],
];

export function ConsultationPage() {
  const { appointmentId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [phase, setPhase] = useState('overview');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpNotes, setFollowUpNotes] = useState('');
  const [meds, setMeds] = useState([]);
  const [notesError, setNotesError] = useState(false);

  const appointmentQuery = useQuery({ queryKey: ['appointment', appointmentId], queryFn: () => getAppointment(appointmentId) });
  const preVisitQuery = useQuery({
    queryKey: ['pre-visit-summary', appointmentId],
    queryFn: () => getPreVisitSummary(appointmentId),
    enabled: Boolean(appointmentQuery.data),
  });
  const existingPrescriptionQuery = useQuery({
    queryKey: ['appointment-prescription', appointmentId],
    queryFn: () => getPrescriptionForAppointment(appointmentId),
    enabled: appointmentQuery.data?.status === 'COMPLETED',
  });
  const existingPrescription = existingPrescriptionQuery.data;

  // A prescription is unique per appointment and can never be edited once
  // submitted (see clinical.service.js) — if one already exists, load it
  // read-only instead of a blank form the doctor could mistake for editable.
  useEffect(() => {
    if (existingPrescription) {
      setMeds(
        existingPrescription.items.map((item) => ({
          drugName: item.drugName,
          dose: item.dose,
          frequency: item.frequency,
          durationDays: item.durationDays,
          instructions: item.instructions ?? '',
        }))
      );
    }
  }, [existingPrescription]);

  const completeMutation = useMutation({
    mutationFn: async () => {
      const appointment = appointmentQuery.data;
      if (appointment.status === 'CONFIRMED') {
        await submitVisitNote(appointmentId, {
          clinicalNotes,
          diagnosis: diagnosis || undefined,
          followUpDate: followUpDate || undefined,
          followUpNotes: followUpNotes || undefined,
        });
      }
      const validMeds = meds.filter((m) => m.drugName && m.dose);
      if (validMeds.length > 0) {
        await submitPrescription(appointmentId, {
          startDate: new Intl.DateTimeFormat('en-CA').format(new Date()),
          items: validMeds.map((m) => ({ ...m, durationDays: Number(m.durationDays) })),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointment', appointmentId] });
      queryClient.invalidateQueries({ queryKey: ['doctor-schedule'] });
      queryClient.invalidateQueries({ queryKey: ['doctor-awaiting-notes'] });
      toast('Visit completed.');
      setPhase('done');
    },
    onError: () => toast('Something went wrong saving this visit. Please try again.'),
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelAppointment(appointmentId),
    onSuccess: () => {
      toast('Appointment cancelled.');
      navigate('/doctor');
    },
  });

  function onSubmitVisit() {
    if (appointmentQuery.data.status === 'CONFIRMED' && !clinicalNotes.trim()) {
      setNotesError(true);
      return;
    }
    setNotesError(false);
    completeMutation.mutate();
  }

  function updateMed(index, patch) {
    setMeds((prev) => prev.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  }

  if (appointmentQuery.isLoading) {
    return (
      <div className="pg" style={{ maxWidth: 1180, margin: '0 auto', padding: 'clamp(28px,4vw,52px) clamp(16px,4vw,28px) 96px' }}>
        <p style={{ opacity: 0.6 }}>Loading…</p>
      </div>
    );
  }
  const appointment = appointmentQuery.data;
  if (!appointment) return null;

  const preVisit = preVisitQuery.data?.summary;
  const chiefComplaint = preVisit?.payload?.chiefComplaint ?? appointment.symptomForm?.symptoms;
  const alreadyCompleted = appointment.status === 'COMPLETED';
  const prescriptionLocked = alreadyCompleted && Boolean(existingPrescription);
  const medsReadOnly = phase === 'done' || prescriptionLocked;
  const intake = INTAKE_FIELDS.filter(([key]) => appointment.symptomForm?.[key]);
  const age = appointment.patient.dateOfBirth ? Math.floor((Date.now() - new Date(appointment.patient.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : null;

  return (
    <div className="pg" style={{ maxWidth: 1180, margin: '0 auto', padding: 'clamp(28px,4vw,52px) clamp(16px,4vw,28px) 96px' }}>
      <Link to="/doctor" style={{ fontSize: 13 }}>
        ← Back to today's schedule
      </Link>

      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', margin: 'var(--space-6) 0 var(--space-8)' }}>
        {[
          ['overview', '1', 'Overview'],
          ['record', '2', alreadyCompleted ? 'Notes' : 'Record'],
        ].map(([key, n, label]) => {
          const active = phase === key || (phase === 'done' && key === 'record');
          return (
            <button
              key={key}
              type="button"
              onClick={() => setPhase(key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '6px 18px 6px 6px',
                borderRadius: 999,
                border: 'none',
                cursor: 'pointer',
                background: active ? 'var(--color-accent-700)' : 'var(--color-neutral-100)',
                color: active ? 'var(--color-accent-100)' : 'var(--color-text)',
                fontSize: 13,
                fontFamily: 'var(--font-body)',
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
                {n}
              </span>
              {label}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 'var(--space-8)', alignItems: 'start' }}>
        <div>
          {phase === 'overview' && (
            <div>
              <h1 style={{ fontSize: 'clamp(30px,3.8vw,46px)', marginBottom: 6 }}>{appointment.patient.fullName}</h1>
              <p style={{ opacity: 0.7, marginBottom: 'var(--space-6)' }}>{[age, appointment.patient.gender, appointment.patient.bloodGroup].filter(Boolean).join(' · ')}</p>

              {preVisit && (
                <div style={{ background: 'var(--color-accent-2-700)', color: 'var(--color-accent-2-100)', borderRadius: 'calc(var(--radius-lg) * 1.15)', padding: 'clamp(20px,2.6vw,30px)', maxWidth: 700 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, color: 'inherit' }}>Pre-visit summary</h3>
                    {preVisit.urgency && (
                      <span className="tag" style={{ background: 'var(--color-accent-400)', color: 'var(--color-accent-900)' }}>
                        Urgency: {preVisit.urgency}
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 12, opacity: 0.75, margin: '6px 0 var(--space-4)' }}>Prepared from the patient's own description. For preparation only — not a clinical assessment.</p>
                  {chiefComplaint && (
                    <>
                      <p style={{ fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', opacity: 0.7, margin: 0 }}>Chief complaint</p>
                      <p style={{ fontSize: 17, margin: '4px 0 var(--space-4)', textWrap: 'pretty' }}>{chiefComplaint}</p>
                    </>
                  )}
                  {preVisit.payload?.suggestedQuestions?.length > 0 && (
                    <>
                      <p style={{ fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', opacity: 0.7, margin: 0 }}>Suggested questions</p>
                      <ul style={{ fontSize: 15, lineHeight: 1.7, margin: '6px 0 0', paddingLeft: 20 }}>
                        {preVisit.payload.suggestedQuestions.map((q, i) => (
                          <li key={i}>{q}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  {preVisit.status === 'PENDING' && <p style={{ fontSize: 13, margin: 0 }}>Preparing summary…</p>}
                </div>
              )}

              {intake.length > 0 && (
                <>
                  <h3 style={{ margin: 'var(--space-8) 0 6px' }}>Patient's own words</h3>
                  <p style={{ fontSize: 12, opacity: 0.6, marginBottom: 'var(--space-4)' }}>This is exactly what the patient wrote.</p>
                  <div style={{ display: 'grid', gap: 'var(--space-3)', maxWidth: 700 }}>
                    {intake.map(([key, label]) => (
                      <div key={key} style={{ borderTop: '1px solid var(--color-divider)', paddingTop: 'var(--space-2)' }}>
                        <p style={{ fontSize: 12, opacity: 0.55, margin: 0 }}>{label}</p>
                        <p style={{ fontSize: 15, margin: '2px 0 0', textWrap: 'pretty' }}>{appointment.symptomForm[key]}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', marginTop: 'var(--space-8)' }}>
                {alreadyCompleted ? (
                  <Button onClick={() => setPhase('record')} style={{ padding: '12px 28px', fontSize: 15 }}>
                    {prescriptionLocked ? 'View prescription' : 'Add prescription'}
                  </Button>
                ) : (
                  <>
                    <Button onClick={() => setPhase('record')} style={{ padding: '12px 28px', fontSize: 15 }}>
                      Record consultation
                    </Button>
                    <Button variant="secondary" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}>
                      Cancel appointment
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}

          {(phase === 'record' || phase === 'done') && (
            <div>
              <h1 style={{ fontSize: 'clamp(28px,3.4vw,42px)', marginBottom: 'var(--space-6)' }}>{alreadyCompleted ? 'Visit notes' : 'Record the consultation'}</h1>

              {phase === 'done' && (
                <div style={{ background: 'var(--color-accent-2-100)', color: 'var(--color-accent-2-800)', borderRadius: 'var(--radius-md)', padding: '12px 18px', maxWidth: 700, marginBottom: 'var(--space-6)' }}>
                  Visit completed. A plain-language summary is being prepared for the patient and will be sent automatically.
                </div>
              )}
              {prescriptionLocked && phase !== 'done' && (
                <div style={{ background: 'var(--color-neutral-100)', borderRadius: 'var(--radius-md)', padding: '12px 18px', maxWidth: 700, marginBottom: 'var(--space-6)', fontSize: 13, opacity: 0.8 }}>
                  This prescription has already been submitted and can't be changed here.
                </div>
              )}

              {!alreadyCompleted && (
                <>
                  <Field label="Consultation notes" error={notesError ? 'Consultation notes are required.' : undefined} style={{ maxWidth: 700, marginBottom: 'var(--space-4)' }}>
                    <Textarea
                      style={{ borderRadius: 'var(--radius-lg)', minHeight: 170 }}
                      placeholder="Examination findings, impression, plan."
                      value={clinicalNotes}
                      onChange={(e) => setClinicalNotes(e.target.value)}
                    />
                    <p style={{ fontSize: 11, opacity: 0.6, margin: '5px 0 0' }}>
                      Write these for your own records. A plain-language version is generated for the patient automatically.
                    </p>
                  </Field>
                  <Field label="Diagnosis" style={{ maxWidth: 700, marginBottom: 'var(--space-8)' }}>
                    <Input placeholder="Optional. Shown to the patient in their summary." value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} />
                  </Field>
                </>
              )}

              <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0 }}>Prescription</h3>
                {!medsReadOnly && (
                  <button type="button" className="btn btn-ghost" onClick={() => setMeds((prev) => [...prev, emptyMed()])}>
                    + Add a medicine
                  </button>
                )}
              </div>
              <p style={{ fontSize: 12, opacity: 0.6, margin: '6px 0 var(--space-4)' }}>Add each medicine separately. Reminder times are generated from what you enter here.</p>

              <div style={{ display: 'grid', gap: 'var(--space-3)', maxWidth: 760 }}>
                {meds.map((m, i) => (
                  <div key={i} className="card" style={{ padding: 'var(--space-6)', gap: 'var(--space-3)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 'var(--space-3)' }}>
                      <Field label="Medicine name">
                        <Input value={m.drugName} onChange={(e) => updateMed(i, { drugName: e.target.value })} disabled={medsReadOnly} />
                      </Field>
                      <Field label="Dose">
                        <Input placeholder="500 mg, 1 tablet, 5 ml" value={m.dose} onChange={(e) => updateMed(i, { dose: e.target.value })} disabled={medsReadOnly} />
                      </Field>
                      <Field label="Frequency">
                        <Select value={m.frequency} onChange={(e) => updateMed(i, { frequency: e.target.value })} disabled={medsReadOnly}>
                          {FREQUENCIES.map((f) => (
                            <option key={f} value={f}>
                              {FREQUENCY_LABEL[f]}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Duration (days)">
                        <Input type="number" min="1" value={m.durationDays} onChange={(e) => updateMed(i, { durationDays: e.target.value })} disabled={medsReadOnly} />
                      </Field>
                      <Field label="Instructions" style={{ gridColumn: '1/-1' }}>
                        <Input
                          placeholder="after food, with water, before sleeping"
                          value={m.instructions}
                          onChange={(e) => updateMed(i, { instructions: e.target.value })}
                          disabled={medsReadOnly}
                        />
                      </Field>
                    </div>
                    <p style={{ fontSize: 13, color: 'var(--color-accent-2-700)', margin: 0 }}>Reminder times: {timesPreview(m.frequency)}</p>
                    {!medsReadOnly && (
                      <button type="button" className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setMeds((prev) => prev.filter((_, idx) => idx !== i))}>
                        Remove
                      </button>
                    )}
                  </div>
                ))}
                {meds.length === 0 && <p style={{ opacity: 0.65, fontSize: 14 }}>No medication prescribed for this visit.</p>}
              </div>

              {!alreadyCompleted && (
                <>
                  <h3 style={{ margin: 'var(--space-8) 0 var(--space-3)' }}>Follow-up</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 'var(--space-3)', maxWidth: 700 }}>
                    <Field label="Follow-up date" hint="Optional. The patient will be prompted to book on or after this date.">
                      <Input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
                    </Field>
                    <Field label="Follow-up instructions" hint="Optional.">
                      <Input placeholder="return if the fever persists beyond 3 days" value={followUpNotes} onChange={(e) => setFollowUpNotes(e.target.value)} />
                    </Field>
                  </div>
                </>
              )}

              {!medsReadOnly && (
                <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center', marginTop: 'var(--space-8)' }}>
                  <Button onClick={onSubmitVisit} disabled={completeMutation.isPending} style={{ padding: '12px 28px', fontSize: 15 }}>
                    {completeMutation.isPending ? 'Saving…' : alreadyCompleted ? 'Save prescription' : 'Save and complete visit'}
                  </Button>
                  <Button variant="secondary" onClick={() => setPhase('overview')}>
                    Back to overview
                  </Button>
                </div>
              )}
              {medsReadOnly && phase !== 'done' && (
                <div style={{ marginTop: 'var(--space-6)' }}>
                  <Button variant="secondary" onClick={() => setPhase('overview')}>
                    Back to overview
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div className="card" style={{ padding: 'var(--space-6)', gap: 6 }}>
            <h4 style={{ margin: '0 0 var(--space-2)' }}>{appointment.patient.fullName}</h4>
            <p style={{ fontSize: 13, margin: 0 }}>{[age, appointment.patient.gender, appointment.patient.bloodGroup].filter(Boolean).join(' · ')}</p>
            <p style={{ fontSize: 13, margin: 0, opacity: 0.75 }}>{[appointment.patient.email, appointment.patient.phone].filter(Boolean).join(' · ')}</p>
            {appointment.symptomForm?.allergies && (
              <p style={{ fontSize: 13, margin: 'var(--space-2) 0 0', color: 'var(--color-accent-700)', fontWeight: 700 }}>Allergies: {appointment.symptomForm.allergies}</p>
            )}
            {appointment.symptomForm?.currentMedications && (
              <p style={{ fontSize: 13, margin: 0, opacity: 0.8 }}>Currently taking: {appointment.symptomForm.currentMedications}</p>
            )}
            <div style={{ borderTop: '1px solid var(--color-divider)', marginTop: 'var(--space-3)', paddingTop: 'var(--space-3)', fontSize: 13, opacity: 0.8 }}>
              <p style={{ margin: 0 }}>{formatLongDate(new Date(appointment.startsAt), user.timezone)}</p>
              <p style={{ margin: '2px 0 0' }}>
                {formatTimeRange(new Date(appointment.startsAt), new Date(appointment.endsAt), user.timezone)} ·{' '}
                <Tag variant={appointment.status === 'COMPLETED' ? 'accent-2' : 'neutral'}>{appointment.status}</Tag>
              </p>
            </div>
          </div>
          <p style={{ fontSize: 12, opacity: 0.6, textWrap: 'pretty', margin: 0 }}>Visible to you and your doctor only. Never included in emails or calendar entries.</p>
        </aside>
      </div>
    </div>
  );
}
