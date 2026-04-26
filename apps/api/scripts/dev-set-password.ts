/**
 * Script de DEV ONLY. Asigna password a un user existente del seed.
 * NUNCA usar en staging/prod — el flujo real es:
 *   1. Admin crea user con password_hash=NULL + must_reset_password=true.
 *   2. Sistema envía email con token de reset (vía notification queue).
 *   3. User completa el flujo /auth/set-password.
 *
 * Uso:
 *   DATABASE_URL=... pnpm --filter @surp/api exec ts-node scripts/dev-set-password.ts <email> <password>
 *
 * Ejemplo:
 *   pnpm --filter @surp/api exec ts-node scripts/dev-set-password.ts jquiero@softe.cl 'Surp.Dev.2026!'
 *
 * Comportamiento:
 *   - Hashea con argon2id (mismos parámetros OWASP que el flujo real).
 *   - UPDATE users SET password_hash=$1, password_updated_at=now(),
 *       must_reset_password=false, mfa_required=false
 *     WHERE email=$2.
 *   - mfa_required=false porque MFA TOTP no se implementa en F6 (acordado
 *     en F6 — flujo enrollment llega en F6.5).
 */
import * as argon2 from 'argon2';
import { Kysely, PostgresDialect, CamelCasePlugin } from 'kysely';
import { Pool } from 'pg';
import type { DB } from '../src/database/generated/database.types';

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('DEV ONLY — no ejecutar en producción');
  }
  const [, , email, password] = process.argv;
  if (!email || !password) {
    console.error('Uso: ts-node scripts/dev-set-password.ts <email> <password>');
    process.exit(1);
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL no seteado');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url, max: 2 });
  const db = new Kysely<DB>({
    dialect: new PostgresDialect({ pool }),
    plugins: [new CamelCasePlugin()],
  });

  try {
    const hash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });

    const result = await db
      .updateTable('users')
      .set({
        passwordHash: hash,
        passwordUpdatedAt: new Date(),
        mustResetPassword: false,
        mfaRequired: false,
      })
      .where('email', '=', email)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();

    const updated = Number(result.numUpdatedRows);
    if (updated === 0) {
      console.error(`No se encontró usuario activo con email=${email}`);
      process.exit(2);
    }
    console.log(
      `OK — password asignado a ${email}. mfa_required=false (F6 dev). Filas afectadas: ${String(updated)}`,
    );
  } finally {
    await db.destroy();
  }
}

main().catch((e: unknown) => {
  console.error('Error:', e);
  process.exit(1);
});
