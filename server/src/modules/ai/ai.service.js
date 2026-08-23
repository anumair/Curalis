import { prisma } from '../../lib/prisma.js';
import { boss } from '../../lib/boss.js';
import { QUEUES } from '../../config/queues.js';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { ApiError } from '../../utils/errors.js';
import { generateJson, LlmAuthError, LlmRateLimitError } from '../../lib/llm.js';
import { preVisitResponseSchema, postVisitResponseSchema } from './ai.schema.js';

const MAX_ATTEMPTS = 2;
const RATE_LIMIT_BACKOFF_MS = 30_000;
const STALE_PENDING_THRESHOLD_MS = 5 * 60_000;

const PREVISIT_SYSTEM_PROMPT = `You are a clinical intake assistant supporting a licensed doctor before a
consultation. You summarise patient-reported information only.

You must NOT diagnose, name possible conditions, suggest treatments, or
recommend medication. The urgency level is a scheduling and triage aid for the
clinician — it is not a medical determination.

Respond with valid JSON only. No markdown, no code fences, no preamble.`;

function buildPreVisitUserPrompt(symptomForm) {
  return `Analyse these symptoms and return: urgency level (Low / Medium / High),
chief complaint, and three suggested questions for the doctor.

Patient-reported information:
Symptoms: ${symptomForm.symptoms}
Duration: ${symptomForm.durationText ?? 'Not specified'}
Self-reported severity (1-10): ${symptomForm.severity ?? 'Not specified'}
Existing conditions: ${symptomForm.existingConditions ?? 'None reported'}
Current medications: ${symptomForm.currentMedications ?? 'None reported'}
Allergies: ${symptomForm.allergies ?? 'None reported'}
Additional notes: ${symptomForm.additionalNotes ?? 'None'}

Return exactly this JSON shape:
{
  "urgency": "LOW" | "MEDIUM" | "HIGH",
  "chiefComplaint": "one sentence, under 25 words",
  "suggestedQuestions": ["question 1", "question 2", "question 3"]
}`;
}

const POSTVISIT_SYSTEM_PROMPT = `You are a medical communication assistant. You rewrite a doctor's clinical
notes into plain language for the patient.

Only restate information present in the notes. Do not add advice, do not add
medications, do not change doses, do not speculate. Use simple words and avoid
medical jargon; where a clinical term must appear, explain it in plain language.

Respond with valid JSON only. No markdown, no code fences, no preamble.`;

function buildPostVisitUserPrompt(visitNote, prescription) {
  const items = prescription?.items ?? [];
  // Prescriptions are built in a later step — an appointment can reach
  // post-visit summary generation with none yet. The prompt (and the
  // model) handle that as "nothing was prescribed," not an error.
  const itemLines = items.length
    ? items
        .map((item) => `- ${item.drugName} ${item.dose}, ${item.frequency}, for ${item.durationDays} days. ${item.instructions ?? ''}`)
        .join('\n')
    : 'None prescribed.';

  return `Convert these clinical notes into a patient-friendly summary with medication
schedule and follow-up steps.

Clinical notes: ${visitNote.clinicalNotes}
Diagnosis: ${visitNote.diagnosis ?? 'Not specified'}
Prescription:
${itemLines}
Follow-up date: ${visitNote.followUpDate ? visitNote.followUpDate.toISOString().slice(0, 10) : 'None scheduled'}
Follow-up notes: ${visitNote.followUpNotes ?? 'None'}

Return exactly this JSON shape:
{
  "summary": "2-4 short paragraphs in plain language",
  "medicationSchedule": [
    { "drug": "", "dose": "", "whenToTake": "", "howLong": "", "notes": "" }
  ],
  "followUpSteps": ["step 1", "step 2"]
}`;
}

// Brief's failure taxonomy, run inline within one job invocation:
// network/timeout, non-JSON, and schema-validation failures retry once
// with a stricter reminder appended, then give up. Rate limits don't
// spend an attempt — the caller requeues instead. Auth errors fail
// immediately since retrying can't help.
async function generateWithRetry({ systemPrompt, userPrompt, schema }) {
  let attempts = 0;
  let currentPrompt = userPrompt;

  while (attempts < MAX_ATTEMPTS) {
    attempts += 1;
    try {
      const raw = await generateJson({ systemPrompt, userPrompt: currentPrompt });
      const payload = schema.parse(raw);
      return { status: 'READY', payload, attempts };
    } catch (err) {
      if (err instanceof LlmRateLimitError) {
        return { status: 'RATE_LIMITED', attempts: attempts - 1, lastError: err.message };
      }
      if (err instanceof LlmAuthError) {
        logger.error({ err }, 'LLM auth error — check OPENAI_API_KEY');
        return { status: 'FAILED', attempts, lastError: err.message };
      }
      if (attempts >= MAX_ATTEMPTS) {
        return { status: 'FAILED', attempts, lastError: err.message ?? String(err) };
      }
      currentPrompt = `${currentPrompt}\n\nReminder: respond with valid JSON only, matching the exact shape requested above. No markdown, no code fences, no commentary.`;
    }
  }
}

async function applyResult({ summaryId, appointmentId, queueName, result, promptVersion }) {
  if (result.status === 'READY') {
    await prisma.aiSummary.update({
      where: { id: summaryId },
      data: {
        status: 'READY',
        payload: result.payload,
        urgency: result.payload.urgency ?? null,
        model: env.OPENAI_MODEL,
        promptVersion,
        attempts: result.attempts,
        generatedAt: new Date(),
        lastError: null,
      },
    });
    return;
  }

  if (result.status === 'RATE_LIMITED') {
    await prisma.aiSummary.update({ where: { id: summaryId }, data: { attempts: result.attempts, lastError: result.lastError } });
    await boss.sendAfter(queueName, { appointmentId }, new Date(Date.now() + RATE_LIMIT_BACKOFF_MS));
    return;
  }

  // FAILED — the doctor/patient still has the raw source content (symptom
  // form / clinical notes) to fall back on; nothing downstream breaks.
  await prisma.aiSummary.update({
    where: { id: summaryId },
    data: { status: 'FAILED', attempts: result.attempts, lastError: result.lastError },
  });
}

export async function generatePreVisitSummary(appointmentId) {
  const summary = await prisma.aiSummary.findUnique({
    where: { appointmentId_type: { appointmentId, type: 'PRE_VISIT' } },
  });
  const symptomForm = await prisma.symptomForm.findUnique({ where: { appointmentId } });
  if (!summary || !symptomForm) return; // appointment/summary no longer exists — nothing to do

  const result = await generateWithRetry({
    systemPrompt: PREVISIT_SYSTEM_PROMPT,
    userPrompt: buildPreVisitUserPrompt(symptomForm),
    schema: preVisitResponseSchema,
  });

  await applyResult({ summaryId: summary.id, appointmentId, queueName: QUEUES.AI_PREVISIT, result, promptVersion: 'previsit.v1' });
}

export async function generatePostVisitSummary(appointmentId) {
  const summary = await prisma.aiSummary.findUnique({
    where: { appointmentId_type: { appointmentId, type: 'POST_VISIT' } },
  });
  const visitNote = await prisma.visitNote.findUnique({ where: { appointmentId } });
  if (!summary || !visitNote) return;

  const prescription = await prisma.prescription.findUnique({
    where: { appointmentId },
    include: { items: true },
  });

  const result = await generateWithRetry({
    systemPrompt: POSTVISIT_SYSTEM_PROMPT,
    userPrompt: buildPostVisitUserPrompt(visitNote, prescription),
    schema: postVisitResponseSchema,
  });

  await applyResult({ summaryId: summary.id, appointmentId, queueName: QUEUES.AI_POSTVISIT, result, promptVersion: 'postvisit.v1' });
}

// Reads the summary + its raw source so the UI can show "summary
// unavailable" with the underlying content when status is FAILED/PENDING,
// per brief §13 ("a degraded LLM degrades the product, never breaks it").
export async function getPreVisitSummary(doctorId, appointmentId) {
  const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appointment) throw new ApiError(404, 'NOT_FOUND', 'Appointment not found.');
  if (appointment.doctorId !== doctorId) {
    throw new ApiError(403, 'FORBIDDEN', 'This appointment does not belong to you.');
  }

  const [summary, symptomForm] = await Promise.all([
    prisma.aiSummary.findUnique({ where: { appointmentId_type: { appointmentId, type: 'PRE_VISIT' } } }),
    prisma.symptomForm.findUnique({ where: { appointmentId } }),
  ]);

  return { summary, symptomForm };
}

export async function getPostVisitSummary(patientId, appointmentId) {
  const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appointment) throw new ApiError(404, 'NOT_FOUND', 'Appointment not found.');
  if (appointment.patientId !== patientId) {
    throw new ApiError(403, 'FORBIDDEN', 'This appointment does not belong to you.');
  }

  const [summary, visitNote] = await Promise.all([
    prisma.aiSummary.findUnique({ where: { appointmentId_type: { appointmentId, type: 'POST_VISIT' } } }),
    prisma.visitNote.findUnique({ where: { appointmentId } }),
  ]);

  return { summary, visitNote };
}

export async function regenerateSummary(user, appointmentId, type) {
  const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appointment) throw new ApiError(404, 'NOT_FOUND', 'Appointment not found.');

  const isOwner = type === 'PRE_VISIT' ? appointment.doctorId === user.id : appointment.patientId === user.id;
  if (!isOwner) throw new ApiError(403, 'FORBIDDEN', 'This appointment does not belong to you.');

  const summary = await prisma.aiSummary.findUnique({ where: { appointmentId_type: { appointmentId, type } } });
  if (!summary) throw new ApiError(404, 'NOT_FOUND', 'No summary exists for this appointment yet.');

  await prisma.aiSummary.update({ where: { id: summary.id }, data: { status: 'PENDING', attempts: 0, lastError: null } });

  const queueName = type === 'PRE_VISIT' ? QUEUES.AI_PREVISIT : QUEUES.AI_POSTVISIT;
  await boss.send(queueName, { appointmentId });
}

// ai.retry (brief §18): requeues summaries stuck in PENDING past a
// staleness threshold with attempts < 2 — covers a process dying between
// commit and enqueue, or a lost job. Runs on a plain interval alongside
// the notification worker, not pg-boss's own cron scheduling.
export async function requeueStalePendingSummaries() {
  const staleBefore = new Date(Date.now() - STALE_PENDING_THRESHOLD_MS);
  const stale = await prisma.aiSummary.findMany({
    where: { status: 'PENDING', attempts: { lt: MAX_ATTEMPTS }, updatedAt: { lt: staleBefore } },
  });

  for (const summary of stale) {
    const queueName = summary.type === 'PRE_VISIT' ? QUEUES.AI_PREVISIT : QUEUES.AI_POSTVISIT;
    await boss.send(queueName, { appointmentId: summary.appointmentId });
  }

  return stale.length;
}
