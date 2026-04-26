import { DomainError } from '../../../common';

export type BlockTargetType = 'party' | 'vehicle';

export interface BlockSnapshot {
  readonly id: bigint | null;
  readonly externalId: string | null;
  readonly targetType: BlockTargetType;
  readonly targetId: bigint;
  readonly reason: string;
  readonly active: boolean;
  readonly grantedAt: Date;
  readonly grantedByUserId: bigint;
  readonly revokedAt: Date | null;
  readonly revokedByUserId: bigint | null;
  readonly revokeReason: string | null;
  readonly linkedIncidentId: bigint | null;
}

/**
 * Bloqueo polimórfico (party | vehicle). La entidad concentra las
 * invariantes que el use case y el schema NO capturan por sí solos:
 *
 *   - reason ≥ 30 chars (Ley 21.719 — finalidad determinada).
 *     El schema solo exige NOT NULL; aceptaría "x". El dominio
 *     rechaza textos triviales.
 *   - revokeReason ≥ 10 chars cuando se revoca.
 *   - active/revoked consistency reflejada en `revoke()`.
 *
 * El registro polimórfico (target válido en parties o vehicles) se
 * verifica en `GrantBlockUseCase` vía `TargetExistencePort` antes de
 * llegar al trigger PG, para mejor UX (422 con código en vez de 23503).
 *
 * `linkedIncidentId` es OPCIONAL en la BD pero el use case loggea WARN
 * cuando es null — el balance de licitud (interés legítimo) es más
 * débil sin vínculo a incidente. Ver invocación /legal-datos del
 * F7 para contexto completo.
 */
const REASON_MIN_LENGTH = 30;
const REVOKE_REASON_MIN_LENGTH = 10;
const VALID_TARGET_TYPES: readonly BlockTargetType[] = ['party', 'vehicle'];

export class Block {
  private constructor(
    public readonly id: bigint | null,
    public readonly externalId: string | null,
    public readonly targetType: BlockTargetType,
    public readonly targetId: bigint,
    private _reason: string,
    private _active: boolean,
    public readonly grantedAt: Date,
    public readonly grantedByUserId: bigint,
    private _revokedAt: Date | null,
    private _revokedByUserId: bigint | null,
    private _revokeReason: string | null,
    public readonly linkedIncidentId: bigint | null,
  ) {}

  /**
   * Factory para nuevos bloqueos. id/externalId quedan null hasta que
   * el repo los asigne en `save()`.
   */
  static grant(input: {
    targetType: BlockTargetType;
    targetId: bigint;
    reason: string;
    grantedByUserId: bigint;
    grantedAt: Date;
    linkedIncidentId: bigint | null;
  }): Block {
    if (!VALID_TARGET_TYPES.includes(input.targetType)) {
      throw new DomainError(
        `targetType inválido: ${input.targetType}`,
        'BLOCK_INVALID_TARGET_TYPE',
      );
    }
    if (input.targetId <= 0n) {
      throw new DomainError(
        `targetId inválido: ${String(input.targetId)}`,
        'BLOCK_INVALID_TARGET_ID',
      );
    }
    const trimmedReason = input.reason.trim();
    if (trimmedReason.length < REASON_MIN_LENGTH) {
      throw new DomainError(
        `reason debe tener al menos ${String(REASON_MIN_LENGTH)} caracteres significativos (Ley 21.719 — finalidad determinada)`,
        'BLOCK_REASON_TOO_SHORT',
      );
    }
    if (input.grantedByUserId <= 0n) {
      throw new DomainError('grantedByUserId requerido', 'BLOCK_INVALID_GRANTOR');
    }
    return new Block(
      null,
      null,
      input.targetType,
      input.targetId,
      trimmedReason,
      true,
      input.grantedAt,
      input.grantedByUserId,
      null,
      null,
      null,
      input.linkedIncidentId,
    );
  }

  /**
   * Reconstruye desde un row de BD. NO ejecuta invariantes de creación
   * (el row puede contener data legacy migrada que no las cumple).
   */
  static fromSnapshot(s: BlockSnapshot): Block {
    return new Block(
      s.id,
      s.externalId,
      s.targetType,
      s.targetId,
      s.reason,
      s.active,
      s.grantedAt,
      s.grantedByUserId,
      s.revokedAt,
      s.revokedByUserId,
      s.revokeReason,
      s.linkedIncidentId,
    );
  }

  get reason(): string {
    return this._reason;
  }

  get active(): boolean {
    return this._active;
  }

  get revokedAt(): Date | null {
    return this._revokedAt;
  }

  get revokedByUserId(): bigint | null {
    return this._revokedByUserId;
  }

  get revokeReason(): string | null {
    return this._revokeReason;
  }

  /**
   * Aplica revocación. Lanza si:
   *   - El bloqueo ya está revocado.
   *   - revokeReason es trivial (< 10 chars).
   *   - revokedByUserId inválido.
   */
  revoke(by: bigint, reason: string, at: Date): void {
    if (!this._active) {
      throw new DomainError('Bloqueo ya revocado', 'BLOCK_ALREADY_REVOKED');
    }
    if (by <= 0n) {
      throw new DomainError('revokedByUserId requerido', 'BLOCK_INVALID_REVOKER');
    }
    const trimmed = reason.trim();
    if (trimmed.length < REVOKE_REASON_MIN_LENGTH) {
      throw new DomainError(
        `revokeReason debe tener al menos ${String(REVOKE_REASON_MIN_LENGTH)} caracteres`,
        'BLOCK_REVOKE_REASON_TOO_SHORT',
      );
    }
    this._active = false;
    this._revokedAt = at;
    this._revokedByUserId = by;
    this._revokeReason = trimmed;
  }

  /**
   * Snapshot para persistencia. La entidad expone su estado interno
   * solo a través de este método (evita mutaciones laterales del repo).
   */
  toSnapshot(): BlockSnapshot {
    return {
      id: this.id,
      externalId: this.externalId,
      targetType: this.targetType,
      targetId: this.targetId,
      reason: this._reason,
      active: this._active,
      grantedAt: this.grantedAt,
      grantedByUserId: this.grantedByUserId,
      revokedAt: this._revokedAt,
      revokedByUserId: this._revokedByUserId,
      revokeReason: this._revokeReason,
      linkedIncidentId: this.linkedIncidentId,
    };
  }
}
