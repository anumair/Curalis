import { createBrowserRouter, Navigate } from 'react-router-dom';
import { LandingPage } from '@/features/landing/LandingPage.jsx';
import { AuthLayout } from '@/components/layout/AuthLayout.jsx';
import { SignInPage } from '@/features/auth/SignInPage.jsx';
import { SignUpPage } from '@/features/auth/SignUpPage.jsx';
import { AppShell } from '@/components/layout/AppShell.jsx';
import { PatientDashboardPage } from '@/features/dashboard/PatientDashboardPage.jsx';
import { AppointmentDetailsPage } from '@/features/appointments/AppointmentDetailsPage.jsx';
import { FindDoctorPage } from '@/features/doctors/FindDoctorPage.jsx';
import { BookAppointmentPage } from '@/features/booking/BookAppointmentPage.jsx';
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
              { path: '/app', element: <PatientDashboardPage /> },
              { path: '/doctors', element: <FindDoctorPage /> },
              { path: '/book/:doctorId', element: <BookAppointmentPage /> },
              { path: '/appointments/:appointmentId', element: <AppointmentDetailsPage /> },
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
