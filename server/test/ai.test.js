import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preVisitResponseSchema, postVisitResponseSchema } from '../src/modules/ai/ai.schema.js';

const validPreVisit = {
  urgency: 'MEDIUM',
  chiefComplaint: 'Persistent cough for a week, mild fever.',
  suggestedQuestions: ['How high has the fever gone?', 'Any shortness of breath?', 'Any known allergies?'],
};

test('a valid pre-visit LLM response parses cleanly', () => {
  const parsed = preVisitResponseSchema.parse(validPreVisit);
  assert.equal(parsed.urgency, 'MEDIUM');
  assert.equal(parsed.suggestedQuestions.length, 3);
});

test('a hallucinated extra field never survives into the parsed payload', () => {
  const withHallucination = {
    ...validPreVisit,
    diagnosis: 'Definitely tuberculosis', // the model is never asked for this and must not get to assert it
    prescribedDrug: 'Amoxicillin 500mg',
  };
  const parsed = preVisitResponseSchema.parse(withHallucination);
  assert.equal('diagnosis' in parsed, false);
  assert.equal('prescribedDrug' in parsed, false);
});

test('an invalid urgency enum value is rejected, not coerced', () => {
  const bad = { ...validPreVisit, urgency: 'CRITICAL' };
  assert.throws(() => preVisitResponseSchema.parse(bad));
});

test('suggestedQuestions must be exactly 3 items', () => {
  const tooFew = { ...validPreVisit, suggestedQuestions: ['Only one question?'] };
  assert.throws(() => preVisitResponseSchema.parse(tooFew));

  const tooMany = { ...validPreVisit, suggestedQuestions: [...validPreVisit.suggestedQuestions, 'A fourth question?'] };
  assert.throws(() => preVisitResponseSchema.parse(tooMany));
});

test('a valid post-visit LLM response parses cleanly', () => {
  const valid = {
    summary: 'You were seen for a persistent cough and mild fever, likely a viral infection.',
    medicationSchedule: [
      { drug: 'Paracetamol', dose: '500mg', whenToTake: 'Every 6 hours as needed', howLong: '5 days', notes: 'Take with food.' },
    ],
    followUpSteps: ['Rest and stay hydrated.', 'Return if fever persists beyond 5 days.'],
  };
  const parsed = postVisitResponseSchema.parse(valid);
  assert.equal(parsed.medicationSchedule.length, 1);
});

test('post-visit response missing a required field is rejected', () => {
  const missingSummary = {
    medicationSchedule: [],
    followUpSteps: [],
  };
  assert.throws(() => postVisitResponseSchema.parse(missingSummary));
});

test('post-visit medication entries with the wrong shape are rejected', () => {
  const malformedMedication = {
    summary: 'Summary text.',
    medicationSchedule: [{ drug: 'Paracetamol' }], // missing dose/whenToTake/howLong/notes
    followUpSteps: [],
  };
  assert.throws(() => postVisitResponseSchema.parse(malformedMedication));
});
