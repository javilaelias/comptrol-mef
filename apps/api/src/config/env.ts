import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).optional(),
    PORT: z.coerce.number().int().positive().optional(),

    DATABASE_URL: z.string().min(1),
    JWT_SECRET: z.string().min(16),

    CORS_ORIGINS: z.string().optional(),

    THROTTLE_ENABLED: z
      .union([z.literal('1'), z.literal('0'), z.literal('true'), z.literal('false')])
      .optional(),
    THROTTLE_TTL_SEC: z.coerce.number().int().positive().optional(),
    THROTTLE_LIMIT: z.coerce.number().int().positive().optional(),

    REQUEST_LOG_ENABLED: z
      .union([z.literal('1'), z.literal('0'), z.literal('true'), z.literal('false')])
      .optional(),

    AGENT_API_KEY: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    const nodeEnv = val.NODE_ENV ?? 'development';

    if (nodeEnv === 'production') {
      if (!val.CORS_ORIGINS?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['CORS_ORIGINS'],
          message: 'CORS_ORIGINS is required in production.',
        });
      }

      if (val.JWT_SECRET === 'change-me-in-prod') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_SECRET'],
          message: 'JWT_SECRET must be changed for production.',
        });
      }
    }
  });

type ParsedEnv = z.infer<typeof envSchema>;

export type AppEnv = Omit<
  ParsedEnv,
  'PORT' | 'CORS_ORIGINS' | 'THROTTLE_ENABLED' | 'THROTTLE_TTL_SEC' | 'THROTTLE_LIMIT' | 'REQUEST_LOG_ENABLED'
> & {
  PORT: number;
  CORS_ORIGINS: string;
  THROTTLE_ENABLED: boolean;
  THROTTLE_TTL_SEC: number;
  THROTTLE_LIMIT: number;
  REQUEST_LOG_ENABLED: boolean;
};

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return value === '1' || value === 'true';
}

export function validateEnv(env: Record<string, unknown>): AppEnv {
  const parsed = envSchema.parse(env);
  const nodeEnv = parsed.NODE_ENV ?? 'development';

  const corsOrigins =
    parsed.CORS_ORIGINS?.trim() ||
    (nodeEnv === 'production' ? '' : 'http://localhost:3000,http://127.0.0.1:3000');

  const throttleEnabled = parseBoolean(parsed.THROTTLE_ENABLED, true);
  const requestLogEnabled = parseBoolean(parsed.REQUEST_LOG_ENABLED, nodeEnv !== 'test');

  const result: AppEnv = {
    ...parsed,
    PORT: parsed.PORT ?? 3001,
    CORS_ORIGINS: corsOrigins,
    THROTTLE_ENABLED: throttleEnabled,
    THROTTLE_TTL_SEC: parsed.THROTTLE_TTL_SEC ?? 60,
    THROTTLE_LIMIT: parsed.THROTTLE_LIMIT ?? 300,
    REQUEST_LOG_ENABLED: requestLogEnabled,
  };
  return result;
}

export function parseCorsOrigins(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
