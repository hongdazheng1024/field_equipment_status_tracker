import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1).default('postgres://localhost:5432/field_equipment'),
});

// Fail fast on bad config instead of at the first query.
export const config = envSchema.parse(process.env);
