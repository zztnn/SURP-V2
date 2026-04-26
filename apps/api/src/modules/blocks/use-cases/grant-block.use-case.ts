import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CLOCK, type ClockPort, type RequestContext } from '../../../common';
import { EnqueueNotificationUseCase } from '../../notifications';
import { Block, type BlockTargetType } from '../domain/block';
import { BLOCK_REPOSITORY, type BlockRepositoryPort } from '../ports/block.repository.port';
import { TARGET_EXISTENCE, type TargetExistencePort } from '../ports/target-existence.port';

const ADMIN_NOTIFY_EMAIL = 'ivan.vuskovic@arauco.com';

export interface GrantBlockInput {
  targetType: BlockTargetType;
  targetId: bigint;
  reason: string;
  linkedIncidentId: bigint | null;
}

export interface GrantBlockResult {
  id: string;
  externalId: string;
  targetType: BlockTargetType;
  targetId: string;
  reason: string;
  active: boolean;
  grantedAt: Date;
  grantedByUserId: string;
  linkedIncidentId: string | null;
  /** WARN del use case cuando linkedIncidentId es null (Ley 21.719). */
  warning: string | null;
}

@Injectable()
export class GrantBlockUseCase {
  private readonly logger = new Logger(GrantBlockUseCase.name);

  constructor(
    @Inject(BLOCK_REPOSITORY) private readonly blocks: BlockRepositoryPort,
    @Inject(TARGET_EXISTENCE) private readonly targets: TargetExistencePort,
    @Inject(CLOCK) private readonly clock: ClockPort,
    private readonly enqueueNotification: EnqueueNotificationUseCase,
  ) {}

  async execute(input: GrantBlockInput, ctx: RequestContext): Promise<GrantBlockResult> {
    if (ctx.userId === null) {
      // Defense in depth — el guard global ya rechaza requests anónimas.
      throw new UnauthorizedException({
        error: 'Unauthorized',
        code: 'AUTH_REQUIRED',
        message: 'Bloquear requiere usuario autenticado',
      });
    }

    const exists = await this.checkTargetExists(input.targetType, input.targetId);
    if (!exists) {
      throw new UnprocessableEntityException({
        error: 'Unprocessable Entity',
        code: 'BLOCK_TARGET_NOT_FOUND',
        message: `No existe ${input.targetType} con id=${input.targetId.toString()}`,
      });
    }

    const existingActive = await this.blocks.findActiveByTarget(input.targetType, input.targetId);
    if (existingActive) {
      throw new ConflictException({
        error: 'Conflict',
        code: 'BLOCK_ALREADY_ACTIVE',
        message: `Ya existe un bloqueo activo para ${input.targetType} ${input.targetId.toString()}`,
        existingBlockId: existingActive.id?.toString() ?? null,
      });
    }

    const block = Block.grant({
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      grantedByUserId: ctx.userId,
      grantedAt: this.clock.now(),
      linkedIncidentId: input.linkedIncidentId,
    });

    const persisted = await this.blocks.save(block);

    const warning = input.linkedIncidentId === null ? this.warnNoIncident(persisted, ctx) : null;

    const id = persisted.id;
    const externalId = persisted.externalId;
    if (id === null || externalId === null) {
      // El repo debe hidratar id/externalId después del INSERT. Si no
      // pasó, hay un bug en el adapter.
      throw new Error('Block persistido sin id/externalId — bug en repo.save');
    }

    if (input.linkedIncidentId === null) {
      await this.notifyAdminOfBlockWithoutIncident(persisted, ctx);
    }

    return {
      id: id.toString(),
      externalId,
      targetType: persisted.targetType,
      targetId: persisted.targetId.toString(),
      reason: persisted.reason,
      active: persisted.active,
      grantedAt: persisted.grantedAt,
      grantedByUserId: persisted.grantedByUserId.toString(),
      linkedIncidentId: persisted.linkedIncidentId?.toString() ?? null,
      warning,
    };
  }

  private async checkTargetExists(t: BlockTargetType, id: bigint): Promise<boolean> {
    if (t === 'party') return this.targets.existsParty(id);
    return this.targets.existsVehicle(id);
  }

  private warnNoIncident(block: Block, ctx: RequestContext): string {
    // Ley 21.719: el balance de licitud (interés legítimo) es más débil
    // sin vínculo a incidente concreto. Loggeamos para que el equipo URP
    // pueda revisar bloqueos sin sustento documental periódicamente.
    const msg = `Bloqueo ${String(block.id ?? '?')} otorgado sin linked_incident_id — revisar bajo Ley 21.719`;
    this.logger.warn(`${msg} (user=${String(ctx.userId)} request=${ctx.requestId})`);
    return msg;
  }

  /**
   * Best-effort: encola email al admin URP. Si falla, NO bloqueamos el
   * grant del bloqueo (que ya está persistido). El error queda en logs.
   */
  private async notifyAdminOfBlockWithoutIncident(
    block: Block,
    ctx: RequestContext,
  ): Promise<void> {
    if (block.id === null) return;
    try {
      await this.enqueueNotification.execute(
        {
          code: 'block.granted_without_incident',
          recipients: [{ email: ADMIN_NOTIFY_EMAIL, userId: null }],
          context: {
            blockId: block.id.toString(),
            targetType: block.targetType,
            targetId: block.targetId.toString(),
            reason: block.reason,
            grantedByUserId: block.grantedByUserId.toString(),
            grantedAt: block.grantedAt.toISOString(),
          },
        },
        ctx,
      );
    } catch (e) {
      this.logger.error(
        `No se pudo encolar notification block.granted_without_incident: ${(e as Error).message}`,
      );
    }
  }
}
