import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { initialsOf } from '../../lib/initials.js';

const NAV_LINKS_BY_ROLE = {
  PATIENT: [
    { label: 'Dashboard', to: '/app' },
    { label: 'Find a doctor', to: '/doctors' },
    { label: 'Prescriptions', to: '/prescriptions' },
    { label: 'Settings', to: '/settings' },
  ],
  DOCTOR: [
    { label: 'Dashboard', to: '/doctor' },
    { label: 'Settings', to: '/settings' },
  ],
  ADMIN: [
    { label: 'Dashboard', to: '/admin' },
    { label: 'Notifications', to: '/admin/notifications' },
    { label: 'Settings', to: '/settings' },
  ],
};

// Wraps every authenticated route with the sticky nav header — the
// landing and auth pages build their own header inline instead, since
// those need a signed-out layout this component doesn't support.
export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const links = NAV_LINKS_BY_ROLE[user?.role] ?? [];

  async function handleSignOut() {
    await logout();
    navigate('/');
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', color: 'var(--color-text)', fontFamily: 'var(--font-body)' }}>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 30,
          background: 'color-mix(in srgb, var(--color-bg) 88%, transparent)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <div className="nav" style={{ maxWidth: 1180, margin: '0 auto', padding: '14px clamp(16px,4vw,28px)', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          <NavLink
            to={user?.role === 'DOCTOR' ? '/doctor' : user?.role === 'ADMIN' ? '/admin' : '/app'}
            className="nav-brand"
            style={{ textDecoration: 'none', color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: 9 }}
          >
            <span style={{ width: 15, height: 15, borderRadius: 999, background: 'var(--color-accent)', display: 'inline-block' }} />
            Curalis
          </NavLink>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                style={({ isActive }) => ({
                  fontSize: 14,
                  textDecoration: 'none',
                  padding: '4px 0',
                  borderBottom: '1px solid transparent',
                  color: isActive ? 'var(--color-accent)' : 'inherit',
                })}
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 'var(--space-4)' }}>
            <span
              style={{
                width: 30,
                height: 30,
                borderRadius: 999,
                background: 'var(--color-accent-2-200)',
                color: 'var(--color-accent-2-800)',
                display: 'grid',
                placeItems: 'center',
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {initialsOf(user?.fullName)}
            </span>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                handleSignOut();
              }}
              style={{ fontSize: 13, color: 'color-mix(in srgb, var(--color-text) 55%, transparent)', textDecoration: 'none' }}
            >
              Sign out
            </a>
          </span>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
