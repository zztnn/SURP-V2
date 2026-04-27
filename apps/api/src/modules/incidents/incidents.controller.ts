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
import type { IncidentState, Semaforo } from './domain/incident';
import { RegisterIncidentDto } from './dto/register-incident.dto';
import {
  GetIncidentByExternalIdUseCase,
  type GetIncidentByExternalIdResult,
} from './use-cases/get-incident-by-external-id.use-case';
import {
  ListIncidentsUseCase,
  type ListIncidentsResult,
} from './use-cases/list-incidents.use-case';
import {
  RegisterIncidentUseCase,
  type RegisterIncidentResult,
} from './use-cases/register-incident.use-case';

const VALID_STATES: readonly IncidentState[] = [
  'draft',
  'submitted',
  'under_review',
  'closed',
  'escalated',
  'voided',
];
const VALID_SEMAFOROS: readonly Semaforo[] = ['no_determinado', 'verde', 'amarillo', 'rojo'];

@Controller('incidents')
export class IncidentsController {
  constructor(
    private readonly registerUseCase: RegisterIncidentUseCase,
    private readonly listUseCase: ListIncidentsUseCase,
    private readonly getByIdUseCase: GetIncidentByExternalIdUseCase,
    private readonly contextService: RequestContextService,
  ) {}

  @Post()
  @HttpCode(201)
  @RequirePermission('incidents.incidents.create')
  async register(@Body() dto: RegisterIncidentDto): Promise<RegisterIncidentResult> {
    const ctx = this.contextService.getContextOrThrow();
    return this.registerUseCase.execute(
      {
        zoneExternalId: dto.zoneExternalId,
        areaExternalId: dto.areaExternalId ?? null,
        propertyExternalId: dto.propertyExternalId ?? null,
        communeExternalId: dto.communeExternalId ?? null,
        incidentTypeExternalId: dto.incidentTypeExternalId,
        operationTypeExternalId: dto.operationTypeExternalId ?? null,
        occurredAt: new Date(dto.occurredAt),
        detectedAt: dto.detectedAt !== undefined ? new Date(dto.detectedAt) : null,
        location: { lat: dto.location.lat, lng: dto.location.lng },
        locationSource: dto.locationSource,
        gpsAccuracyMeters: dto.gpsAccuracyMeters ?? null,
        description: dto.description,
        semaforo: dto.semaforo ?? null,
        timberFate: dto.timberFate ?? null,
        aggravatingFactors: dto.aggravatingFactors ?? [],
      },
      ctx,
    );
  }

  @Get()
  @RequirePermission('incidents.incidents.read')
  async list(
    @Query('page') pageRaw?: string,
    @Query('pageSize') pageSizeRaw?: string,
    @Query('state') stateRaw?: string,
    @Query('zoneExternalId') zoneRaw?: string,
    @Query('semaforo') semaforoRaw?: string,
    @Query('occurredFrom') occurredFromRaw?: string,
    @Query('occurredTo') occurredToRaw?: string,
    @Query('incidentTypeExternalId') typeRaw?: string,
  ): Promise<ListIncidentsResult> {
    const ctx = this.contextService.getContextOrThrow();
    return this.listUseCase.execute(
      {
        page: parsePositiveInt(pageRaw, 'page', 1),
        pageSize: parsePositiveInt(pageSizeRaw, 'pageSize', 25),
        state: stateRaw !== undefined ? parseState(stateRaw) : null,
        zoneExternalId: zoneRaw ?? null,
        semaforo: semaforoRaw !== undefined ? parseSemaforo(semaforoRaw) : null,
        occurredFrom:
          occurredFromRaw !== undefined ? parseDate(occurredFromRaw, 'occurredFrom') : null,
        occurredTo: occurredToRaw !== undefined ? parseDate(occurredToRaw, 'occurredTo') : null,
        incidentTypeExternalId: typeRaw ?? null,
      },
      ctx,
    );
  }

  @Get(':externalId')
  @RequirePermission('incidents.incidents.read')
  async getByExternalId(
    @Param('externalId') externalId: string,
  ): Promise<GetIncidentByExternalIdResult> {
    const ctx = this.contextService.getContextOrThrow();
    return this.getByIdUseCase.execute({ externalId }, ctx);
  }
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
  return Number(raw);
}

function parseState(raw: string): IncidentState {
  if ((VALID_STATES as readonly string[]).includes(raw)) {
    return raw as IncidentState;
  }
  throw new BadRequestException({
    error: 'Bad Request',
    code: 'INVALID_QUERY_PARAM',
    message: `state debe ser uno de: ${VALID_STATES.join(', ')}`,
  });
}

function parseSemaforo(raw: string): Semaforo {
  if ((VALID_SEMAFOROS as readonly string[]).includes(raw)) {
    return raw as Semaforo;
  }
  throw new BadRequestException({
    error: 'Bad Request',
    code: 'INVALID_QUERY_PARAM',
    message: `semaforo debe ser uno de: ${VALID_SEMAFOROS.join(', ')}`,
  });
}

function parseDate(raw: string, field: string): Date {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException({
      error: 'Bad Request',
      code: 'INVALID_QUERY_PARAM',
      message: `${field} debe ser ISO 8601`,
    });
  }
  return d;
}
