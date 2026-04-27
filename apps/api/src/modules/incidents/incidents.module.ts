import { Module } from '@nestjs/common';

import { CommonModule } from '../../common';
import { DatabaseModule } from '../../database/database.module';
import { IncidentsController } from './incidents.controller';
import { KyselyGeoContext } from './infrastructure/kysely-geo-context.adapter';
import { KyselyIncidentRepository } from './infrastructure/kysely-incident.repository';
import { GEO_CONTEXT } from './ports/geo-context.port';
import { INCIDENT_REPOSITORY } from './ports/incident.repository.port';
import { CloseIncidentUseCase } from './use-cases/close-incident.use-case';
import { GetIncidentByExternalIdUseCase } from './use-cases/get-incident-by-external-id.use-case';
import { ListIncidentsUseCase } from './use-cases/list-incidents.use-case';
import { RegisterIncidentUseCase } from './use-cases/register-incident.use-case';
import { VoidIncidentUseCase } from './use-cases/void-incident.use-case';

@Module({
  imports: [CommonModule, DatabaseModule],
  controllers: [IncidentsController],
  providers: [
    RegisterIncidentUseCase,
    ListIncidentsUseCase,
    GetIncidentByExternalIdUseCase,
    CloseIncidentUseCase,
    VoidIncidentUseCase,
    { provide: INCIDENT_REPOSITORY, useClass: KyselyIncidentRepository },
    { provide: GEO_CONTEXT, useClass: KyselyGeoContext },
  ],
})
export class IncidentsModule {}
