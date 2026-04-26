import {
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CLOCK, type ClockPort, DomainError, type RequestContext } from '../../../common';
import type { BlockTargetType } from '../domain/block';
import { BLOCK_REPOSITORY, type BlockRepositoryPort } from '../ports/block.repository.port';

export interface RevokeBlockInput {
  blockId: bigint;
  revokeReason: string;
}

export interface RevokeBlockResult {
  id: string;
  externalId: string;
  targetType: BlockTargetType;
  targetId: string;
  active: boolean;
  revokedAt: Date;
  revokedByUserId: string;
  revokeReason: string;
}

@Injectable()
export class RevokeBlockUseCase {
  constructor(
    @Inject(BLOCK_REPOSITORY) private readonly blocks: BlockRepositoryPort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(input: RevokeBlockInput, ctx: RequestContext): Promise<RevokeBlockResult> {
    if (ctx.userId === null) {
      throw new UnauthorizedException({
        error: 'Unauthorized',
        code: 'AUTH_REQUIRED',
        message: 'Revocar bloqueo requiere usuario autenticado',
      });
    }

    const block = await this.blocks.findById(input.blockId);
    if (!block) {
      throw new NotFoundException({
        error: 'Not Found',
        code: 'BLOCK_NOT_FOUND',
        message: `No existe bloqueo con id=${input.blockId.toString()}`,
      });
    }

    try {
      block.revoke(ctx.userId, input.revokeReason, this.clock.now());
    } catch (e) {
      if (e instanceof DomainError) {
        throw new UnprocessableEntityException({
          error: 'Unprocessable Entity',
          code: e.code,
          message: e.message,
        });
      }
      throw e;
    }

    const persisted = await this.blocks.persist(block);
    const id = persisted.id;
    const externalId = persisted.externalId;
    const revokedAt = persisted.revokedAt;
    const revokedByUserId = persisted.revokedByUserId;
    const revokeReason = persisted.revokeReason;

    if (
      id === null ||
      externalId === null ||
      revokedAt === null ||
      revokedByUserId === null ||
      revokeReason === null
    ) {
      throw new Error('Block revocado pero repo devolvió campos null — bug en persist');
    }

    return {
      id: id.toString(),
      externalId,
      targetType: persisted.targetType,
      targetId: persisted.targetId.toString(),
      active: persisted.active,
      revokedAt,
      revokedByUserId: revokedByUserId.toString(),
      revokeReason,
    };
  }
}
