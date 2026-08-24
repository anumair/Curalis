import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '../../context/AuthContext.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Field, Input } from '../../components/ui/Field.jsx';

const schema = z.object({
  email: z.string().min(1, 'Please enter your email address.').email('Please enter your email address.'),
  password: z.string().min(1, 'Please enter your password.'),
});

const HOME_ROUTE_BY_ROLE = { DOCTOR: '/doctor', ADMIN: '/admin', PATIENT: '/app' };

const DEMO_ACCOUNTS = {
  doctor: { email: 'dr.mehta@clinic.test', password: 'Password@123', label: 'Doctor sign-in (Dr. Rohan Mehta, Dermatology)' },
  admin: { email: 'admin@gmail.com', password: 'admin1234', label: 'Admin sign-in' },
  patient: { email: 'firstpatient@gmail.com', password: 'firstpatient123', label: 'Patient sign-in' },
};

export function SignInPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [demoLoading, setDemoLoading] = useState(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema) });

  async function signInWith(email, password) {
    setAuthError('');
    try {
      const user = await login(email, password);
      navigate(HOME_ROUTE_BY_ROLE[user.role] ?? '/app');
    } catch (err) {
      const code = err.response?.data?.error?.code;
      setAuthError(
        code === 'INVALID_CREDENTIALS'
          ? "That email and password combination doesn't match our records."
          : 'Something went wrong signing you in. Please try again.'
      );
    }
  }

  async function onSubmit(values) {
    await signInWith(values.email, values.password);
  }

  async function handleDemoSignIn(kind) {
    setDemoLoading(kind);
    const { email, password } = DEMO_ACCOUNTS[kind];
    await signInWith(email, password);
    setDemoLoading(null);
  }

  return (
    <div>
      <h1 style={{ fontSize: 'clamp(30px,3.6vw,42px)' }}>Sign in to Curalis</h1>
      <p style={{ opacity: 0.75, marginBottom: 'var(--space-6)' }}>Patients, doctors, and clinic administrators sign in here.</p>

      {authError && (
        <p style={{ background: 'var(--color-accent-100)', color: 'var(--color-accent-800)', padding: '10px 16px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
          {authError}
        </p>
      )}

      <form onSubmit={handleSubmit(onSubmit)}>
        <Field label="Email address" error={errors.email?.message} style={{ marginBottom: 'var(--space-3)' }}>
          <Input type="email" placeholder="you@example.com" {...register('email')} />
        </Field>
        <Field label="Password" error={errors.password?.message} style={{ marginBottom: 'var(--space-2)' }}>
          <Input type={showPassword ? 'text' : 'password'} placeholder="••••••••" {...register('password')} />
        </Field>
        <label className="radio" style={{ marginBottom: 'var(--space-6)' }}>
          <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} />
          <span className="dot" />
          Show password
        </label>
        <Button type="submit" block style={{ padding: 12 }} disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <p style={{ fontSize: 14, marginTop: 'var(--space-4)' }}>
        New patient? <Link to="/sign-up">Create an account</Link>
      </p>

      <div style={{ marginTop: 'var(--space-6)', paddingTop: 'var(--space-5)', borderTop: '1px solid var(--color-divider)' }}>
        <p style={{ fontSize: 13, opacity: 0.7, marginBottom: 'var(--space-3)' }}>For Demo:</p>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <Button
            type="button"
            variant="secondary"
            onClick={() => handleDemoSignIn('doctor')}
            disabled={demoLoading !== null}
          >
            {demoLoading === 'doctor' ? 'Signing in…' : 'Doctor sign-in'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => handleDemoSignIn('admin')}
            disabled={demoLoading !== null}
          >
            {demoLoading === 'admin' ? 'Signing in…' : 'Admin sign-in'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => handleDemoSignIn('patient')}
            disabled={demoLoading !== null}
          >
            {demoLoading === 'patient' ? 'Signing in…' : 'Patient sign-in'}
          </Button>
        </div>
      </div>
    </div>
  );
}
