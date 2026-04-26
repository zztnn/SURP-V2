import { Inject, Injectable } from '@nestjs/common';
import type { RequestContext } from '../../../common';
import type { Block, BlockTargetType } from '../domain/block';
import { BLOCK_REPOSITORY, type BlockRepositoryPort } from '../ports/block.repository.port';

export interface ListBlocksInput {
  page: number;
  pageSize: number;
  targetType?: BlockTargetType;
  active?: boolean;
}

export interface ListBlocksItem {
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

export interface ListBlocksResult {
  page: number;
  pageSize: number;
  total: number;
  items: ListBlocksItem[];
}

const MAX_PAGE_SIZE = 100;

@Injectable()
export class ListBlocksUseCase {
  constructor(@Inject(BLOCK_REPOSITORY) private readonly blocks: BlockRepositoryPort) {}

  async execute(input: ListBlocksInput, _ctx: RequestContext): Promise<ListBlocksResult> {
    const page = Math.max(1, Math.floor(input.page));
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(input.pageSize)));
    const result = await this.blocks.findPaginated(
      {
        ...(input.targetType !== undefined ? { targetType: input.targetType } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
      page,
      pageSize,
    );
    return {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      items: result.items.map(toItem),
    };
  }
}

function toItem(block: Block): ListBlocksItem {
  if (block.id === null || block.externalId === null) {
    throw new Error('Block sin id/externalId desde repo — bug en findPaginated');
  }
  return {
    id: block.id.toString(),
    externalId: block.externalId,
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
