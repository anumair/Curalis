// Temporary stand-in for a page not built yet in this pass — swapped out
// for the real component as each one is implemented.
export function ComingSoon({ label }) {
  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: 'clamp(28px,4vw,52px) clamp(16px,4vw,28px) 96px' }}>
      <h1>{label}</h1>
      <p style={{ opacity: 0.7 }}>This page is being built.</p>
    </div>
  );
}
