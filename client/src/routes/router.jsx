import { createBrowserRouter } from 'react-router-dom'
import { LandingPage } from '@/features/booking/LandingPage'

// Role-guarded subtrees (patient/doctor/admin) are added here once auth
// exists (brief build order §19 step 3) — RequireAuth/RequireRole wrap each
// portal's route tree rather than every individual route.
export const router = createBrowserRouter([
  {
    path: '/',
    element: <LandingPage />,
  },
])
