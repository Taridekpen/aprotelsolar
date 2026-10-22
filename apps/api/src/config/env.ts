import { z } from 'zod';

const emptyToUndefined = (value: unknown) => {
  if (typeof value === 'string' && value.trim() === '') return undefined;
  return value;
};

const optionalString = z.preprocess(emptyToUndefined, z.string().min(1).optional());

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().int().min(0).max(65535).default(4000),
    TRUST_PROXY: z
      .preprocess((value) => value === true || value === 'true' || value === '1', z.boolean())
      .default(false),
    LOG_LEVEL: z.string().default('info'),
    MONGODB_URI: z.string().min(1),
    CORS_ORIGINS: z.string().default('http://localhost:5173'),
    SESSION_TTL_HOURS: z.coerce.number().positive().max(72).default(8),
    SESSION_IDLE_MINUTES: z.coerce.number().positive().max(1440).default(120),
    COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    COOKIE_SECURE: z.preprocess(emptyToUndefined, z.enum(['true', 'false']).optional()),
    BOOTSTRAP_ADMIN_NAME: optionalString,
    BOOTSTRAP_ADMIN_EMAIL: optionalString,
    BOOTSTRAP_ADMIN_PASSWORD: optionalString,
    PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(180).default(30),
    SMTP_HOST: optionalString,
    SMTP_PORT: z.coerce.number().int().default(587),
    SMTP_SECURE: z
      .preprocess((value) => value === true || value === 'true' || value === '1', z.boolean())
      .default(false),
    SMTP_USER: optionalString,
    SMTP_PASSWORD: optionalString,
    SMTP_FROM: optionalString,
    ORDER_NOTIFY_EMAIL: z.preprocess(emptyToUndefined, z.string().trim().email().optional()),
    MEDIA_MAX_BYTES: z.coerce.number().int().positive().default(8_388_608),
    MEDIA_MAX_DIMENSION: z.coerce.number().int().positive().default(8000),
    MEDIA_ORPHAN_TTL_HOURS: z.coerce.number().int().positive().default(24),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
    LOGIN_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(20).default(5),
    LOGIN_LOCK_MINUTES: z.coerce.number().int().min(1).max(120).default(15),
    LOGIN_IP_MAX: z.coerce.number().int().positive().default(30),
    PAYMENT_PROVIDER: z.enum(['development', 'none', 'paystack', 'flutterwave']).default('development'),
    DEV_PAYMENT_WEBHOOK_SECRET: optionalString,
    PAYSTACK_SECRET_KEY: optionalString,
    FLUTTERWAVE_SECRET_KEY: optionalString,
    FLUTTERWAVE_WEBHOOK_HASH: optionalString,
    PUBLIC_APP_URL: z.string().url().default('http://localhost:5173'),
    API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
    RESERVATION_TTL_MINUTES: z.coerce.number().int().min(5).max(240).default(30),
    RUN_JOBS: z
      .preprocess((value) => value === undefined || value === 'true' || value === '1' || value === true, z.boolean())
      .default(true),
  })
  .superRefine((value, context) => {
    if (value.PAYMENT_PROVIDER === 'development') {
      if (value.NODE_ENV === 'production') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['PAYMENT_PROVIDER'],
          message: 'The development payment adapter cannot be used in production',
        });
      }
      if (!value.DEV_PAYMENT_WEBHOOK_SECRET || value.DEV_PAYMENT_WEBHOOK_SECRET.length < 16) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DEV_PAYMENT_WEBHOOK_SECRET'],
          message: 'DEV_PAYMENT_WEBHOOK_SECRET must be at least 16 characters',
        });
      }
    }
    if (value.PAYMENT_PROVIDER === 'paystack' && !value.PAYSTACK_SECRET_KEY) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['PAYSTACK_SECRET_KEY'],
        message: 'PAYSTACK_SECRET_KEY is required when PAYMENT_PROVIDER=paystack',
      });
    }
    if (value.PAYMENT_PROVIDER === 'flutterwave' && (!value.FLUTTERWAVE_SECRET_KEY || !value.FLUTTERWAVE_WEBHOOK_HASH)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['FLUTTERWAVE_SECRET_KEY'],
        message: 'Flutterwave secret key and webhook hash are required',
      });
    }
  });

export type Env = z.infer<typeof schema> & { cookieSecure: boolean; corsOrigins: string[] };

let cached: Env | null = null;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached && source === process.env) return cached;
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`Invalid environment configuration\n${details}`);
  }
  const env: Env = {
    ...parsed.data,
    cookieSecure: parsed.data.COOKIE_SECURE ? parsed.data.COOKIE_SECURE === 'true' : parsed.data.NODE_ENV === 'production',
    corsOrigins: parsed.data.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean),
  };
  if (source === process.env) cached = env;
  return env;
}

export function resetEnvCache(): void {
  cached = null;
}
