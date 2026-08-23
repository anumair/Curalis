import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '../../context/AuthContext.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Field, Input, Select } from '../../components/ui/Field.jsx';
import { detectTimezone, timezoneOptions } from '../../lib/timezones.js';

const schema = z
  .object({
    fullName: z.string().min(1, 'Full name is required'),
    email: z.string().email('Please enter a valid email address.'),
    password: z.string().min(8, 'At least 8 characters, with one number.').regex(/\d/, 'At least 8 characters, with one number.'),
    confirmPassword: z.string(),
    phone: z.string().optional(),
    dateOfBirth: z.string().optional(),
    gender: z.string().optional(),
    bloodGroup: z.string().optional(),
    timezone: z.string().min(1),
  })
  .refine((data) => data.password === data.confirmPassword, { message: "Passwords don't match.", path: ['confirmPassword'] });

const GENDER_OPTIONS = [
  { value: '', label: 'Prefer not to say' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'MALE', label: 'Male' },
  { value: 'OTHER', label: 'Other' },
  { value: 'UNDISCLOSED', label: 'Prefer not to specify' },
];

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export function SignUpPage() {
  const { register: registerUser } = useAuth();
  const navigate = useNavigate();
  const [formError, setFormError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { timezone: detectTimezone() } });

  async function onSubmit(values) {
    setFormError('');
    const { confirmPassword: _confirmPassword, ...payload } = values;
    if (!payload.gender) delete payload.gender;
    if (!payload.dateOfBirth) delete payload.dateOfBirth;
    if (!payload.bloodGroup) delete payload.bloodGroup;
    if (!payload.phone) delete payload.phone;

    try {
      await registerUser(payload);
      navigate('/app');
    } catch (err) {
      const code = err.response?.data?.error?.code;
      setFormError(code === 'EMAIL_TAKEN' ? 'An account with that email already exists.' : 'Something went wrong creating your account. Please try again.');
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 'clamp(28px,3.4vw,40px)' }}>Create your Curalis account</h1>
      <p style={{ opacity: 0.75, marginBottom: 'var(--space-6)' }}>Book appointments, track prescriptions, and keep everything in one place.</p>

      {formError && (
        <p style={{ background: 'var(--color-accent-100)', color: 'var(--color-accent-800)', padding: '10px 16px', borderRadius: 'var(--radius-md)', fontSize: 13, marginBottom: 'var(--space-4)' }}>
          {formError}
        </p>
      )}

      <form onSubmit={handleSubmit(onSubmit)}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 'var(--space-3)' }}>
          <Field label="Full name" error={errors.fullName?.message} style={{ gridColumn: '1/-1' }}>
            <Input placeholder="Maya Okonjo" {...register('fullName')} />
          </Field>
          <Field
            label="Email address"
            error={errors.email?.message}
            hint={!errors.email ? "You'll sign in with this, and we'll send appointment updates here." : undefined}
            style={{ gridColumn: '1/-1' }}
          >
            <Input type="email" placeholder="you@example.com" {...register('email')} />
          </Field>
          <Field label="Password" error={errors.password?.message} hint={!errors.password ? 'At least 8 characters, with one number.' : undefined}>
            <Input type="password" {...register('password')} />
          </Field>
          <Field label="Confirm password" error={errors.confirmPassword?.message}>
            <Input type="password" {...register('confirmPassword')} />
          </Field>
          <Field label="Phone number" hint="Optional. Used only if the clinic needs to reach you about an appointment.">
            <Input type="tel" {...register('phone')} />
          </Field>
          <Field label="Date of birth">
            <Input type="date" {...register('dateOfBirth')} />
          </Field>
          <Field label="Gender">
            <Select {...register('gender')}>
              {GENDER_OPTIONS.map((opt) => (
                <option key={opt.label} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Blood group">
            <Select {...register('bloodGroup')}>
              <option value="">Prefer not to say</option>
              {BLOOD_GROUPS.map((bg) => (
                <option key={bg} value={bg}>
                  {bg}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Time zone"
            style={{ gridColumn: '1/-1' }}
            hint="Detected from your device. Change it if you're travelling or this looks wrong. We use this to schedule your medication reminders at sensible hours."
          >
            <Select {...register('timezone')}>
              {timezoneOptions().map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Button type="submit" block style={{ padding: 12, marginTop: 'var(--space-4)' }} disabled={isSubmitting}>
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </Button>
      </form>

      <p style={{ fontSize: 14, marginTop: 'var(--space-4)' }}>
        Already have an account? <Link to="/sign-in">Sign in</Link>
      </p>
      <p style={{ background: 'var(--color-accent-2-100)', color: 'var(--color-accent-2-800)', padding: '12px 16px', borderRadius: 'var(--radius-md)', fontSize: 13, marginTop: 'var(--space-4)', textWrap: 'pretty' }}>
        Doctor and administrator accounts are created by the clinic. This form registers patients only.
      </p>
    </div>
  );
}
