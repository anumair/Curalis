# Healthcare Appointment & Follow-up Manager — Engineering Brief

**Purpose of this document.** This is the agreed design. Every decision below has already been debated and settled — implement it as written. Where an alternative was considered and rejected, it is recorded in §17 with the reason. Do not reintroduce a rejected option without raising it first.

**Companion files (authoritative, do not restate here):**

- `schema.prisma` — full data model
- `migration_scheduling_constraints.sql` — exclusion constraint, check constraints, partial indexes

---

## 1. What is being built

A clinic platform with three role-scoped portals in one React app.

| Role Can do  |                                                                                                                                                                                                                |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Admin**    | Create/manage doctor profiles (specialisation, working hours, slot duration, leave). Apply leave with a conflict preview. View failed notifications.                                                           |
| **Doctor**   | See their schedule, read the AI pre-visit summary + raw symptom form, submit visit notes and a structured prescription, connect their Google Calendar.                                                         |
| **Patient**  | Register, log in, search doctors by specialisation, hold and confirm a slot, fill the symptom form, read the patient-friendly post-visit summary, receive medication reminders, connect their Google Calendar. |

**Graded deliverables:** source zip, README (setup, `.env.example`, API docs, DB schema, LLM prompts, Google Calendar setup), a live hosted URL, and an 800-word system design write-up covering double-booking prevention, leave conflict handling, the slot hold mechanism, and notification failure handling.

---

## 2. Stack (locked)

### Frontend

- **React 18 + Vite**, **JavaScript (ES6+)** — not TypeScript
- **React Router** — one app, role-guarded route trees
- **TanStack Query** — all server state; availability polls, everything else invalidates
- **Tailwind CSS + shadcn/ui**
- **React Hook Form + Zod** — form state and client validation
- **Axios** — single instance with an auth interceptor and a 401→refresh retry
- **Sonner** — toasts

### Backend

- **Node.js + Express.js**, JavaScript (ES6+), ESM
- **Prisma ORM** + **PostgreSQL 14+**

### Database Hosting

- **Neon PostgreSQL** — managed PostgreSQL provider for the deployed application.
- Use the Neon-provided connection string through `DATABASE_URL`.
- Neon is only the hosting/provider layer; the application remains PostgreSQL-based, and all PostgreSQL transactions, constraints, migrations, and Prisma behavior defined in this brief remain unchanged.

- **JWT** access (15 min) + refresh (7 days, rotating, hashed in DB)
- **bcrypt** for passwords
- **Zod** for request validation at the route boundary
- **pg-boss** — Postgres-backed job queue
- **SendGrid** — email
- **googleapis** (`OAuth2Client`) — Google Calendar
- **OpenAI API** — LLM (Gemini acceptable as a swap behind the same interface)
- **Pino** — structured logging
- **Swagger (OpenAPI)** — API docs
- **dotenv**

Express gives no structure, and "API design and code structure" is an explicit grading line — so impose the structure in §3 from the first commit.

---

## 3. Repo structure

```
/
├── client/                     # React + Vite
│   ├── src/
│   │   ├── api/                # axios instance + per-resource request fns
│   │   ├── components/ui/      # shadcn
│   │   ├── components/         # shared app components
│   │   ├── features/
│   │   │   ├── auth/
│   │   │   ├── booking/
│   │   │   ├── patient/
│   │   │   ├── doctor/
│   │   │   └── admin/
│   │   ├── hooks/
│   │   ├── lib/                # date/tz helpers, formatters
│   │   ├── routes/             # router + role guards
│   │   └── main.jsx
│
└── server/
    ├── prisma/
    │   ├── schema.prisma
    │   ├── migrations/
    │   └── seed.js
    ├── src/
    │   ├── config/             # env parsing (Zod), constants
    │   ├── middleware/         # auth, requireRole, validate, errorHandler
    │   ├── modules/
    │   │   ├── auth/           # *.routes.js  *.controller.js  *.service.js  *.schema.js
    │   │   ├── users/
    │   │   ├── doctors/
    │   │   ├── availability/
    │   │   ├── appointments/
    │   │   ├── leave/
    │   │   ├── clinical/       # visit notes + prescriptions
    │   │   ├── ai/
    │   │   ├── notifications/
    │   │   └── calendar/
    │   ├── jobs/               # pg-boss workers, one file per job
    │   ├── lib/                # prisma client, boss client, mailer, llm, google
    │   ├── utils/              # errors, time, ids
    │   ├── app.js              # express app (no listen)
    │   ├── server.js           # API entrypoint
    │   └── worker.js           # worker entrypoint — imports the same services
    └── package.json

```

**Rules.** Routes never touch Prisma. Controllers parse/serialise only. Services own transactions and business rules. Workers import services — never duplicate logic. `worker.js` and `server.js` are separate entrypoints on the same codebase so they can be deployed together or apart.

---

## 4. Environment variables

```dotenv
NODE_ENV=development
PORT=4000
API_BASE_URL=http://localhost:4000
CLIENT_BASE_URL=http://localhost:5173

# Postgres — ?schema=public keeps Prisma out of pg-boss's schema
DATABASE_URL="postgresql://user:pass@localhost:5432/clinic?schema=public"

JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d

# 32-byte hex — AES-256-GCM key for Google refresh tokens
CALENDAR_TOKEN_KEY=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:4000/api/calendar/google/callback

SENDGRID_API_KEY=
MAIL_FROM="Clinic <noreply@yourdomain.com>"
MAIL_FROM_NAME="City Health Clinic"

OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
LLM_TIMEOUT_MS=20000

HOLD_DURATION_MINUTES=10
REMINDER_QUIET_HOURS_START=22
REMINDER_QUIET_HOURS_END=7

ADMIN_SEED_EMAIL=admin@clinic.test
ADMIN_SEED_PASSWORD=

```

Parse this with Zod in `config/env.js` and **fail fast on boot** if anything required is missing. A missing `CALENDAR_TOKEN_KEY` discovered at runtime means unreadable stored tokens.

---

## 5. Core invariants

These are the things that must never break. Everything else is negotiable.

1. **Two overlapping** **`HELD`****/****`CONFIRMED`** **appointments for one doctor cannot exist.** Enforced by the Postgres exclusion constraint, not by application code.
2. **The booking API never blocks on the LLM, on email, or on Google.** All three are asynchronous.
3. **A committed booking always creates durable notification-outbox records.** Delivery occurs asynchronously with retries; the outbox rows are written in the same transaction as the appointment.
4. **No clinical content in email subject lines or calendar events.** Ever.
5. **All timestamps stored UTC (****`timestamptz`****).** Local wall-clock only ever appears in working-hours config and reminder clock times.
6. **A degraded LLM degrades the product, never breaks it.** The doctor always has the raw symptom form.

---

## 6. Availability computation

There is **no slot table**. Availability is derived.

```
GET /api/doctors/:doctorId/availability?date=YYYY-MM-DD

```

1. Load `DoctorProfile` (`slotDurationMin`, `bookingHorizonDays`, `minLeadTimeMin`) and `user.timezone`.
2. Reject dates beyond the horizon or in the past.
3. Load `DoctorWorkingHours` rows for that local day-of-week. Each row is a `[startMinute, endMinute)` window in minutes from local midnight. Multiple rows = split shifts.
4. Step through each window by `slotDurationMin`, producing candidate `[start, end)` pairs in **local wall-clock**.
5. Convert each candidate to UTC using the doctor's IANA zone (use `date-fns-tz` or `luxon` — never manual offset arithmetic).
6. Drop candidates overlapping any `DoctorLeave` row.
7. Drop candidates overlapping any appointment with status `CONFIRMED`, or status `HELD` **with** **`hold_expires_at > now()`** (expired holds are treated as free here).
8. Drop candidates starting sooner than `minLeadTimeMin` from now.
9. Return `[{ startsAt, endsAt }]` in UTC ISO strings. The client renders in the patient's local zone.

Because expired holds are ignored at read time, correctness does **not** depend on the sweeper job running on schedule.

---

## 7. Booking — hold then confirm

Two steps, because the patient fills the symptom form between them.

### 7.1 `POST /api/appointments/hold` (patient)

Body: `{ doctorId, startsAt }`

```
validate startsAt aligns to the doctor's slot grid, is within horizon,
         and clears minLeadTime          -> 422 if not

BEGIN
  -- serialise all booking activity for this doctor; makes the leave check
  -- and the insert atomic with respect to each other
  SELECT pg_advisory_xact_lock(1, hashtext($doctorId));

  load doctor; assert isActive && isAcceptingPatients   -> 409 DOCTOR_UNAVAILABLE
  endsAt = startsAt + slotDurationMin

  assert [startsAt, endsAt) inside working hours (doctor tz) -> 422 OUTSIDE_WORKING_HOURS
  assert no DoctorLeave overlaps [startsAt, endsAt)          -> 409 DOCTOR_ON_LEAVE

  -- PROACTIVE EXPIRY: clear lapsed holds occupying this range before inserting
  UPDATE appointments
     SET status = 'EXPIRED'
   WHERE doctor_id = $doctorId
     AND status = 'HELD'
     AND hold_expires_at < now()
     AND tstzrange(starts_at, ends_at, '[)') && tstzrange($startsAt, $endsAt, '[)');

  INSERT appointment (status='HELD',
                      hold_expires_at = now() + HOLD_DURATION_MINUTES,
                      hold_token = randomBytes(32).hex)
    -- on SQLSTATE 23P01 -> 409 SLOT_NO_LONGER_AVAILABLE
COMMIT

201 { appointmentId, holdToken, holdExpiresAt, doctor, startsAt, endsAt }

```

**Why proactive expiry, not catch-and-retry.** A Postgres error aborts the whole transaction — you cannot simply catch `23P01` and re-run the `INSERT` inside the same `BEGIN` without a `SAVEPOINT`, and Prisma does not expose savepoints cleanly. Clearing lapsed holds *before* inserting achieves the same result with no savepoint and no retry loop, and the advisory lock makes the clear-then-insert sequence race-free. If `23P01` still fires after the clear, the conflict is genuine — return 409, do not retry.

> Note for the system design write-up: describe this as *"expired holds are cleared within the same serialised transaction immediately before insertion; a residual exclusion violation is therefore always a genuine conflict."* That is more accurate than "catches 23P01 and retries once."

The exclusion constraint remains the backstop that guarantees correctness even if a future endpoint skips the advisory lock entirely.

### 7.2 `POST /api/appointments/:id/confirm` (patient)

Body: `{ holdToken, symptomForm: { symptoms, durationText, severity, existingConditions, currentMedications, allergies, additionalNotes } }`

```
BEGIN
  load appointment FOR UPDATE
  assert appointment.patientId === req.user.id          -> 403
  assert status === 'HELD'                              -> 409 HOLD_NOT_ACTIVE
  assert holdToken matches                              -> 403
  assert hold_expires_at > now()                        -> 410 HOLD_EXPIRED

  INSERT symptom_form
  UPDATE appointment SET status='CONFIRMED',
                         hold_expires_at=NULL, hold_token=NULL
  INSERT ai_summary (type=PRE_VISIT, status=PENDING)
  INSERT notification_outbox × 2   (patient + doctor booking confirmation)
  INSERT calendar_event rows for whichever participants have a live
         CalendarConnection (syncStatus=PENDING)
  INSERT audit_log
COMMIT

after commit (not inside):
  boss.send('ai.previsit',        { appointmentId })
  boss.send('calendar.sync',      { appointmentId, operation: 'CREATE' })
  boss.sendAfter('appt.reminder', { appointmentId, kind: '24H' }, startsAt - 24h)
  boss.sendAfter('appt.reminder', { appointmentId, kind: '1H'  }, startsAt - 1h)

```

Enqueue **after** commit. If the process dies between commit and enqueue, the outbox and `PENDING` rows are already durable and the sweepers pick them up — which is exactly why those rows exist.

**Hold expiry UX.** The client shows a countdown from `holdExpiresAt`. On expiry it stops the timer and offers to re-hold. Never silently retry.

---

## 8. Reschedule

`PATCH /api/appointments/:id/reschedule` — body `{ newStartsAt }`

**One transaction.** Cancel-then-book is forbidden: if the second step fails the patient loses their slot entirely.

```
BEGIN
  SELECT pg_advisory_xact_lock(1, hashtext($doctorId));
  assert old appointment is CONFIRMED and in the future
  clear lapsed holds over the new range (as in §7.1)
  INSERT new appointment (status='CONFIRMED', rescheduledFromId = oldId)
    -- 23P01 -> 409
  UPDATE old appointment SET status='RESCHEDULED'
  move symptom_form + ai_summary (PRE_VISIT) to the new appointment
  INSERT notification_outbox × 2  (RESCHEDULE)
  INSERT calendar_event rows for the new appointment, carrying over
         providerEventId from the old rows so the worker PATCHes
COMMIT
then: boss.send('calendar.sync', { appointmentId: newId, operation: 'UPDATE' })

```

**Patch the existing Google event, do not delete-and-recreate.** Attendees get a clean "event updated" notification and the event history survives.

Reminder jobs for the old appointment are *not* cancelled — see §10.

---

## 9. Cancellation

`POST /api/appointments/:id/cancel` — body `{ reason }`

Patient or doctor may cancel their own appointment; admin may cancel any. Status becomes `CANCELLED_BY_PATIENT` / `CANCELLED_BY_DOCTOR` / `CANCELLED_BY_CLINIC` accordingly. Never delete the row.

In the same transaction: set `cancelledAt`, `cancelledById`, `cancellationReason`; insert two outbox rows; mark `calendar_event` rows for deletion. After commit, enqueue `calendar.sync` with `operation: 'DELETE'`.

Cancelling frees the slot automatically — the exclusion constraint's `WHERE` clause no longer matches the row.

---

## 10. Doctor leave

Leave is a **workflow with a preview step**, not a bare update.

### `POST /api/admin/doctors/:id/leave/preview`

Body: `{ startsAt, endsAt, scope }`. Read-only. Returns every `CONFIRMED` appointment overlapping the range, with patient name, time, and contact. The admin UI shows this list and requires explicit confirmation.

### `POST /api/admin/doctors/:id/leave`

```
BEGIN
  SELECT pg_advisory_xact_lock(1, hashtext($doctorId));   -- same lock as booking
  INSERT doctor_leave
  SELECT affected appointments (CONFIRMED, overlapping)
  UPDATE them -> CANCELLED_BY_CLINIC, cancellationReason='Doctor unavailable'
  UPDATE overlapping HELD rows -> EXPIRED
  INSERT notification_outbox (LEAVE_CANCELLATION) per affected patient + the doctor
  mark calendar_event rows for deletion
  INSERT audit_log
COMMIT
then: enqueue calendar.sync DELETE for each affected appointment

```

The advisory lock is the **same lock the booking path takes**, which is what closes the race where a patient books at the instant leave is applied.

Full-day leave is expanded into absolute UTC instants at write time using the doctor's timezone, so overlap detection is one range comparison and DST never enters the query.

**Patient email includes a one-click reschedule link** to that doctor's next available slots. If the doctor has no availability within the horizon, link to the specialisation search instead.

---

## 11. Notifications — transactional outbox

**Never call SendGrid inside a request handler.**

Write a `notification_outbox` row in the *same transaction* as the business change. A worker drains it. If the process dies after commit, the email still goes out.

### Worker loop (`jobs/notification.worker.js`, every 15s)

```
claim = UPDATE notification_outbox
          SET status='SENDING', attempts = attempts + 1
        WHERE id IN (
          SELECT id FROM notification_outbox
           WHERE status='PENDING' AND next_attempt_at <= now()
           ORDER BY next_attempt_at
           LIMIT 20
           FOR UPDATE SKIP LOCKED        -- multiple workers never collide
        )
        RETURNING *;

for each row:
  if type is a scheduled reminder:
      re-read the appointment; skip (status='SKIPPED') unless still CONFIRMED
  render template with row.payload
  send via SendGrid
  on success -> status='SENT', sentAt, providerMessageId
  on failure -> if attempts >= maxAttempts: status='FAILED'
                else: status='PENDING',
                      next_attempt_at = now() + backoff(attempts)

```

`backoff(n)` = `min(2^n minutes, 60 minutes)` with jitter.

**Idempotency key** is deterministic — `"booking_confirmation:<appointmentId>:<userId>"`. The unique index makes a double-send impossible across retries, restarts, and duplicate enqueues.

**Verify state at send time; never try to cancel scheduled jobs.** When an appointment is cancelled or rescheduled, the 24h/1h reminder jobs stay queued. They wake up, re-read the appointment, see it is no longer `CONFIRMED`, and no-op. Far more robust than chasing job deletions through pg-boss.

**Failed notifications are visible to admin** at `GET /api/admin/notifications/failed`, with a manual retry endpoint.

### SendGrid setup note for the README

Use **single sender verification** so the app can send to *any* recipient on the free 100/day tier. (Resend without a verified custom domain only delivers to the account owner's own address — that would silently break the demo.)

---

## 12. Medication reminders

**No AI involved.** The doctor fills a structured form; the backend materialises reminder rows deterministically.

### Frequency map (`config/constants.js`)

Minutes from local midnight, in the **patient's** timezone:

```js
export const FREQUENCY_TIMES = {
  OD:  [540],                      // 09:00
  BD:  [540, 1260],                // 09:00, 21:00
  TDS: [480, 840, 1200],           // 08:00, 14:00, 20:00
  QID: [480, 720, 960, 1200],      // 08:00, 12:00, 16:00, 20:00
  HS:  [1320],                     // 22:00
  SOS: [],                         // as needed — no scheduled reminders
};

```

The resolved times are **persisted** to `prescription_item.timesOfDayMinutes` at save time, so a later change to this map never retroactively shifts an already-issued course. The doctor may override per item.

### Materialisation

On `POST /api/appointments/:id/prescription`, inside the transaction:

```
for each item:
  for day in 0 .. durationDays-1:
    for minute in item.timesOfDayMinutes:
      localDateTime = prescription.startDate + day days + minute minutes
      scheduledAt   = toUTC(localDateTime, patient.timezone)
      skip if scheduledAt <= now()
      skip if local hour is inside quiet hours
      INSERT medication_reminder (PENDING)   -- ON CONFLICT DO NOTHING

```

`@@unique([prescriptionItemId, scheduledAt])` makes re-running this idempotent.

### Delivery

A pg-boss job runs every 15 minutes, selects `PENDING` reminders with `scheduled_at <= now()`, checks `patient.medicationRemindersEnabled`, and writes outbox rows (it does **not** send directly — everything goes through the outbox).

### Stop conditions

Course ends (bounded by `durationDays`); a new prescription for the same patient sets the previous one to `SUPERSEDED` and cancels its `PENDING` reminders; the patient toggles `medicationRemindersEnabled` off.

---

## 13. LLM integration

### Rules

- Server-side only. The API key never reaches the browser.
- **Always asynchronous** via pg-boss. Booking and note submission never wait on it.
- Force structured JSON output (`response_format: { type: "json_object" }`), then validate with Zod.
- **No caching.** Every generation is a fresh call. (Deliberate — see §17.)
- Timeout at `LLM_TIMEOUT_MS`. Max 2 attempts total, then `status='FAILED'`.
- On `FAILED`, the UI shows the raw source content with a "summary unavailable" notice and a manual regenerate button. Nothing breaks.

### Pre-visit prompt (`prompt_version: "previsit.v1"`)

**System:**

```
You are a clinical intake assistant supporting a licensed doctor before a
consultation. You summarise patient-reported information only.

You must NOT diagnose, name possible conditions, suggest treatments, or
recommend medication. The urgency level is a scheduling and triage aid for the
clinician — it is not a medical determination.

Respond with valid JSON only. No markdown, no code fences, no preamble.

```

**User:**

```
Analyse these symptoms and return: urgency level (Low / Medium / High),
chief complaint, and three suggested questions for the doctor.

Patient-reported information:
Symptoms: {{symptoms}}
Duration: {{durationText}}
Self-reported severity (1-10): {{severity}}
Existing conditions: {{existingConditions}}
Current medications: {{currentMedications}}
Allergies: {{allergies}}
Additional notes: {{additionalNotes}}

Return exactly this JSON shape:
{
  "urgency": "LOW" | "MEDIUM" | "HIGH",
  "chiefComplaint": "one sentence, under 25 words",
  "suggestedQuestions": ["question 1", "question 2", "question 3"]
}

```

**Zod schema:**

```js
const preVisitSchema = z.object({
  urgency: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  chiefComplaint: z.string().min(1).max(300),
  suggestedQuestions: z.array(z.string().min(1)).length(3),
});

```

On success write `payload`, promote `urgency` to its own column (so the doctor's queue sorts by it without a jsonb index), set `status='READY'` and `generatedAt`.

### Post-visit prompt (`prompt_version: "postvisit.v1"`)

**System:**

```
You are a medical communication assistant. You rewrite a doctor's clinical
notes into plain language for the patient.

Only restate information present in the notes. Do not add advice, do not add
medications, do not change doses, do not speculate. Use simple words and avoid
medical jargon; where a clinical term must appear, explain it in plain language.

Respond with valid JSON only. No markdown, no code fences, no preamble.

```

**User:**

```
Convert these clinical notes into a patient-friendly summary with medication
schedule and follow-up steps.

Clinical notes: {{clinicalNotes}}
Diagnosis: {{diagnosis}}
Prescription:
{{#each items}}
- {{drugName}} {{dose}}, {{frequency}}, for {{durationDays}} days. {{instructions}}
{{/each}}
Follow-up date: {{followUpDate}}
Follow-up notes: {{followUpNotes}}

Return exactly this JSON shape:
{
  "summary": "2-4 short paragraphs in plain language",
  "medicationSchedule": [
    { "drug": "", "dose": "", "whenToTake": "", "howLong": "", "notes": "" }
  ],
  "followUpSteps": ["step 1", "step 2"]
}

```

The medication schedule shown to the patient is rendered from the **structured prescription rows**, not from the LLM output. The LLM's version is supplementary prose. Doses must never come from a model.

### Failure taxonomy

| Failure Handling     |                                                             |
| -------------------- | ----------------------------------------------------------- |
| Network/timeout      | Retry once with backoff, then `FAILED`                      |
| Non-JSON response    | Retry once with a stricter reminder appended, then `FAILED` |
| Zod validation fails | Same as above                                               |
| Rate limit (429)     | Backoff and requeue, does not count toward the 2 attempts   |
| Auth error (401)     | `FAILED` immediately, log loudly — retrying will not help   |

---

## 14. Google Calendar

### Auth model

Authentication and calendar authorization are **completely separate flows**. There is no Google Sign-In (see §17).

- Login = email/password → your own JWT.
- Calendar = opt-in from the Settings page, scope `https://www.googleapis.com/auth/calendar.events` only.

### Connect flow

```
GET  /api/calendar/google/connect     -> 302 to Google consent
GET  /api/calendar/google/callback    -> exchange code, encrypt + store refresh token
DELETE /api/calendar/google           -> disconnect (revoke + delete row)
GET  /api/calendar/status             -> { connected, googleEmail, revoked }

```

Request `access_type=offline` **and** `prompt=consent` on the authorization URL, or Google returns no refresh token and the connection dies in an hour with no way to renew.

Encrypt the refresh token with AES-256-GCM using `CALENDAR_TOKEN_KEY`; store as `iv:authTag:ciphertext` (base64). Never in the JWT, never in logs.

### Sync worker (`jobs/calendar.worker.js`)

Processes `calendar_event` rows with `syncStatus='PENDING'`, one row per participant. The patient's sync failing never blocks the doctor's.

**Event content — privacy critical:**

```
summary:     "Consultation with Dr. {{doctorName}}"        (doctor's view: "Consultation — {{patientName}}")
description: "Booked via City Health Clinic. Ref: {{shortId}}"
             + a link to the appointment page
location:    clinic address

```

**No symptoms, no diagnosis, no prescription.** Calendar entries leak into shared and delegated views.

**Idempotent creation.** Supply your own event ID to `events.insert` so a timed-out retry cannot create a duplicate. Google requires base32hex (`a-v`, `0-9`), 5–1024 chars:

```js
const eventId = crypto.createHash('sha1')
  .update(`${appointmentId}:${userId}`)
  .digest('hex')
  .split('')
  .map(c => 'abcdefghijklmnopqrstuv0123456789'['0123456789abcdef'.indexOf(c)])
  .join('');

```

A retry with the same ID returns `409` instead of creating a second event — treat that `409` as success and record the ID.

**Error handling:**

| Status Meaning Action   |                         |                                                                       |
| ----------------------- | ----------------------- | --------------------------------------------------------------------- |
| 401                     | Access token expired    | Refresh via `OAuth2Client`, retry                                     |
| `invalid_grant`         | User revoked access     | **Terminal.** Set `revokedAt`, stop retrying, show a reconnect banner |
| 403 `rateLimitExceeded` | Throttled               | Exponential backoff, requeue                                          |
| 409 on insert           | Event ID already exists | Treat as success                                                      |
| 410 on delete           | Event already gone      | Treat as success                                                      |

### `.ics` fallback — build this, it is not optional

Every booking confirmation email carries an `.ics` attachment. It works for every user in every calendar app with zero OAuth. Google Calendar sync is the *upgrade* for connected users.

This matters practically: an unverified OAuth app stays in Google's **testing mode**, where only explicitly added test users (\~100 max) can consent. A grader's account will not work unless added. Document this prominently in the README and ship two pre-connected demo accounts.

UI for unconnected users: *"Connect your Google Calendar from Settings to sync appointments automatically."*

---

## 15. Auth & RBAC

- Access token 15 min, in memory on the client. Refresh token 7 days, rotating, `httpOnly` cookie, SHA-256 hashed in `refresh_tokens`.
- Rotation with reuse detection: presenting a revoked refresh token revokes the whole family.
- `requireAuth` → verifies JWT. `requireRole('ADMIN')` → coarse gate.
- **Object-level checks are mandatory and separate.** A doctor with a valid `DOCTOR` role must still be blocked from reading another doctor's appointment. Check ownership in the service, on every read and write of appointment/note/prescription/summary.
- **Doctors do not self-register.** Admin creates them via `POST /api/admin/doctors` with a temporary password. Only `PATIENT` may use `POST /api/auth/register`.
- Admin is seeded from `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD`.
- `patient.timezone` defaults from `Intl.DateTimeFormat().resolvedOptions().timeZone` at registration, editable in Settings.

---

## 16. API surface

```
AUTH
POST   /api/auth/register                      (patients only)
POST   /api/auth/login
POST   /api/auth/refresh
POST   /api/auth/logout
GET    /api/auth/me

DOCTORS (public/patient)
GET    /api/doctors                            ?specialisation=&q=&page=
GET    /api/doctors/:id
GET    /api/doctors/:id/availability           ?date=YYYY-MM-DD
GET    /api/specialisations

ADMIN
POST   /api/admin/doctors
PATCH  /api/admin/doctors/:id
PUT    /api/admin/doctors/:id/working-hours
POST   /api/admin/doctors/:id/leave/preview
POST   /api/admin/doctors/:id/leave
DELETE /api/admin/leave/:leaveId
GET    /api/admin/notifications/failed
POST   /api/admin/notifications/:id/retry
GET    /api/admin/stats

APPOINTMENTS
POST   /api/appointments/hold
POST   /api/appointments/:id/confirm
POST   /api/appointments/:id/cancel
PATCH  /api/appointments/:id/reschedule
GET    /api/appointments                       role-scoped list
GET    /api/appointments/:id
GET    /api/appointments/:id/pre-visit-summary (doctor only)
POST   /api/appointments/:id/summary/regenerate

CLINICAL
POST   /api/appointments/:id/visit-note        (doctor)
POST   /api/appointments/:id/prescription      (doctor)
GET    /api/appointments/:id/post-visit-summary (patient)
GET    /api/patients/me/prescriptions
PATCH  /api/patients/me/reminder-preferences

CALENDAR
GET    /api/calendar/status
GET    /api/calendar/google/connect
GET    /api/calendar/google/callback
DELETE /api/calendar/google

```

### Error envelope

```json
{ "error": { "code": "SLOT_NO_LONGER_AVAILABLE",
             "message": "That slot was just booked. Please pick another.",
             "details": {} } }

```

### Postgres error → HTTP map (central `errorHandler`)

| SQLSTATE Meaning HTTP  |                     |                                |
| ---------------------- | ------------------- | ------------------------------ |
| `23P01`                | exclusion violation | 409 `SLOT_NO_LONGER_AVAILABLE` |
| `23505`                | unique violation    | 409 `DUPLICATE`                |
| `23503`                | FK violation        | 400 `INVALID_REFERENCE`        |
| `23514`                | check violation     | 422 `INVALID_INPUT`            |

Also: 410 for `HOLD_EXPIRED`, 403 for ownership failures, 422 for Zod failures with a field-level `details` object.

---

## 17. Explicitly rejected — do not reintroduce

| Rejected Reason                                                              |                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Materialised** **`slot`** **table**                                        | The exclusion constraint already enforces correctness and availability is cheap to compute. A slot table would be a second source of truth requiring regeneration on every working-hours change, and it strands already-booked rows off the new grid. |
| **MongoDB**                                                                  | Double-booking prevention and safe concurrency are near-free in Postgres and pure application guesswork in Mongo.                                                                                                                                     |
| **Redis for slot holds**                                                     | The hold would live outside the database that enforces the constraint. Postgres stays the single source of truth.                                                                                                                                     |
| **Redis / BullMQ for the queue**                                             | pg-boss removes an entire service from the free-tier deployment.                                                                                                                                                                                      |
| **Catch-****`23P01`****-and-retry inside the booking transaction**           | A Postgres error aborts the transaction; this needs savepoints Prisma does not expose cleanly. Replaced by proactive expiry under an advisory lock (§7.1).                                                                                            |
| **Google Sign-In**                                                           | Not a requirement. Adds a second identity path with account-linking edge cases. Calendar OAuth is separate and opt-in.                                                                                                                                |
| **Passport.js**                                                              | It only handles the initial code exchange; refresh, retry, and all calendar calls go through `googleapis`' `OAuth2Client` anyway. A plain connect/callback route pair is \~40 lines and avoids Passport's session middleware fighting JWT auth.       |
| **Resend**                                                                   | Without a verified custom domain it only delivers to the account owner's address — silently breaks the demo. Use SendGrid with single sender verification.                                                                                            |
| **Red-flag / emergency keyword detection**                                   | Descoped. Instead, show static guidance above the symptom textarea: *"If you're experiencing chest pain, difficulty breathing, or sudden weakness, call emergency services instead of booking."* No logic, no schema.                                 |
| **LLM response caching by input hash**                                       | Descoped. Call the LLM every time. `attempts` and `lastError` cover retry bookkeeping.                                                                                                                                                                |
| **Extra** **`@unique`** **on** **`CalendarConnection.userId`**               | It is already `@id`; a primary key is a unique constraint.                                                                                                                                                                                            |
| **`@@unique([appointmentId, userId, provider])`** **on** **`CalendarEvent`** | Adding a column to a composite unique key *relaxes* it. `@@unique([appointmentId, userId])` is stricter and already present.                                                                                                                          |
| **LLM-parsed prescriptions**                                                 | Doses and schedules must never come from a model. Structured form only.                                                                                                                                                                               |
| **Deleting scheduled reminder jobs on cancel**                               | Verify appointment state at send time instead (§11).                                                                                                                                                                                                  |
| **Free-tier sleep discussion in the design write-up**                        | Deployment concern, belongs in the README.                                                                                                                                                                                                            |

---

## 18. Background jobs (pg-boss)

| Job Trigger Does        |                           |                                                                                               |
| ----------------------- | ------------------------- | --------------------------------------------------------------------------------------------- |
| `hold.sweeper`          | every 60s                 | `HELD` past `hold_expires_at` → `EXPIRED`. Backstop only; reads already ignore expired holds. |
| `notification.dispatch` | every 15s                 | Drains the outbox (§11)                                                                       |
| `ai.previsit`           | on confirm                | Generates the pre-visit summary                                                               |
| `ai.postvisit`          | on note submit            | Generates the post-visit summary                                                              |
| `ai.retry`              | every 10 min              | Requeues `PENDING` summaries stuck past a threshold with `attempts < 2`                       |
| `calendar.sync`         | on book/reschedule/cancel | Creates/patches/deletes Google events                                                         |
| `calendar.retry`        | every 5 min               | Requeues `PENDING`/`FAILED` calendar rows under max attempts                                  |
| `appt.reminder`         | scheduled at book time    | Writes reminder outbox rows after re-verifying status                                         |
| `medication.dispatch`   | every 15 min              | Due `medication_reminder` rows → outbox                                                       |

`worker.js` registers all of these and imports the same service layer as the API.

---

## 19. Build order

1. Scaffold both apps; `config/env.js` with fail-fast Zod parsing; Prisma connected; Pino wired.
2. Run the migrations — **including** **`migration_scheduling_constraints.sql`** — and verify the exclusion constraint manually using the snippet at the bottom of that file. Do this before writing any booking code.
3. Auth: register/login/refresh/logout, `requireAuth`, `requireRole`, seed script (admin + 3 doctors + working hours + 2 patients).
4. Admin doctor CRUD + working hours.
5. Availability endpoint. Unit-test the timezone conversion and split shifts before moving on.
6. Hold + confirm. **Write a concurrency test**: fire 20 parallel holds at one slot and assert exactly one 201 and nineteen 409s. This is the single most valuable test in the project.
7. Outbox + notification worker + SendGrid.
8. LLM pre-visit, then post-visit. Test the failure paths deliberately — bad API key, malformed JSON, timeout.
9. Cancel, then reschedule (reschedule depends on cancel semantics being settled).
10. Leave preview + apply, with the affected-patient notification path.
11. Prescriptions + reminder materialisation + dispatch.
12. Google Calendar connect/sync/retry.
13. Frontend portals, in the same order as the backend.
14. Swagger, README, seed demo data, deploy.

---

## 20. Deployment

- **Frontend:** Vercel
- **API + worker:** Render or Railway
- **Postgres:** Neon or Supabase (free tier, generous)

Run `server.js` and `worker.js` as two processes. If the host sleeps idle services the worker stops firing — either put the worker on a platform that stays warm, or keep an external uptime pinger on it during the demo. This is a hosting note for the README, **not** part of the system design write-up.

Seed the deployed instance with demo accounts for all three roles and pre-connect one doctor + one patient to Google Calendar (their accounts must be added as OAuth test users first).

---

## 21. What is deliberately still open

Decide these while implementing; none affect the schema:

- Email template engine (react-email vs handlebars) and visual design
- Pagination style on list endpoints (offset is fine at this scale)
- Whether doctors can edit a visit note after submission, and for how long
- Rate limiting thresholds on auth and hold endpoints
- Exact copy for every email template