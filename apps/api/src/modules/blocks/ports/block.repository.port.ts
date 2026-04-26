import type { Block, BlockTargetType } from '../domain/block';

export const BLOCK_REPOSITORY = Symbol('BLOCK_REPOSITORY');

export interface BlockListFilters {
  targetType?: BlockTargetType;
  /** true = solo activos; false = solo revocados; undefined = todos. */
  active?: boolean;
}

export interface BlockListPage {
  page: number;
  pageSize: number;
  total: number;
  items: Block[];
}

export interface BlockRepositoryPort {
  /**
   * Lookup por id interno (el del controller :id).
   */
  findById(id: bigint): Promise<Block | null>;

  /**
   * Devuelve el bloqueo ACTIVO para un target dado, o null si no hay.
   * El use case lo llama antes de Block.grant() para detectar duplicados
   * con un 409 limpio (en vez de esperar al UNIQUE_VIOLATION).
   */
  findActiveByTarget(targetType: BlockTargetType, targetId: bigint): Promise<Block | null>;

  /**
   * Lista paginada con filtros opcionales. Orden por defecto:
   * `granted_at DESC` (los más recientes primero). page y pageSize son
   * 1-based y validados por el use case.
   */
  findPaginated(filters: BlockListFilters, page: number, pageSize: number): Promise<BlockListPage>;

  /**
   * Persiste un bloqueo recién creado (id null → INSERT). Devuelve el
   * bloqueo con id/externalId hidratados desde el row insertado.
   */
  save(block: Block): Promise<Block>;

  /**
   * Persiste cambios de estado de un bloqueo existente (id no null).
   * Hoy solo lo usa `RevokeBlockUseCase`. La implementación debe
   * UPDATE solo los campos que cambian (active, revoked_at, revoked_by_user_id,
   * revoke_reason) para no pisar created_*.
   */
  persist(block: Block): Promise<Block>;
}
