import { Link } from 'react-router-dom';

const HOW_IT_WORKS = [
  { n: 1, title: 'Find your doctor', body: 'Search by specialisation and see real available times.' },
  { n: 2, title: "Tell us what's wrong", body: 'Describe your symptoms while booking. It takes two minutes.' },
  { n: 3, title: 'Your doctor is briefed', body: 'Curalis prepares a summary of your symptoms before you arrive.' },
  { n: 4, title: 'Take the visit home', body: 'Get a plain-language summary, your medication schedule, and reminders.' },
];

const WHAT_YOU_GET = [
  { title: 'Real-time availability', body: "Slots update as they're booked. What you see is bookable." },
  { title: 'Symptom intake', body: 'Your doctor reads your history before the consultation starts, not during it.' },
  { title: 'Plain-language summaries', body: 'Clinical notes rewritten so they make sense without a medical degree.' },
  { title: 'Medication reminders', body: 'Timed to your prescription, delivered to your inbox.' },
  { title: 'Calendar sync', body: 'Appointments land in your Google Calendar, and update themselves when plans change.' },
  { title: 'Email at every step', body: 'Confirmation, reminders, and immediate notice if anything changes.' },
];

export function LandingPage() {
  return (
    <div className="pg" style={{ minHeight: '100vh', background: 'var(--color-bg)', color: 'var(--color-text)', fontFamily: 'var(--font-body)' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '20px clamp(16px,4vw,28px) 0', display: 'flex', alignItems: 'center', gap: 16 }}>
        <span className="nav-brand" style={{ display: 'flex', alignItems: 'center', gap: 9, marginRight: 'auto', fontSize: 18 }}>
          <span style={{ width: 15, height: 15, borderRadius: 999, background: 'var(--color-accent)', display: 'inline-block' }} />
          Curalis
        </span>
        <Link className="btn btn-ghost" to="/sign-in">Sign in</Link>
        <Link className="btn btn-primary" to="/sign-up">Create an account</Link>
      </div>

      <section style={{ position: 'relative', maxWidth: 1180, margin: '0 auto', padding: 'clamp(40px,7vw,96px) clamp(16px,4vw,28px) clamp(48px,6vw,80px)', overflow: 'hidden' }}>
        <span style={{ position: 'absolute', right: -90, top: 10, width: 340, height: 340, borderRadius: 999, background: 'var(--color-accent-200)', opacity: 0.55 }} />
        <span style={{ position: 'absolute', right: 150, top: 230, width: 170, height: 170, borderRadius: 999, background: 'var(--color-accent-2-200)', opacity: 0.7 }} />
        <div style={{ position: 'relative', maxWidth: 780 }}>
          <span className="tag tag-accent-2" style={{ marginBottom: 'var(--space-4)' }}>Clinic appointments, end to end</span>
          <h1 style={{ fontSize: 'clamp(40px,6.6vw,76px)', lineHeight: 1.02, margin: 'var(--space-3) 0 var(--space-4)', maxWidth: '14ch' }}>
            Book with the right doctor, prepared.
          </h1>
          <p style={{ fontSize: 'clamp(16px,1.7vw,19px)', lineHeight: 1.6, maxWidth: '60ch', textWrap: 'pretty', opacity: 0.85 }}>
            Curalis connects patients with clinic doctors and makes the visit itself work better. Share what you're
            experiencing when you book, so your doctor arrives prepared. Leave with a summary you can actually read, a
            medication schedule you won't forget, and everything already on your calendar.
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', marginTop: 'var(--space-6)' }}>
            <Link className="btn btn-primary" to="/sign-up" style={{ fontSize: 16, padding: '12px 28px' }}>Create an account</Link>
            <Link className="btn btn-secondary" to="/sign-in" style={{ fontSize: 16, padding: '12px 28px' }}>Sign in</Link>
          </div>
        </div>
      </section>

      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '0 clamp(16px,4vw,28px) clamp(48px,6vw,88px)' }}>
        <h2 style={{ fontSize: 'clamp(28px,3.4vw,40px)', marginBottom: 'var(--space-6)' }}>How it works</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 'var(--space-4)' }}>
          {HOW_IT_WORKS.map((step) => (
            <div key={step.n} className="card elev-sm" style={{ padding: 'var(--space-6)' }}>
              <span
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 999,
                  background: 'var(--color-accent)',
                  color: 'var(--color-bg)',
                  display: 'grid',
                  placeItems: 'center',
                  fontFamily: 'var(--font-heading)',
                  fontSize: 17,
                }}
              >
                {step.n}
              </span>
              <h4 style={{ margin: 'var(--space-2) 0 0' }}>{step.title}</h4>
              <p className="card-body" style={{ fontSize: 14 }}>{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '0 clamp(16px,4vw,28px) clamp(48px,6vw,88px)' }}>
        <h2 style={{ fontSize: 'clamp(28px,3.4vw,40px)', marginBottom: 'var(--space-6)' }}>What you get</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 'var(--space-6) var(--space-8)' }}>
          {WHAT_YOU_GET.map((item) => (
            <div key={item.title} style={{ borderTop: '1px solid var(--color-divider)', paddingTop: 'var(--space-3)' }}>
              <h4 style={{ marginBottom: 6 }}>{item.title}</h4>
              <p style={{ fontSize: 14, opacity: 0.8, margin: 0, textWrap: 'pretty' }}>{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '0 clamp(16px,4vw,28px) clamp(48px,6vw,88px)' }}>
        <div style={{ background: 'var(--color-accent-2-200)', borderRadius: 'calc(var(--radius-lg) * 1.15)', padding: 'clamp(28px,4vw,52px)', maxWidth: 760 }}>
          <h2 style={{ fontSize: 'clamp(26px,3vw,36px)', marginBottom: 'var(--space-3)' }}>Working at a clinic?</h2>
          <p style={{ fontSize: 16, margin: 0, maxWidth: '56ch', textWrap: 'pretty', color: 'var(--color-accent-2-900)' }}>
            Doctor accounts are created by your clinic administrator. If you're expecting access, check your email for
            your sign-in details, or contact your administrator.
          </p>
        </div>
      </section>

      <footer style={{ borderTop: '1px solid var(--color-divider)', marginTop: 'var(--space-8)' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: 'clamp(32px,4vw,56px) clamp(16px,4vw,28px)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 'var(--space-6)' }}>
          <div>
            <span className="nav-brand" style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 20 }}>
              <span style={{ width: 15, height: 15, borderRadius: 999, background: 'var(--color-accent)', display: 'inline-block' }} />
              Curalis
            </span>
            <p style={{ fontSize: 14, opacity: 0.75, marginTop: 'var(--space-2)' }}>A clinic appointment and follow-up platform.</p>
            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <Link to="/sign-in" style={{ fontSize: 14 }}>Sign in</Link>
              <Link to="/sign-up" style={{ fontSize: 14 }}>Create an account</Link>
            </div>
          </div>
          <div style={{ maxWidth: '46ch' }}>
            <p style={{ fontSize: 13, opacity: 0.7, textWrap: 'pretty' }}>
              Curalis supports communication between patients and their doctors. It does not provide medical advice,
              diagnosis, or emergency care.
            </p>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-accent-700)', margin: 0, textWrap: 'pretty' }}>
              If this is a medical emergency, call your local emergency number immediately.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
