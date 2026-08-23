import { createBrowserRouter, Navigate } from 'react-router-dom';
import { LandingPage } from '@/features/landing/LandingPage.jsx';
import { AuthLayout } from '@/components/layout/AuthLayout.jsx';
import { SignInPage } from '@/features/auth/SignInPage.jsx';
import { SignUpPage } from '@/features/auth/SignUpPage.jsx';
import { AppShell } from '@/components/layout/AppShell.jsx';
import { ProtectedRoute } from './ProtectedRoute.jsx';
import { ComingSoon } from './ComingSoon.jsx';

export const router = createBrowserRouter([
  { path: '/', element: <LandingPage /> },
  {
    element: <AuthLayout />,
    children: [
      { path: '/sign-in', element: <SignInPage /> },
      { path: '/sign-up', element: <SignUpPage /> },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/settings', element: <ComingSoon label="Account settings" /> },

          // Patient
          {
            element: <ProtectedRoute roles={['PATIENT']} />,
            children: [
              { path: '/app', element: <ComingSoon label="Dashboard" /> },
              { path: '/doctors', element: <ComingSoon label="Find a doctor" /> },
              { path: '/book/:doctorId', element: <ComingSoon label="Book an appointment" /> },
              { path: '/appointments/:appointmentId', element: <ComingSoon label="Appointment details" /> },
              { path: '/prescriptions', element: <ComingSoon label="Prescriptions" /> },
            ],
          },

          // Doctor
          {
            element: <ProtectedRoute roles={['DOCTOR']} />,
            children: [
              { path: '/doctor', element: <ComingSoon label="Doctor dashboard" /> },
              { path: '/doctor/consultations/:appointmentId', element: <ComingSoon label="Consultation" /> },
            ],
          },

          // Admin
          {
            element: <ProtectedRoute roles={['ADMIN']} />,
            children: [
              { path: '/admin', element: <ComingSoon label="Admin dashboard" /> },
              { path: '/admin/doctors/new', element: <ComingSoon label="Add a doctor" /> },
              { path: '/admin/doctors/:doctorId', element: <ComingSoon label="Manage doctor" /> },
              { path: '/admin/notifications', element: <ComingSoon label="Notification log" /> },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
