# Module Anatomy — SURP 2.0 API (NestJS)

> Cómo se organiza un módulo de dominio en `apps/api/`.

---

## Dos patterns — elegís según complejidad

| Pattern | Cuándo | Ejemplo |
|---------|--------|---------|
| **A — 7-file clásico** | Mantenedor CRUD simple. Pocas reglas de negocio. | `catalog/zones`, `catalog/incident-types`, `catalog/institutions` |
| **B — Clean Architecture** | Reglas de dominio complejas, acciones no-CRUD, integraciones externas. | `incidents`, `cases`, `persons`, `maat` |

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

```typescript
import { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { zones } from '@/database/schema/catalog';

export type Zone = InferSelectModel<typeof zones>;
export type NewZone = InferInsertModel<typeof zones>;
```

## DTO files

```typescript
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

Excluir siempre de DTOs: `id`, `external_id` (generados por BD), `created_at`, `updated_at`, `created_by_id`, `updated_by_id`, `deleted_at`.

## Repository file

Solo acceso a datos vía Drizzle. **No lógica de negocio.**

```typescript
@Injectable()
export class ZonesRepository {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>) {}

  async findAll(): Promise<Zone[]> {
    return this.db
      .select()
      .from(zones)
      .where(isNull(zones.deletedAt))
      .orderBy(zones.name);
  }

  async findById(id: number): Promise<Zone | null> {
    const [row] = await this.db
      .select()
      .from(zones)
      .where(and(eq(zones.id, id), isNull(zones.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  async insert(data: NewZone): Promise<Zone> {
    const [row] = await this.db.insert(zones).values(data).returning();
    return row;
  }
}
```

NUNCA filtrar por `tenant_id` — no existe en SURP.

## Controller file

```typescript
@ApiTags('catalog/zones')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('zones')
export class ZonesController {
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

- **domain/** → reglas puras. Sin NestJS, sin Drizzle, sin HTTP.
- **use-cases/** → operaciones de negocio (crear incidente, cerrar causa, vincular persona).
- **ports/** → interfaces (contratos) que el use case necesita.
- **infrastructure/** → implementaciones concretas (Drizzle, MAAT HTTP, Azure Blob).
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
│   ├── drizzle-incident.repository.ts
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

## Capa use-cases/

```typescript
// use-cases/close-incident.use-case.ts
@Injectable()
export class CloseIncidentUseCase {
  constructor(
    @Inject(INCIDENT_REPOSITORY)
    private readonly repo: IncidentRepositoryPort,
    private readonly auditLogger: AuditLogger,
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
3. Llaman explícitamente a `fn_audit_log_event()` con el action type.

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
      useClass: DrizzleIncidentRepository,
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
