// Token de inyección para Kysely<DB>. En lugar de inyectar el tipo
// directamente (que NestJS no puede resolver al ser una interfaz),
// usamos un símbolo único como provider key.
export const DATABASE = Symbol('DATABASE');
