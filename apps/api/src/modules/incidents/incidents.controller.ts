import { Body, Controller, HttpCode, Post } from '@nestjs/common';

import { RequestContextService } from '../../common';
import { RequirePermission } from '../../common/auth/decorators';
import { RegisterIncidentDto } from './dto/register-incident.dto';
import {
  RegisterIncidentUseCase,
  type RegisterIncidentResult,
} from './use-cases/register-incident.use-case';

@Controller('incidents')
export class IncidentsController {
  constructor(
    private readonly registerUseCase: RegisterIncidentUseCase,
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
}
