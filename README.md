# Curalis

A clinic appointment and follow-up platform. Patients book with doctors, describe their
symptoms up front, and get a plain-language summary and medication reminders after the
visit. Doctors get an AI-prepared brief before each consultation. Admins manage doctors,
working hours, leave, and notification delivery.

## Live deployment

- **App**: [curalis-beta.vercel.app](https://curalis-beta.vercel.app)
- **API**: [curalis-production.up.railway.app](https://curalis-production.up.railway.app)
- **API docs**: [curalis-production.up.railway.app/api-docs](https://curalis-production.up.railway.app/api-docs)

Frontend on Vercel; API and background worker as two separate services on Railway,
sharing a Neon Postgres instance. See [Sign in](https://curalis-beta.vercel.app/sign-in)
for one-click demo accounts (doctor, patient, admin).

## Stack

- **Client**: React 18, Vite, plain CSS (no Tailwind), React Router v7, TanStack Query,
  react-hook-form + zod
- **Server**: Node/Express, Prisma + PostgreSQL, pg-boss (background jobs), JWT auth
- **Integrations**: OpenAI (visit summaries), SendGrid (email), Google Calendar (event sync)

## Project structure

```
client/   React frontend (Vite)
server/   Express API + background worker + Prisma schema/migrations
```

The server runs as two processes: the API (`server.js`) and a background worker
(`worker.js`) that sends emails, generates AI summaries, dispatches medication reminders,
and syncs Google Calendar events. Both need to be running for the app to fully work.

## Setup

1. **Database**: either run Postgres locally via `docker-compose up -d`, or point
   `DATABASE_URL` at a hosted Postgres instance (e.g. Neon).

2. **Server**

   ```bash
   cd server
   npm install
   cp .env.example .env   # fill in the values (see below)
   npm run prisma:migrate
   npm run seed            # creates an admin + a few demo doctors/patients
   npm run dev              # API on :4000
   npm run worker            # in a separate terminal — background jobs
   ```

3. **Client**

   ```bash
   cd client
   npm install
   echo "VITE_API_BASE_URL=http://localhost:4000" > .env
   npm run dev               # :5173
   ```

### Environment variables (`server/.env`)

See `server/.env.example` for the full list. At minimum you'll need:

- `DATABASE_URL` — Postgres connection string
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — any random strings
- `CALENDAR_TOKEN_KEY` — 32-byte hex string (`openssl rand -hex 32`)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — only needed for Google Calendar sync
- `SENDGRID_API_KEY`, `MAIL_FROM` — only needed for real email delivery
- `OPENAI_API_KEY` — only needed for AI visit summaries
- `ADMIN_SEED_EMAIL`, `ADMIN_SEED_PASSWORD` — used by `npm run seed`

The app degrades gracefully in dev without the third-party keys (bookings, prescriptions,
and the rest of the core flow all work); AI summaries and calendar sync just won't run.

## API docs

With the server running, browse the full OpenAPI reference at `http://localhost:4000/api-docs`
(spec source: `server/openapi.json`).

## Tests

```bash
cd server
docker-compose up -d postgres   # if not already running
npm test
```

Runs against a disposable `curalis_test` database in the same local Postgres container
(config in `server/.env.test`, all dummy values — never the real Neon instance). Apply
migrations to it once before the first run:

```bash
DATABASE_URL="postgresql://curalis:curalis@localhost:5432/curalis_test?schema=public" npx prisma migrate deploy
```

Covers auth (register/login/refresh rotation/reuse-detection/logout/RBAC), the booking
lifecycle (hold/confirm/cancel/reschedule, double-booking rejection, hold expiry and the
sweeper that reclaims it), availability (working-hours-to-UTC conversion, leave, expired
holds), the failed-notification retry path and its atomic claim query, AI response-schema
validation, and the Google Calendar terminal-error classification (invalid grant vs.
insufficient scope). No test hits a real SendGrid/OpenAI/Google endpoint.

## Notes

- Demo accounts and passwords are printed by `npm run seed`.
- `server/prisma/migrations/` includes a hand-written exclusion constraint that prevents
  double-booking a doctor's slot at the database level — this is what the "hold" step in
  booking actually relies on for correctness under concurrent requests.
