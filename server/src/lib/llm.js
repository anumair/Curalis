import OpenAI from 'openai';
import { env } from '../config/env.js';

const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

// Typed so callers (the retry taxonomy in ai.service.js) can branch on
// failure kind without string-matching error messages.
export class LlmTimeoutError extends Error {}
export class LlmAuthError extends Error {}
export class LlmRateLimitError extends Error {}
export class LlmInvalidResponseError extends Error {}

// Server-side only — this file is never imported by client code, and the
// API key never appears in any response.
export async function generateJson({ systemPrompt, userPrompt }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.LLM_TIMEOUT_MS);

  try {
    const completion = await client.chat.completions.create(
      {
        model: env.OPENAI_MODEL,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      },
      { signal: controller.signal }
    );

    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new LlmInvalidResponseError('Empty response from model');

    try {
      return JSON.parse(raw);
    } catch {
      throw new LlmInvalidResponseError('Model did not return valid JSON');
    }
  } catch (err) {
    // The SDK throws APIUserAbortError on our own AbortController firing —
    // it does NOT set err.name to 'AbortError' or set a .status, so it has
    // to be identified by type, not by duck-typing those fields.
    if (err instanceof OpenAI.APIUserAbortError) throw new LlmTimeoutError('LLM request timed out');
    if (err.status === 401) throw new LlmAuthError(err.message ?? 'Invalid OpenAI API key');
    if (err.status === 429) throw new LlmRateLimitError(err.message ?? 'Rate limited by OpenAI');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
