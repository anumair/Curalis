-- ============================================================================
--  Scheduling integrity constraints
--
--  Prisma cannot express EXCLUDE or CHECK constraints in schema.prisma, so
--  these are applied via a hand-written migration:
--
--     npx prisma migrate dev --create-only --name scheduling_constraints
--     # paste this file's contents into the generated migration.sql
--     npx prisma migrate dev
--
--  Everything below is idempotent so it is safe to re-run.
-- ============================================================================


-- ----------------------------------------------------------------------------
--  1. btree_gist
--     Lets a GiST index mix an equality column (doctor_id, a UUID) with a
--     range column. Without it the exclusion constraint below cannot be built.
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS btree_gist;


-- ----------------------------------------------------------------------------
--  2. THE double-booking guarantee
--
--  Two overlapping appointments for the same doctor cannot physically exist
--  while either is HELD or CONFIRMED. This is enforced by the database, not by
--  application logic — it holds even if a future endpoint, an admin action, or
--  a bug bypasses the booking service entirely.
--
--  Concurrency: two simultaneous INSERTs for the same slot both attempt to
--  write. Postgres serialises them on the index; the loser receives SQLSTATE
--  23P01 (exclusion_violation), which the booking service maps to HTTP 409.
--  No read-then-write window, no application-level lock required.
--
--  '[)' bounds — inclusive start, exclusive end — so a 09:00–09:30 slot and a
--  09:30–10:00 slot are adjacent, not overlapping.
--
--  IMPORTANT: the WHERE clause cannot reference NOW(), because index
--  predicates must be IMMUTABLE. An expired HELD row therefore keeps blocking
--  its slot until something clears it. The booking service handles this by
--  catching 23P01, inspecting the conflicting row, and — if it is a HELD row
--  past hold_expires_at — marking it EXPIRED and retrying the insert once.
--  The pg-boss sweeper is a backstop, not the primary mechanism.
-- ----------------------------------------------------------------------------
ALTER TABLE appointments
  DROP CONSTRAINT IF EXISTS no_overlapping_appointments;

ALTER TABLE appointments
  ADD CONSTRAINT no_overlapping_appointments
  EXCLUDE USING gist (
    doctor_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  )
  WHERE (status IN ('HELD', 'CONFIRMED'));


-- ----------------------------------------------------------------------------
--  3. Sanity checks
-- ----------------------------------------------------------------------------

-- An appointment must occupy a positive interval.
ALTER TABLE appointments
  DROP CONSTRAINT IF EXISTS appointment_time_order;
ALTER TABLE appointments
  ADD CONSTRAINT appointment_time_order
  CHECK (ends_at > starts_at);

-- A HELD row without an expiry would block its slot forever.
ALTER TABLE appointments
  DROP CONSTRAINT IF EXISTS hold_requires_expiry;
ALTER TABLE appointments
  ADD CONSTRAINT hold_requires_expiry
  CHECK (status <> 'HELD' OR hold_expires_at IS NOT NULL);

-- A patient cannot book themselves for a consultation with themselves
-- (relevant only if a user somehow holds both profiles).
ALTER TABLE appointments
  DROP CONSTRAINT IF EXISTS doctor_is_not_patient;
ALTER TABLE appointments
  ADD CONSTRAINT doctor_is_not_patient
  CHECK (doctor_id <> patient_id);

-- Leave must also occupy a positive interval.
ALTER TABLE doctor_leaves
  DROP CONSTRAINT IF EXISTS leave_time_order;
ALTER TABLE doctor_leaves
  ADD CONSTRAINT leave_time_order
  CHECK (ends_at > starts_at);

-- Working hours: within a day, and start before end.
ALTER TABLE doctor_working_hours
  DROP CONSTRAINT IF EXISTS working_hours_valid;
ALTER TABLE doctor_working_hours
  ADD CONSTRAINT working_hours_valid
  CHECK (
    start_minute >= 0
    AND end_minute <= 1440
    AND start_minute < end_minute
  );

ALTER TABLE doctor_working_hours
  DROP CONSTRAINT IF EXISTS day_of_week_valid;
ALTER TABLE doctor_working_hours
  ADD CONSTRAINT day_of_week_valid
  CHECK (day_of_week BETWEEN 0 AND 6);

-- Patient-reported severity stays on a 1–10 scale.
ALTER TABLE symptom_forms
  DROP CONSTRAINT IF EXISTS severity_range;
ALTER TABLE symptom_forms
  ADD CONSTRAINT severity_range
  CHECK (severity IS NULL OR severity BETWEEN 1 AND 10);

-- A course must run for at least one day.
ALTER TABLE prescription_items
  DROP CONSTRAINT IF EXISTS duration_positive;
ALTER TABLE prescription_items
  ADD CONSTRAINT duration_positive
  CHECK (duration_days > 0);


-- ----------------------------------------------------------------------------
--  4. Range index for leave-overlap lookups
--     Used by the availability query and by the leave-conflict preview.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS doctor_leaves_range_idx
  ON doctor_leaves
  USING gist (doctor_id, tstzrange(starts_at, ends_at, '[)'));


-- ----------------------------------------------------------------------------
--  5. Partial index for the outbox worker's claim query
--     The worker only ever scans PENDING rows that are due; a partial index
--     keeps it small no matter how much history accumulates.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS notification_outbox_due_idx
  ON notification_outbox (next_attempt_at)
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS medication_reminders_due_idx
  ON medication_reminders (scheduled_at)
  WHERE status = 'PENDING';


-- ----------------------------------------------------------------------------
--  Verification (run manually after migrating)
-- ----------------------------------------------------------------------------
-- Should raise SQLSTATE 23P01 on the second insert:
--
--   BEGIN;
--   INSERT INTO appointments (id, doctor_id, patient_id, starts_at, ends_at,
--                             status, hold_expires_at, created_at, updated_at)
--   VALUES (gen_random_uuid(), '<doctor-uuid>', '<patient-uuid>',
--           '2026-09-01 09:00+00', '2026-09-01 09:30+00',
--           'HELD', now() + interval '10 min', now(), now());
--
--   INSERT INTO appointments (id, doctor_id, patient_id, starts_at, ends_at,
--                             status, hold_expires_at, created_at, updated_at)
--   VALUES (gen_random_uuid(), '<doctor-uuid>', '<other-patient-uuid>',
--           '2026-09-01 09:15+00', '2026-09-01 09:45+00',
--           'HELD', now() + interval '10 min', now(), now());
--   -- ERROR: conflicting key value violates exclusion constraint
--   ROLLBACK;
