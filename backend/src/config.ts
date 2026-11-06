import 'dotenv/config';
import { z } from 'zod';

const DEV_JWT_SECRET = 'dev-only-insecure-secret-change-me';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().min(1).default('postgres://localhost:5432/field_equipment'),
    JWT_SECRET: z.string().min(16).default(DEV_JWT_SECRET),
    // 12 hours: roughly one field shift.
    JWT_EXPIRES_IN_SECONDS: z.coerce.number().int().positive().default(12 * 60 * 60),
  })
  .refine((env) => env.NODE_ENV !== 'production' || env.JWT_SECRET !== DEV_JWT_SECRET, {
    message: 'JWT_SECRET must be set in production',
    path: ['JWT_SECRET'],
  });

// Fail fast on bad config instead of at the first query.
export const config = envSchema.parse(process.env);
