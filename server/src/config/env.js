import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  API_BASE_URL: z.string().url(),
  CLIENT_BASE_URL: z.string().url(),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),

  CALENDAR_TOKEN_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, 'CALENDAR_TOKEN_KEY must be 32 bytes as hex (64 hex chars)'),

  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().url(),

  SENDGRID_API_KEY: z.string().min(1),
  MAIL_FROM: z.string().min(1),
  MAIL_FROM_NAME: z.string().min(1),

  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(20000),

  HOLD_DURATION_MINUTES: z.coerce.number().int().positive().default(10),
  REMINDER_QUIET_HOURS_START: z.coerce.number().int().min(0).max(23).default(22),
  REMINDER_QUIET_HOURS_END: z.coerce.number().int().min(0).max(23).default(7),

  ADMIN_SEED_EMAIL: z.string().email(),
  ADMIN_SEED_PASSWORD: z.string().min(8, 'ADMIN_SEED_PASSWORD must be at least 8 chars'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
