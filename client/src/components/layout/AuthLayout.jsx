import { Link, Outlet } from 'react-router-dom';

export function AuthLayout() {
  return (
    <div className="pg" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(360px,1fr))', minHeight: '100vh' }}>
      <div
        style={{
          background: 'var(--color-accent-2-700)',
          color: 'var(--color-accent-2-100)',
          padding: 'clamp(28px,4vw,56px)',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <span style={{ position: 'absolute', left: -70, bottom: -70, width: 280, height: 280, borderRadius: 999, background: 'var(--color-accent-2-600)', opacity: 0.6 }} />
        <Link
          to="/"
          className="nav-brand"
          style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 9, color: 'inherit', textDecoration: 'none', fontSize: 20 }}
        >
          <span style={{ width: 15, height: 15, borderRadius: 999, background: 'var(--color-accent-400)', display: 'inline-block' }} />
          Curalis
        </Link>
        <div style={{ position: 'relative', marginTop: 'auto', maxWidth: '34ch' }}>
          <p style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(24px,2.6vw,34px)', lineHeight: 1.15, marginBottom: 'var(--space-4)' }}>
            Book with the right doctor, prepared.
          </p>
          <p style={{ fontSize: 14, opacity: 0.85, margin: 0 }}>
            Curalis supports communication between patients and their doctors. It does not provide medical advice,
            diagnosis, or emergency care.
          </p>
        </div>
      </div>

      <div style={{ padding: 'clamp(28px,4vw,56px)', display: 'flex', alignItems: 'center' }}>
        <div style={{ width: '100%', maxWidth: 460 }}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
