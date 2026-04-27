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
import type { Semaforo } from './domain/incident';
import { RegisterIncidentDto } from './dto/register-incident.dto';
import { VoidIncidentDto } from './dto/void-incident.dto';
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
import { VoidIncidentUseCase, type VoidIncidentResult } from './use-cases/void-incident.use-case';

const VALID_SEMAFOROS: readonly Semaforo[] = ['no_determinado', 'verde', 'amarillo', 'rojo'];

const MAX_INCIDENT_TYPE_IDS = 50;

@Controller('incidents')
export class IncidentsController {
  constructor(
    private readonly registerUseCase: RegisterIncidentUseCase,
    private readonly listUseCase: ListIncidentsUseCase,
    private readonly getByIdUseCase: GetIncidentByExternalIdUseCase,
    private readonly voidUseCase: VoidIncidentUseCase,
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
    @Query('zoneExternalId') zoneRaw?: string,
    @Query('areaExternalId') areaRaw?: string,
    @Query('propertyExternalId') propertyRaw?: string,
    @Query('semaforo') semaforoRaw?: string,
    @Query('occurredFrom') occurredFromRaw?: string,
    @Query('occurredTo') occurredToRaw?: string,
    @Query('incidentTypeExternalIds') typeIdsRaw?: string,
    @Query('q') freeTextRaw?: string,
    @Query('personSearch') personSearchRaw?: string,
    @Query('vehicleSearch') vehicleSearchRaw?: string,
  ): Promise<ListIncidentsResult> {
    const ctx = this.contextService.getContextOrThrow();
    return this.listUseCase.execute(
      {
        page: parsePositiveInt(pageRaw, 'page', 1),
        pageSize: parsePositiveInt(pageSizeRaw, 'pageSize', 25),
        zoneExternalId: emptyToNull(zoneRaw),
        areaExternalId: emptyToNull(areaRaw),
        propertyExternalId: emptyToNull(propertyRaw),
        semaforo: semaforoRaw !== undefined ? parseSemaforo(semaforoRaw) : null,
        occurredFrom:
          occurredFromRaw !== undefined ? parseDate(occurredFromRaw, 'occurredFrom') : null,
        occurredTo: occurredToRaw !== undefined ? parseDate(occurredToRaw, 'occurredTo') : null,
        incidentTypeExternalIds: parseExternalIdList(typeIdsRaw, 'incidentTypeExternalIds'),
        freeTextSearch: emptyToNull(freeTextRaw),
        personSearch: emptyToNull(personSearchRaw),
        vehicleSearch: emptyToNull(vehicleSearchRaw),
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

  @Post(':externalId/void')
  @HttpCode(200)
  @RequirePermission('incidents.incidents.void')
  async void(
    @Param('externalId') externalId: string,
    @Body() dto: VoidIncidentDto,
  ): Promise<VoidIncidentResult> {
    const ctx = this.contextService.getContextOrThrow();
    return this.voidUseCase.execute({ externalId, voidReason: dto.voidReason }, ctx);
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

function emptyToNull(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function parseExternalIdList(raw: string | undefined, field: string): readonly string[] {
  if (raw === undefined || raw.trim().length === 0) return [];
  // Acepta CSV: `?incidentTypeExternalIds=a,b,c`. Trim por elemento.
  const items = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (items.length > MAX_INCIDENT_TYPE_IDS) {
    throw new BadRequestException({
      error: 'Bad Request',
      code: 'INVALID_QUERY_PARAM',
      message: `${field} excede el máximo de ${String(MAX_INCIDENT_TYPE_IDS)} valores`,
    });
  }
  return items;
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
