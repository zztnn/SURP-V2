# Module Anatomy — SURP 2.0 API (NestJS)

> Cómo se organiza un módulo de dominio en `apps/api/`.
> Stack: NestJS 11 + Kysely 0.27 (ver `STACK.md` §5 y §6).

---

## Dos patterns — elegís según complejidad

| Pattern                    | Cuándo                                                                 | Ejemplo                                                           |
| -------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **A — 7-file clásico**     | Mantenedor CRUD simple. Pocas reglas de negocio.                       | `catalog/zones`, `catalog/incident-types`, `catalog/institutions` |
| **B — Clean Architecture** | Reglas de dominio complejas, acciones no-CRUD, integraciones externas. | `incidents`, `cases`, `persons`, `maat`                           |

**Regla corta:** ver `skills/CHOOSE-MODULE-PATTERN.md`.

---

# Pattern A — 7-file clásico

Para mantenedores CRUD simples (tipos de incidente, zonas, áreas, instituciones, etc.).

## Layout

```
src/modules/catalog/zones/
├── entities/
│   └── zone.entity.ts
├── dto/
│   ├── create-zone.dto.ts
│   └── update-zone.dto.ts
├── zones.repository.ts
├── zones.service.ts
├── zones.controller.ts
├── zones.module.ts
└── zones.service.spec.ts
```

## Entity file

Los tipos vienen de los tipos generados por `kysely-codegen` (ver `apps/api/src/database/generated/kysely-types.ts`), envueltos con los helpers `Selectable` / `Insertable` / `Updateable` de Kysely.

```typescript
// entities/zone.entity.ts
import type { Selectable, Insertable, Updateable } from 'kysely';
import type { DB } from '@/database/generated/kysely-types';

export type Zone = Selectable<DB['zones']>;
export type NewZone = Insertable<DB['zones']>;
export type ZoneUpdate = Updateable<DB['zones']>;
```

## DTO files

```typescript
// dto/create-zone.dto.ts
export class CreateZoneDto {
  @IsString({ message: 'El nombre debe ser texto.' })
  @IsNotEmpty({ message: 'El nombre es requerido.' })
  @MaxLength(100)
  @ApiProperty({ example: 'Zona Sur' })
  name!: string;

  @IsString({ message: 'El código debe ser texto.' })
  @IsNotEmpty({ message: 'El código es requerido.' })
  @MaxLength(10)
  @ApiProperty({ example: 'ZS' })
  code!: string;
}
```

Excluir siempre de DTOs: `id`, `external_id` (generados por BD), `created_at`, `updated_at`, `created_by_id`, `updated_by_id`, `deleted_at`. Los DTOs usan camelCase; el repositorio hace el mapeo a snake_case que entiende Kysely.

## Repository file

Solo acceso a datos vía Kysely. **No lógica de negocio.**

```typescript
// zones.repository.ts
import { Inject, Injectable } from '@nestjs/common';
import { KYSELY, type KyselyDb } from '@/database/database.module';
import type { Zone, NewZone, ZoneUpdate } from './entities/zone.entity';

@Injectable()
export class ZonesRepository {
  constructor(@Inject(KYSELY) private readonly db: KyselyDb) {}

  async findAll(): Promise<Zone[]> {
    return this.db
      .selectFrom('zones')
      .selectAll()
      .where('deleted_at', 'is', null)
      .orderBy('name', 'asc')
      .execute();
  }

  async findById(id: number): Promise<Zone | null> {
    const row = await this.db
      .selectFrom('zones')
      .selectAll()
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    return row ?? null;
  }

  async findByExternalId(externalId: string): Promise<Zone | null> {
    const row = await this.db
      .selectFrom('zones')
      .selectAll()
      .where('external_id', '=', externalId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    return row ?? null;
  }

  async insert(data: NewZone): Promise<Zone> {
    return this.db.insertInto('zones').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async update(id: number, patch: ZoneUpdate): Promise<Zone> {
    return this.db
      .updateTable('zones')
      .set(patch)
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async softDelete(id: number): Promise<void> {
    await this.db
      .updateTable('zones')
      .set({ deleted_at: new Date() })
      .where('id', '=', id)
      .execute();
  }
}
```

Notas:

- Nombres de columna en `snake_case` (`deleted_at`, `external_id`) — coincide con el schema SQL, sin plugin de camelCase (ver `POSTGIS-PATTERNS.md`).
- `selectAll()` está OK en Pattern A porque las tablas son chicas y sin geometrías grandes. En Pattern B o tablas con `geometry`, listar columnas explícitas.
- `NUNCA` filtrar por `tenant_id` — no existe en SURP (ver ADR-B-003 para el modelo multi-organización).

## Controller file

```typescript
@ApiTags('catalog/zones')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('zones')
export class ZonesController {
  constructor(private readonly service: ZonesService) {}

  @Get(':externalId')
  @RequirePermission('catalog.zones.read')
  @ApiOperation({ summary: 'Obtiene una zona por su UUID' })
  async findOne(
    @Param('externalId') externalId: string,
    @CurrentContext() ctx: RequestContext,
  ): Promise<ZoneResponseDto> {
    return this.service.findByExternalId(externalId, ctx);
  }
}
```

---

# Pattern B — Clean Architecture / Hexagonal

Para módulos con reglas de dominio complejas: `incidents`, `cases`, `persons`, `maat`, etc.

## Idea central

- **domain/** → reglas puras. Sin NestJS, sin Kysely, sin HTTP.
- **use-cases/** → operaciones de negocio (crear incidente, cerrar causa, vincular persona).
- **ports/** → interfaces (contratos) que el use case necesita.
- **infrastructure/** → implementaciones concretas (Kysely, MAAT HTTP, Azure Blob).
- **controllers/** → HTTP delgado.
- **module.ts** → DI wiring.

## Layout

```
src/modules/incidents/
├── domain/
│   ├── incident.ts                         ← clase de dominio pura
│   └── incident-status.ts                  ← value objects, enums
├── ports/
│   └── incident.repository.port.ts         ← interface
├── use-cases/
│   ├── create-incident.use-case.ts
│   ├── close-incident.use-case.ts
│   ├── add-evidence.use-case.ts
│   └── find-incidents-in-property.use-case.ts
├── infrastructure/
│   ├── kysely-incident.repository.ts
│   └── incident.mapper.ts
├── dto/
│   ├── create-incident.dto.ts
│   └── update-incident.dto.ts
├── incidents.controller.ts
├── incidents.module.ts
└── incidents.use-case.spec.ts
```

## Capa domain/

```typescript
// domain/incident.ts
export class Incident {
  constructor(
    public readonly id: number,
    public readonly externalId: string,
    public readonly incidentType: IncidentType,
    public location: GeoPoint,
    public status: IncidentStatus,
    public occurredAt: Date,
    public propertyId: number | null,
  ) {}

  close(resolution: string): void {
    if (this.status === 'closed') {
      throw new DomainError('El incidente ya está cerrado.');
    }
    if (!resolution || resolution.trim().length < 5) {
      throw new DomainError('La resolución requiere al menos 5 caracteres.');
    }
    this.status = 'closed';
  }

  addEvidence(): void {
    if (this.status === 'closed') {
      throw new DomainError('No se puede agregar evidencia a un incidente cerrado.');
    }
  }
}
```

## Capa ports/

```typescript
// ports/incident.repository.port.ts
export const INCIDENT_REPOSITORY = Symbol('INCIDENT_REPOSITORY');

export interface IncidentRepositoryPort {
  findByExternalId(externalId: string): Promise<Incident | null>;
  save(incident: Incident): Promise<Incident>;
  findInBoundingBox(bbox: MapBounds): Promise<Incident[]>;
}
```

## Capa infrastructure/

La implementación concreta usa Kysely. El archivo se llama por la tecnología (`kysely-incident.repository.ts`) para dejar claro qué driver usa.

```typescript
// infrastructure/kysely-incident.repository.ts
import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { KYSELY, type KyselyDb } from '@/database/database.module';
import { asGeoJson, makePoint } from '@/database/geo';
import type { IncidentRepositoryPort } from '../ports/incident.repository.port';
import { Incident } from '../domain/incident';
import { IncidentMapper } from './incident.mapper';

@Injectable()
export class KyselyIncidentRepository implements IncidentRepositoryPort {
  constructor(@Inject(KYSELY) private readonly db: KyselyDb) {}

  async findByExternalId(externalId: string): Promise<Incident | null> {
    const row = await this.db
      .selectFrom('incidents')
      .select([
        'id',
        'external_id',
        'incident_type',
        'occurred_at',
        'status',
        'property_id',
        asGeoJson('location').as('location'),
      ])
      .where('external_id', '=', externalId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    return row ? IncidentMapper.toDomain(row) : null;
  }

  async save(incident: Incident): Promise<Incident> {
    const patch = IncidentMapper.toPersistence(incident);
    const row = await this.db
      .updateTable('incidents')
      .set({
        status: patch.status,
        location: makePoint(patch.lng, patch.lat),
        updated_at: new Date(),
      })
      .where('id', '=', incident.id)
      .returning([
        'id',
        'external_id',
        'incident_type',
        'occurred_at',
        'status',
        'property_id',
        asGeoJson('location').as('location'),
      ])
      .executeTakeFirstOrThrow();
    return IncidentMapper.toDomain(row);
  }
}
```

El **mapper** (`incident.mapper.ts`) traduce entre el row de Kysely (snake_case, GeoJSON plain) y el objeto de dominio (camelCase, `GeoPoint` value object). Es el único lugar que sabe de ambos idiomas.

## Capa use-cases/

```typescript
// use-cases/close-incident.use-case.ts
@Injectable()
export class CloseIncidentUseCase {
  constructor(
    @Inject(INCIDENT_REPOSITORY)
    private readonly repo: IncidentRepositoryPort,
    private readonly auditLogger: AuditService,
  ) {}

  async execute(
    input: { externalId: string; resolution: string },
    ctx: RequestContext,
  ): Promise<Incident> {
    const incident = await this.repo.findByExternalId(input.externalId);
    if (!incident) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Incidente no encontrado.' });
    }
    incident.close(input.resolution); // regla de dominio pura
    const saved = await this.repo.save(incident);
    await this.auditLogger.logEvent({
      actionCode: 'incident_closed',
      entityType: 'incidents',
      entityId: incident.id,
      ctx,
    });
    return saved;
  }
}
```

## Acciones no-CRUD

`close`, `reopen`, `escalate`, `link_complaint`, `add_evidence`, etc. SIEMPRE:

1. Validan pre-condiciones (estado, permisos).
2. Ejecutan la transacción de dominio.
3. Llaman explícitamente a `AuditService.logEvent()` con el action type.

Se exponen como `POST /entity/:externalId/{action}` — nunca como flags en un PATCH.

## Module file (wiring)

```typescript
@Module({
  imports: [DatabaseModule, AuditModule, GeoModule],
  controllers: [IncidentsController],
  providers: [
    CreateIncidentUseCase,
    CloseIncidentUseCase,
    AddEvidenceUseCase,
    FindIncidentsInPropertyUseCase,
    {
      provide: INCIDENT_REPOSITORY,
      useClass: KyselyIncidentRepository,
    },
  ],
  exports: [FindIncidentsInPropertyUseCase],
})
export class IncidentsModule {}
```

---

# Reglas comunes a ambos patterns

- URLs y referencias cross-módulo usan `external_id` (UUID), nunca `id` (BIGSERIAL interno).
- `PATCH` (no `PUT`) para updates parciales.
- Tests: Pattern A → `*.service.spec.ts` con mocks del repository. Pattern B → `*.domain.spec.ts` (unitarios puros) + `*.use-case.spec.ts` (mocks de ports).
- Integraciones externas (MAAT, Azure Blob) siempre via interface inyectada — nunca llamadas HTTP directas desde dominio/service.
- Archivos ≤ 1000 líneas (enforzado por ESLint; 1500 en tests/generated).
- Coverage mínimo 80%.
