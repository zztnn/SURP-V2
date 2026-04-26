import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { RequestContextService } from '../../common';
import { RequirePermission } from '../../common/auth/decorators';
import type { BlockTargetType } from './domain/block';
import { GrantBlockDto } from './dto/grant-block.dto';
import { RevokeBlockDto } from './dto/revoke-block.dto';
import { GetBlockByIdUseCase, type GetBlockByIdResult } from './use-cases/get-block-by-id.use-case';
import { GrantBlockUseCase, type GrantBlockResult } from './use-cases/grant-block.use-case';
import { ListBlocksUseCase, type ListBlocksResult } from './use-cases/list-blocks.use-case';
import { RevokeBlockUseCase, type RevokeBlockResult } from './use-cases/revoke-block.use-case';

@Controller('blocks')
export class BlocksController {
  constructor(
    private readonly grantUseCase: GrantBlockUseCase,
    private readonly revokeUseCase: RevokeBlockUseCase,
    private readonly getByIdUseCase: GetBlockByIdUseCase,
    private readonly listUseCase: ListBlocksUseCase,
    private readonly contextService: RequestContextService,
  ) {}

  @Get()
  @RequirePermission('blocks.blocks.read')
  async list(
    @Query('page') pageRaw?: string,
    @Query('pageSize') pageSizeRaw?: string,
    @Query('targetType') targetTypeRaw?: string,
    @Query('active') activeRaw?: string,
  ): Promise<ListBlocksResult> {
    const ctx = this.contextService.getContextOrThrow();
    return this.listUseCase.execute(
      {
        page: parsePositiveInt(pageRaw, 'page', 1),
        pageSize: parsePositiveInt(pageSizeRaw, 'pageSize', 25),
        ...(targetTypeRaw !== undefined ? { targetType: parseTargetType(targetTypeRaw) } : {}),
        ...(activeRaw !== undefined ? { active: parseBool(activeRaw, 'active') } : {}),
      },
      ctx,
    );
  }

  @Post()
  @HttpCode(201)
  @RequirePermission('blocks.blocks.grant')
  async grant(@Body() dto: GrantBlockDto): Promise<GrantBlockResult> {
    const ctx = this.contextService.getContextOrThrow();
    return this.grantUseCase.execute(
      {
        targetType: dto.targetType,
        targetId: BigInt(dto.targetId),
        reason: dto.reason,
        linkedIncidentId: dto.linkedIncidentId !== undefined ? BigInt(dto.linkedIncidentId) : null,
      },
      ctx,
    );
  }

  @Post(':id/revoke')
  @HttpCode(200)
  @RequirePermission('blocks.blocks.revoke')
  async revoke(
    @Param('id') idParam: string,
    @Body() dto: RevokeBlockDto,
  ): Promise<RevokeBlockResult> {
    const blockId = parseBigInt(idParam, 'id');
    const ctx = this.contextService.getContextOrThrow();
    return this.revokeUseCase.execute({ blockId, revokeReason: dto.revokeReason }, ctx);
  }

  @Get(':id')
  @RequirePermission('blocks.blocks.read')
  async getById(@Param('id') idParam: string): Promise<GetBlockByIdResult> {
    const id = parseBigInt(idParam, 'id');
    const ctx = this.contextService.getContextOrThrow();
    return this.getByIdUseCase.execute({ id }, ctx);
  }
}

function parseBigInt(raw: string, field: string): bigint {
  if (!/^\d+$/.test(raw)) {
    throw new BadRequestException({
      error: 'Bad Request',
      code: 'INVALID_PATH_PARAM',
      message: `${field} debe ser entero positivo`,
    });
  }
  return BigInt(raw);
}

function parsePositiveInt(raw: string | undefined, field: string, fallback: number): number {
  if (raw === undefined || raw === '') return fallback;
  if (!/^\d+$/.test(raw)) {
    throw new BadRequestException({
      error: 'Bad Request',
      code: 'INVALID_QUERY_PARAM',
      message: `${field} debe ser entero positivo`,
    });
  }
  const n = Number(raw);
  if (n < 1) {
    throw new BadRequestException({
      error: 'Bad Request',
      code: 'INVALID_QUERY_PARAM',
      message: `${field} debe ser >= 1`,
    });
  }
  return n;
}

function parseTargetType(raw: string): BlockTargetType {
  if (raw !== 'party' && raw !== 'vehicle') {
    throw new BadRequestException({
      error: 'Bad Request',
      code: 'INVALID_QUERY_PARAM',
      message: 'targetType debe ser party o vehicle',
    });
  }
  return raw;
}

function parseBool(raw: string, field: string): boolean {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new BadRequestException({
    error: 'Bad Request',
    code: 'INVALID_QUERY_PARAM',
    message: `${field} debe ser 'true' o 'false'`,
  });
}
