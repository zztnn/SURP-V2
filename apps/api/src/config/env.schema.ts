import { z } from 'zod';

// Schema Zod del entorno SURP API. Fail-closed: en producción, las
// variables sensibles (JWT_SECRET, DATABASE_URL) son obligatorias y la
// app no arranca si faltan. En dev/test se permiten defaults laxos para
// fricción mínima.
//
// Cada nueva integración (Storage, Mail, BullMQ, Application Insights)
// agrega su sección al schema con la misma disciplina.

const NODE_ENVS = ['development', 'test', 'production'] as const;

const baseSchema = z.object({
  NODE_ENV: z.enum(NODE_ENVS).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  // Database
  DATABASE_URL: z.url('DATABASE_URL debe ser un URL válido (postgres://...)'),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),

  // CORS — lista separada por coma. Vacío = sin CORS habilitado.
  CORS_ORIGIN: z.string().optional(),

  // Worker mode flag — string 'true'/'false', NO boolean coerced.
  // El bootstrap dual-mode lee process.env.WORKER_MODE directamente; aquí
  // solo lo tipamos para que el resto del código sepa que existe.
  WORKER_MODE: z.enum(['true', 'false']).optional(),

  // Logging
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // JWT — requerido en TODOS los entornos (F6 activó auth global).
  // En producción se exige ≥64 chars; en dev/test ≥32 chars.
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
});

const productionRefinement = baseSchema.refine(
  (env) => {
    if (env.NODE_ENV !== 'production') return true;
    return env.JWT_SECRET.length >= 64;
  },
  {
    message: 'En NODE_ENV=production, JWT_SECRET debe tener al menos 64 caracteres',
    path: ['JWT_SECRET'],
  },
);

export type Env = z.infer<typeof baseSchema>;

export function validateEnv(rawConfig: Record<string, unknown>): Env {
  const result = productionRefinement.safeParse(rawConfig);
  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuración inválida del entorno:\n${errors}`);
  }
  return result.data;
}
