export const TARGET_EXISTENCE = Symbol('TARGET_EXISTENCE');

/**
 * Verifica que el target del bloqueo polimórfico existe antes de
 * intentar el INSERT. El trigger PG `fn_blocks_check_target_exists`
 * también lo valida server-side, pero atrapando aquí podemos:
 *   1. Devolver 422 con código de aplicación (BLOCK_TARGET_NOT_FOUND)
 *      en vez de 23503 genérico.
 *   2. Evitar el round-trip a un INSERT que sabemos que va a fallar.
 *
 * No verificamos `incidents` (linkedIncidentId): la columna no tiene FK
 * en el schema (comentario explícito en 01_organizations_users_roles.sql).
 * Si más adelante el dominio lo necesita, se agrega `existsIncident()`.
 */
export interface TargetExistencePort {
  existsParty(partyId: bigint): Promise<boolean>;
  existsVehicle(vehicleId: bigint): Promise<boolean>;
}
