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
import { PrescriptionsPage } from '@/features/prescriptions/PrescriptionsPage.jsx';
import { DoctorDashboardPage } from '@/features/doctor/DoctorDashboardPage.jsx';
import { ConsultationPage } from '@/features/doctor/ConsultationPage.jsx';
import { AdminDashboardPage } from '@/features/admin/AdminDashboardPage.jsx';
import { AddManageDoctorPage } from '@/features/admin/AddManageDoctorPage.jsx';
import { NotificationLogPage } from '@/features/admin/NotificationLogPage.jsx';
import { SettingsPage } from '@/features/settings/SettingsPage.jsx';
import { ProtectedRoute } from './ProtectedRoute.jsx';

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
          { path: '/settings', element: <SettingsPage /> },

          // Patient
          {
            element: <ProtectedRoute roles={['PATIENT']} />,
            children: [
              { path: '/app', element: <PatientDashboardPage /> },
              { path: '/doctors', element: <FindDoctorPage /> },
              { path: '/book/:doctorId', element: <BookAppointmentPage /> },
              { path: '/appointments/:appointmentId', element: <AppointmentDetailsPage /> },
              { path: '/prescriptions', element: <PrescriptionsPage /> },
            ],
          },

          // Doctor
          {
            element: <ProtectedRoute roles={['DOCTOR']} />,
            children: [
              { path: '/doctor', element: <DoctorDashboardPage /> },
              { path: '/doctor/consultations/:appointmentId', element: <ConsultationPage /> },
            ],
          },

          // Admin
          {
            element: <ProtectedRoute roles={['ADMIN']} />,
            children: [
              { path: '/admin', element: <AdminDashboardPage /> },
              { path: '/admin/doctors/new', element: <AddManageDoctorPage /> },
              { path: '/admin/doctors/:doctorId', element: <AddManageDoctorPage /> },
              { path: '/admin/notifications', element: <NotificationLogPage /> },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
