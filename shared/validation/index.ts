import { z } from 'zod';

export * from './schemas.js';

// Custom backend environment schema
export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform((s) => parseInt(s, 10)).default('3000'),
  DATABASE_URL: z.string().url().optional(),
  REDIS_URL: z.string().optional(),
  STELLAR_RPC_URL: z.string().optional(),
  SETTLEMENT_CONTRACT_ID: z.string().optional(),
  GOVERNANCE_CONTRACT_ID: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function validateEnv(env: Record<string, unknown>): Env {
  try {
    return EnvSchema.parse(env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const message = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('\n');
      throw new Error(`Invalid environment variables:\n${message}`);
    }
    throw error;
  }
}
