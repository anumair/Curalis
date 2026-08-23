import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDoctorAdmin, createDoctor, updateDoctor, setWorkingHours, previewLeave, createLeave, deleteLeave } from '../../api/admin.js';
import { detectTimezone, timezoneOptions } from '../../lib/timezones.js';
import { formatLongDate } from '../../lib/format.js';
import { Field, Input, Textarea, Select } from '../../components/ui/Field.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Tag } from '../../components/ui/Tag.jsx';
import { Dialog, DialogTitle, DialogDescription, DialogActions, DialogClose } from '../../components/ui/Dialog.jsx';
import { useToast } from '../../components/ui/Toast.jsx';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function minutesToTime(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
function timeToMinutes(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function emptyDayRows() {
  return DAY_NAMES.map((_, dayOfWeek) => ({ dayOfWeek, enabled: false, periods: [{ start: '09:00', end: '17:00' }] }));
}

function rowsFromWorkingHours(workingHours) {
  const rows = emptyDayRows();
  for (const shift of workingHours) {
    const row = rows[shift.dayOfWeek];
    const period = { start: minutesToTime(shift.startMinute), end: minutesToTime(shift.endMinute) };
    if (!row.enabled) {
      row.enabled = true;
      row.periods = [period];
    } else {
      row.periods.push(period);
    }
  }
  return rows;
}

function rowsToShifts(rows) {
  return rows
    .filter((r) => r.enabled)
    .flatMap((r) => r.periods.map((p) => ({ dayOfWeek: r.dayOfWeek, startMinute: timeToMinutes(p.start), endMinute: timeToMinutes(p.end) })));
}

export function AddManageDoctorPage() {
  const { doctorId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const isNew = !doctorId;

  const doctorQuery = useQuery({ queryKey: ['admin-doctor', doctorId], queryFn: () => getDoctorAdmin(doctorId), enabled: !isNew });

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [timezone, setTimezone] = useState(detectTimezone());
  const [specialisation, setSpecialisation] = useState('');
  const [qualification, setQualification] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [consultationFee, setConsultationFee] = useState('');
  const [bio, setBio] = useState('');
  const [slotDurationMin, setSlotDurationMin] = useState(30);
  const [bookingHorizonDays, setBookingHorizonDays] = useState(30);
  const [minLeadTimeMin, setMinLeadTimeMin] = useState(60);
  const [isAcceptingPatients, setIsAcceptingPatients] = useState(true);
  const [rows, setRows] = useState(emptyDayRows());
  const [temporaryPassword, setTemporaryPassword] = useState(null);
  const [deactivateOpen, setDeactivateOpen] = useState(false);

  const [leaveScope, setLeaveScope] = useState('FULL_DAY');
  const [leaveFrom, setLeaveFrom] = useState('');
  const [leaveTo, setLeaveTo] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const [leavePreview, setLeavePreview] = useState(null);

  useEffect(() => {
    const doctor = doctorQuery.data;
    if (!doctor) return;
    setFullName(doctor.fullName);
    setEmail(doctor.email);
    setPhone(doctor.phone ?? '');
    setTimezone(doctor.timezone);
    setSpecialisation(doctor.specialisation);
    setQualification(doctor.qualification ?? '');
    setLicenseNumber(doctor.licenseNumber ?? '');
    setConsultationFee(String(doctor.consultationFee));
    setBio(doctor.bio ?? '');
    setSlotDurationMin(doctor.slotDurationMin);
    setBookingHorizonDays(doctor.bookingHorizonDays);
    setMinLeadTimeMin(doctor.minLeadTimeMin);
    setIsAcceptingPatients(doctor.isAcceptingPatients);
    setRows(rowsFromWorkingHours(doctor.workingHours));
  }, [doctorQuery.data]);

  const createMutation = useMutation({
    mutationFn: () =>
      createDoctor({
        fullName,
        email,
        phone: phone || undefined,
        timezone,
        specialisation,
        qualification: qualification || undefined,
        licenseNumber: licenseNumber || undefined,
        consultationFee: consultationFee ? Number(consultationFee) : undefined,
        bio: bio || undefined,
        slotDurationMin: Number(slotDurationMin),
        bookingHorizonDays: Number(bookingHorizonDays),
        minLeadTimeMin: Number(minLeadTimeMin),
        isAcceptingPatients,
      }),
    onSuccess: async (result) => {
      setTemporaryPassword(result.temporaryPassword);
      await setWorkingHours(result.user.id, rowsToShifts(rows));
      queryClient.invalidateQueries({ queryKey: ['admin-doctors'] });
      toast('Doctor created.');
      navigate(`/admin/doctors/${result.user.id}`, { replace: true });
    },
    onError: (err) => toast(err.response?.data?.error?.message ?? 'Could not create this doctor.'),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      await updateDoctor(doctorId, {
        fullName,
        phone: phone || undefined,
        timezone,
        specialisation,
        qualification: qualification || undefined,
        licenseNumber: licenseNumber || undefined,
        consultationFee: consultationFee ? Number(consultationFee) : undefined,
        bio: bio || undefined,
        slotDurationMin: Number(slotDurationMin),
        bookingHorizonDays: Number(bookingHorizonDays),
        minLeadTimeMin: Number(minLeadTimeMin),
        isAcceptingPatients,
      });
      await setWorkingHours(doctorId, rowsToShifts(rows));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-doctor', doctorId] });
      queryClient.invalidateQueries({ queryKey: ['admin-doctors'] });
      toast('Changes saved.');
    },
    onError: (err) => toast(err.response?.data?.error?.message ?? 'Could not save changes.'),
  });

  const deactivateMutation = useMutation({
    mutationFn: (isActive) => updateDoctor(doctorId, { isActive }),
    onSuccess: (_, isActive) => {
      queryClient.invalidateQueries({ queryKey: ['admin-doctor', doctorId] });
      queryClient.invalidateQueries({ queryKey: ['admin-doctors'] });
      toast(isActive ? 'Doctor reactivated.' : 'Doctor deactivated.');
      setDeactivateOpen(false);
    },
  });

  const previewMutation = useMutation({
    mutationFn: () =>
      previewLeave(
        doctorId,
        leaveScope === 'FULL_DAY'
          ? { scope: 'FULL_DAY', date: leaveFrom, reason: leaveReason || undefined }
          : { scope: 'PARTIAL', startsAt: new Date(leaveFrom).toISOString(), endsAt: new Date(leaveTo).toISOString(), reason: leaveReason || undefined }
      ),
    onSuccess: (result) => setLeavePreview(result),
    onError: () => toast('Could not preview this leave period.'),
  });

  const confirmLeaveMutation = useMutation({
    mutationFn: () =>
      createLeave(
        doctorId,
        leaveScope === 'FULL_DAY'
          ? { scope: 'FULL_DAY', date: leaveFrom, reason: leaveReason || undefined }
          : { scope: 'PARTIAL', startsAt: new Date(leaveFrom).toISOString(), endsAt: new Date(leaveTo).toISOString(), reason: leaveReason || undefined }
      ),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['admin-doctor', doctorId] });
      toast(`Leave recorded. ${result.affectedCount} appointment${result.affectedCount === 1 ? '' : 's'} cancelled.`);
      setLeavePreview(null);
      setLeaveFrom('');
      setLeaveTo('');
      setLeaveReason('');
    },
    onError: () => toast('Could not record this leave.'),
  });

  const removeLeaveMutation = useMutation({
    mutationFn: (leaveId) => deleteLeave(leaveId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-doctor', doctorId] });
      toast('Leave removed.');
    },
  });

  function toggleDay(dayOfWeek) {
    setRows((prev) => prev.map((r) => (r.dayOfWeek === dayOfWeek ? { ...r, enabled: !r.enabled } : r)));
  }
  function updatePeriod(dayOfWeek, index, patch) {
    setRows((prev) =>
      prev.map((r) => (r.dayOfWeek === dayOfWeek ? { ...r, periods: r.periods.map((p, i) => (i === index ? { ...p, ...patch } : p)) } : r))
    );
  }
  function addPeriod(dayOfWeek) {
    setRows((prev) => prev.map((r) => (r.dayOfWeek === dayOfWeek ? { ...r, periods: [...r.periods, { start: '09:00', end: '17:00' }] } : r)));
  }
  function removePeriod(dayOfWeek, index) {
    setRows((prev) => prev.map((r) => (r.dayOfWeek === dayOfWeek ? { ...r, periods: r.periods.filter((_, i) => i !== index) } : r)));
  }

  if (!isNew && doctorQuery.isLoading) {
    return (
      <div className="pg" style={{ maxWidth: 1180, margin: '0 auto', padding: 'clamp(28px,4vw,52px) clamp(16px,4vw,28px) 96px' }}>
        <p style={{ opacity: 0.6 }}>Loading…</p>
      </div>
    );
  }
  const doctor = doctorQuery.data;
  const saving = createMutation.isPending || updateMutation.isPending;

  function onSave() {
    if (isNew) createMutation.mutate();
    else updateMutation.mutate();
  }

  return (
    <div className="pg" style={{ maxWidth: 1180, margin: '0 auto', padding: 'clamp(28px,4vw,52px) clamp(16px,4vw,28px) 96px' }}>
      <Link to="/admin" style={{ fontSize: 13 }}>
        ← Back to clinic administration
      </Link>
      <h1 style={{ fontSize: 'clamp(30px,3.8vw,46px)', margin: 'var(--space-6) 0 4px' }}>{isNew ? 'Add a doctor' : doctor?.fullName}</h1>
      <p style={{ opacity: 0.7, marginBottom: 'var(--space-8)' }}>{isNew ? 'Creates a sign-in for a new doctor and their public profile.' : doctor?.specialisation}</p>

      {temporaryPassword && (
        <div style={{ background: 'var(--color-accent-2-100)', color: 'var(--color-accent-2-800)', borderRadius: 'var(--radius-md)', padding: '12px 18px', maxWidth: 700, marginBottom: 'var(--space-6)' }}>
          Temporary password for {email}: <strong>{temporaryPassword}</strong> — share this with the doctor; they should change it after signing in.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 'var(--space-8)', alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 'var(--space-8)', minWidth: 0 }}>
          <section>
            <h3 style={{ marginBottom: 'var(--space-4)' }}>Account details</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 'var(--space-3)' }}>
              <Field label="Full name">
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </Field>
              <Field label="Email address" hint={isNew ? 'The doctor signs in with this and receives appointment notifications here.' : undefined}>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!isNew} />
              </Field>
              <Field label="Phone number">
                <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </Field>
              <Field label="Time zone" hint="Working hours below are interpreted in this time zone.">
                <Select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                  {timezoneOptions().map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </section>

          <section>
            <h3 style={{ marginBottom: 'var(--space-4)' }}>Professional details</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 'var(--space-3)' }}>
              <Field label="Specialisation" hint="Patients search by this.">
                <Input value={specialisation} onChange={(e) => setSpecialisation(e.target.value)} />
              </Field>
              <Field label="Qualification">
                <Input placeholder="MBBS, MD (General Medicine)" value={qualification} onChange={(e) => setQualification(e.target.value)} />
              </Field>
              <Field label="Medical licence number">
                <Input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} />
              </Field>
              <Field label="Consultation fee">
                <Input type="number" min="0" value={consultationFee} onChange={(e) => setConsultationFee(e.target.value)} />
              </Field>
              <Field label="Biography" style={{ gridColumn: '1/-1' }} hint="Shown to patients on the doctor's profile.">
                <Textarea style={{ borderRadius: 'var(--radius-lg)' }} value={bio} onChange={(e) => setBio(e.target.value)} />
              </Field>
            </div>
          </section>

          <section>
            <h3 style={{ marginBottom: 'var(--space-4)' }}>Appointment settings</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 'var(--space-3)' }}>
              <Field label="Consultation length (minutes)" hint="This also sets the spacing between bookable times.">
                <Input type="number" min="1" value={slotDurationMin} onChange={(e) => setSlotDurationMin(e.target.value)} />
              </Field>
              <Field label="How far ahead patients can book (days)">
                <Input type="number" min="1" value={bookingHorizonDays} onChange={(e) => setBookingHorizonDays(e.target.value)} />
              </Field>
              <Field label="Minimum notice before a booking (minutes)" hint="Prevents last-minute bookings.">
                <Input type="number" min="0" value={minLeadTimeMin} onChange={(e) => setMinLeadTimeMin(e.target.value)} />
              </Field>
              <Field label="Accepting appointments">
                <label className="radio" style={{ marginTop: 6 }}>
                  <input type="checkbox" checked={isAcceptingPatients} onChange={(e) => setIsAcceptingPatients(e.target.checked)} />
                  <span className="dot" />
                  {isAcceptingPatients ? 'Accepting' : 'Not accepting'}
                </label>
                <p style={{ fontSize: 11, opacity: 0.6, margin: '5px 0 0' }}>
                  When switched off, this doctor won't appear in patient searches and no new bookings can be made. Existing appointments are unaffected.
                </p>
              </Field>
            </div>
          </section>

          <section>
            <h3 style={{ marginBottom: 6 }}>Working hours</h3>
            <p style={{ fontSize: 12, opacity: 0.6, marginBottom: 'var(--space-4)' }}>Times are in the doctor's time zone. For a lunch break or a split shift, add two periods for the same day.</p>
            <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
              {rows.map((row) => (
                <div key={row.dayOfWeek} className="card" style={{ padding: 'var(--space-3) var(--space-6)', gap: 'var(--space-2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
                    <label className="radio" style={{ minWidth: 150 }}>
                      <input type="checkbox" checked={row.enabled} onChange={() => toggleDay(row.dayOfWeek)} />
                      <span className="dot" />
                      {DAY_NAMES[row.dayOfWeek]}
                    </label>
                    {row.enabled && (
                      <>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 200 }}>
                          {row.periods.map((p, i) => (
                            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <input className="input" type="time" value={p.start} onChange={(e) => updatePeriod(row.dayOfWeek, i, { start: e.target.value })} style={{ padding: '6px 10px' }} />
                              <span style={{ fontSize: 13, opacity: 0.6 }}>to</span>
                              <input className="input" type="time" value={p.end} onChange={(e) => updatePeriod(row.dayOfWeek, i, { end: e.target.value })} style={{ padding: '6px 10px' }} />
                              {row.periods.length > 1 && (
                                <button type="button" className="btn btn-ghost" onClick={() => removePeriod(row.dayOfWeek, i)}>
                                  Remove
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                        <button type="button" className="btn btn-ghost" onClick={() => addPeriod(row.dayOfWeek)}>
                          Add another period
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {!isNew && (
            <section>
              <h3 style={{ marginBottom: 6 }}>Leave</h3>
              <p style={{ fontSize: 12, opacity: 0.6, marginBottom: 'var(--space-4)' }}>Mark this doctor unavailable. Patients with appointments in that period are notified automatically.</p>

              {doctor?.leaves.map((l) => (
                <div key={l.id} className="card" style={{ padding: 'var(--space-4) var(--space-6)', marginBottom: 'var(--space-4)', flexDirection: 'row', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
                  <span style={{ flex: 1, minWidth: 220, fontSize: 14 }}>
                    {formatLongDate(new Date(l.startsAt), timezone)} – {formatLongDate(new Date(l.endsAt), timezone)}
                    {l.reason && <span style={{ display: 'block', fontSize: 12, opacity: 0.65 }}>{l.reason}</span>}
                  </span>
                  <button type="button" className="btn btn-ghost" onClick={() => removeLeaveMutation.mutate(l.id)}>
                    Remove
                  </button>
                </div>
              ))}

              {!leavePreview ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 'var(--space-3)' }}>
                    <Field label="Leave type">
                      <Select value={leaveScope} onChange={(e) => setLeaveScope(e.target.value)}>
                        <option value="FULL_DAY">Full day</option>
                        <option value="PARTIAL">Part of a day</option>
                      </Select>
                    </Field>
                    {leaveScope === 'FULL_DAY' ? (
                      <Field label="Date">
                        <Input type="date" value={leaveFrom} onChange={(e) => setLeaveFrom(e.target.value)} />
                      </Field>
                    ) : (
                      <>
                        <Field label="From">
                          <Input type="datetime-local" value={leaveFrom} onChange={(e) => setLeaveFrom(e.target.value)} />
                        </Field>
                        <Field label="To">
                          <Input type="datetime-local" value={leaveTo} onChange={(e) => setLeaveTo(e.target.value)} />
                        </Field>
                      </>
                    )}
                    <Field label="Reason" style={{ gridColumn: '1/-1' }}>
                      <Input placeholder="Optional. Shown to clinic staff only, never to patients." value={leaveReason} onChange={(e) => setLeaveReason(e.target.value)} />
                    </Field>
                  </div>
                  <Button style={{ marginTop: 'var(--space-3)' }} onClick={() => previewMutation.mutate()} disabled={!leaveFrom || previewMutation.isPending}>
                    Check for conflicts
                  </Button>
                </>
              ) : (
                <div style={{ background: 'var(--color-accent-200)', borderRadius: 'calc(var(--radius-lg) * 1.15)', padding: 'var(--space-6)' }}>
                  <h4 style={{ marginBottom: 6 }}>
                    {leavePreview.affectedAppointments.length} appointment{leavePreview.affectedAppointments.length === 1 ? '' : 's'} will be cancelled
                  </h4>
                  <p style={{ fontSize: 14, color: 'var(--color-accent-900)', textWrap: 'pretty' }}>Each patient will be emailed immediately with a link to rebook.</p>
                  {leavePreview.affectedAppointments.length > 0 && (
                    <div style={{ overflowX: 'auto' }}>
                      <table className="table" style={{ minWidth: 480 }}>
                        <thead>
                          <tr>
                            <th>Patient</th>
                            <th>Email</th>
                            <th>When</th>
                          </tr>
                        </thead>
                        <tbody>
                          {leavePreview.affectedAppointments.map((c) => (
                            <tr key={c.appointmentId}>
                              <td>{c.patientName}</td>
                              <td style={{ fontSize: 13 }}>{c.patientEmail}</td>
                              <td style={{ fontSize: 13 }}>{formatLongDate(new Date(c.startsAt), timezone)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <p style={{ fontSize: 13, color: 'var(--color-accent-900)', margin: 'var(--space-3) 0' }}>These appointments cannot be restored after cancelling.</p>
                  <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    <Button onClick={() => confirmLeaveMutation.mutate()} disabled={confirmLeaveMutation.isPending}>
                      Confirm and notify patients
                    </Button>
                    <Button variant="secondary" onClick={() => setLeavePreview(null)}>
                      Go back
                    </Button>
                  </div>
                </div>
              )}
            </section>
          )}

          {!isNew && doctor?.upcomingAppointments.length > 0 && (
            <section>
              <h3 style={{ marginBottom: 'var(--space-3)' }}>Upcoming appointments</h3>
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ minWidth: 480 }}>
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Patient</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {doctor.upcomingAppointments.map((u) => (
                      <tr key={u.id}>
                        <td>{formatLongDate(new Date(u.startsAt), timezone)}</td>
                        <td>{u.patientName}</td>
                        <td>
                          <Tag variant="accent-2">{u.status}</Tag>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div className="card" style={{ padding: 'var(--space-6)', gap: 'var(--space-2)' }}>
            <Button block style={{ margin: 0 }} onClick={onSave} disabled={saving}>
              {saving ? 'Saving…' : isNew ? 'Create doctor' : 'Save changes'}
            </Button>
            {!isNew && (
              <Button variant="secondary" block style={{ margin: 0 }} onClick={() => setDeactivateOpen(true)}>
                {doctor?.isActive ? 'Deactivate this account' : 'Reactivate this account'}
              </Button>
            )}
          </div>
        </aside>
      </div>

      {!isNew && (
        <Dialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
          <DialogTitle>{doctor?.isActive ? `Deactivate ${doctor?.fullName}?` : `Reactivate ${doctor?.fullName}?`}</DialogTitle>
          <DialogDescription>
            {doctor?.isActive
              ? "They won't be able to sign in and won't appear in patient searches. Existing appointments are not cancelled."
              : "They'll be able to sign in and appear in patient searches again."}
          </DialogDescription>
          <DialogActions>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <Button onClick={() => deactivateMutation.mutate(!doctor?.isActive)} disabled={deactivateMutation.isPending}>
              {doctor?.isActive ? 'Deactivate' : 'Reactivate'}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </div>
  );
}
