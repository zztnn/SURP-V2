import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { RequestContext } from '../../../common';
import type { BlockTargetType } from '../domain/block';
import { BLOCK_REPOSITORY, type BlockRepositoryPort } from '../ports/block.repository.port';

export interface GetBlockByIdInput {
  id: bigint;
}

export interface GetBlockByIdResult {
  id: string;
  externalId: string;
  targetType: BlockTargetType;
  targetId: string;
  reason: string;
  active: boolean;
  grantedAt: Date;
  grantedByUserId: string;
  revokedAt: Date | null;
  revokedByUserId: string | null;
  revokeReason: string | null;
  linkedIncidentId: string | null;
}

@Injectable()
export class GetBlockByIdUseCase {
  constructor(@Inject(BLOCK_REPOSITORY) private readonly blocks: BlockRepositoryPort) {}

  async execute(input: GetBlockByIdInput, _ctx: RequestContext): Promise<GetBlockByIdResult> {
    const block = await this.blocks.findById(input.id);
    if (!block) {
      throw new NotFoundException({
        error: 'Not Found',
        code: 'BLOCK_NOT_FOUND',
        message: `No existe bloqueo con id=${input.id.toString()}`,
      });
    }
    const id = block.id;
    const externalId = block.externalId;
    if (id === null || externalId === null) {
      throw new Error('Bloqueo sin id/externalId post-findById — bug en repo');
    }
    return {
      id: id.toString(),
      externalId,
      targetType: block.targetType,
      targetId: block.targetId.toString(),
      reason: block.reason,
      active: block.active,
      grantedAt: block.grantedAt,
      grantedByUserId: block.grantedByUserId.toString(),
      revokedAt: block.revokedAt,
      revokedByUserId: block.revokedByUserId?.toString() ?? null,
      revokeReason: block.revokeReason,
      linkedIncidentId: block.linkedIncidentId?.toString() ?? null,
    };
  }
}
