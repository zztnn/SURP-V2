import {
  ForbiddenException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { type RequestContext } from '../../../common';
import {
  GEO_CONTEXT,
  type GeoContextPort,
  type ResolvedArea,
  type ResolvedIncidentType,
  type ResolvedProperty,
  type ResolvedZone,
} from '../ports/geo-context.port';
import {
  INCIDENT_REPOSITORY,
  type IncidentRepositoryPort,
  type ListIncidentsPage,
  type ListIncidentsQuery,
} from '../ports/incident.repository.port';
import { ListIncidentsUseCase, type ListIncidentsInput } from './list-incidents.use-case';

const NOW = new Date('2026-04-27T15:00:00Z');

const PRINCIPAL_CTX: RequestContext = {
  requestId: 'req-1',
  userId: 100n,
  organizationId: 1n,
  organizationType: 'principal',
  ip: '10.0.0.1',
  userAgent: 'jest',
  source: 'http',
  startedAt: NOW,
  sessionExternalId: 'sess-1',
};

const SECURITY_PROVIDER_CTX: RequestContext = {
  ...PRINCIPAL_CTX,
  organizationId: 9n,
  organizationType: 'security_provider',
};

const API_CONSUMER_CTX: RequestContext = {
  ...PRINCIPAL_CTX,
  organizationType: 'api_consumer',
};

const ZONE_VALPARAISO: ResolvedZone = {
  id: 10n,
  externalId: 'zone-uuid',
  shortCode: 'VA',
  active: true,
};

const AREA: ResolvedArea = {
  id: 11n,
  externalId: 'area-uuid',
  zoneId: 10n,
  active: true,
};

const PROPERTY: ResolvedProperty = {
  id: 12n,
  externalId: 'property-uuid',
  zoneId: 10n,
  areaId: 11n,
  communeId: 50n,
  active: true,
};

const TYPE_THEFT: ResolvedIncidentType = {
  id: 200n,
  externalId: 'type-theft',
  active: true,
};

const TYPE_INTRUSION: ResolvedIncidentType = {
  id: 201n,
  externalId: 'type-intrusion',
  active: true,
};

function baseInput(overrides: Partial<ListIncidentsInput> = {}): ListIncidentsInput {
  return {
    page: 1,
    pageSize: 25,
    zoneExternalId: null,
    areaExternalId: null,
    propertyExternalId: null,
    semaforo: null,
    occurredFrom: null,
    occurredTo: null,
    incidentTypeExternalIds: [],
    freeTextSearch: null,
    personSearch: null,
    vehicleSearch: null,
    ...overrides,
  };
}

interface Mocks {
  geo: jest.Mocked<GeoContextPort>;
  incidents: { list: jest.MockedFunction<IncidentRepositoryPort['list']> };
}

function freshMocks(): Mocks {
  return {
    geo: {
      resolveZoneByExternalId: jest.fn(),
      resolveAreaByExternalId: jest.fn(),
      resolvePropertyByExternalId: jest.fn(),
      resolveCommuneByExternalId: jest.fn(),
      resolveIncidentTypeByExternalId: jest.fn(),
      findPropertyContaining: jest.fn(),
      findAreaContaining: jest.fn(),
      findCommuneContaining: jest.fn(),
      findVisibleZoneIdsForOrganization: jest.fn().mockResolvedValue([]),
    },
    incidents: {
      list: jest
        .fn<Promise<ListIncidentsPage>, [ListIncidentsQuery]>()
        .mockResolvedValue({ items: [], total: 0 }),
    },
  };
}

function lastListQuery(mocks: Mocks): ListIncidentsQuery {
  const call = mocks.incidents.list.mock.calls[0];
  if (call === undefined) {
    throw new Error('incidents.list no fue invocado');
  }
  return call[0];
}

async function build(mocks: Mocks): Promise<ListIncidentsUseCase> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      ListIncidentsUseCase,
      { provide: GEO_CONTEXT, useValue: mocks.geo },
      {
        provide: INCIDENT_REPOSITORY,
        useValue: mocks.incidents,
      },
    ],
  }).compile();
  return moduleRef.get(ListIncidentsUseCase);
}

describe('ListIncidentsUseCase', () => {
  describe('autorización', () => {
    it('rechaza al usuario sin org', async () => {
      const mocks = freshMocks();
      const uc = await build(mocks);
      const ctx: RequestContext = { ...PRINCIPAL_CTX, organizationId: null };
      await expect(uc.execute(baseInput(), ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rechaza a api_consumer (no tiene visibilidad)', async () => {
      const mocks = freshMocks();
      const uc = await build(mocks);
      await expect(uc.execute(baseInput(), API_CONSUMER_CTX)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('paginación', () => {
    it('rechaza page < 1', async () => {
      const mocks = freshMocks();
      const uc = await build(mocks);
      await expect(uc.execute(baseInput({ page: 0 }), PRINCIPAL_CTX)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('rechaza pageSize > 100', async () => {
      const mocks = freshMocks();
      const uc = await build(mocks);
      await expect(uc.execute(baseInput({ pageSize: 200 }), PRINCIPAL_CTX)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });
  });

  describe('rango de fechas', () => {
    it('rechaza occurredFrom > occurredTo', async () => {
      const mocks = freshMocks();
      const uc = await build(mocks);
      await expect(
        uc.execute(
          baseInput({
            occurredFrom: new Date('2026-04-30'),
            occurredTo: new Date('2026-04-01'),
          }),
          PRINCIPAL_CTX,
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('pasa rango válido al repository', async () => {
      const mocks = freshMocks();
      const uc = await build(mocks);
      const from = new Date('2026-04-01');
      const to = new Date('2026-04-30');
      await uc.execute(baseInput({ occurredFrom: from, occurredTo: to }), PRINCIPAL_CTX);
      const arg = lastListQuery(mocks);
      expect(arg.occurredFrom).toBe(from);
      expect(arg.occurredTo).toBe(to);
    });
  });

  describe('cascada Zona / Área / Predio', () => {
    it('valida que área pertenezca a la zona declarada', async () => {
      const mocks = freshMocks();
      mocks.geo.resolveZoneByExternalId.mockResolvedValue(ZONE_VALPARAISO);
      mocks.geo.resolveAreaByExternalId.mockResolvedValue({ ...AREA, zoneId: 99n });
      const uc = await build(mocks);
      await expect(
        uc.execute(
          baseInput({ zoneExternalId: 'zone-uuid', areaExternalId: 'area-uuid' }),
          PRINCIPAL_CTX,
        ),
      ).rejects.toThrow(/INCIDENT_AREA_NOT_IN_ZONE|no pertenece/);
    });

    it('valida que predio pertenezca al área declarada', async () => {
      const mocks = freshMocks();
      mocks.geo.resolveZoneByExternalId.mockResolvedValue(ZONE_VALPARAISO);
      mocks.geo.resolveAreaByExternalId.mockResolvedValue(AREA);
      mocks.geo.resolvePropertyByExternalId.mockResolvedValue({
        ...PROPERTY,
        areaId: 999n,
      });
      const uc = await build(mocks);
      await expect(
        uc.execute(
          baseInput({
            zoneExternalId: 'zone-uuid',
            areaExternalId: 'area-uuid',
            propertyExternalId: 'property-uuid',
          }),
          PRINCIPAL_CTX,
        ),
      ).rejects.toThrow(/INCIDENT_PROPERTY_NOT_IN_AREA|no pertenece/);
    });

    it('happy path: resuelve los 3 niveles y los pasa al repository', async () => {
      const mocks = freshMocks();
      mocks.geo.resolveZoneByExternalId.mockResolvedValue(ZONE_VALPARAISO);
      mocks.geo.resolveAreaByExternalId.mockResolvedValue(AREA);
      mocks.geo.resolvePropertyByExternalId.mockResolvedValue(PROPERTY);
      const uc = await build(mocks);
      await uc.execute(
        baseInput({
          zoneExternalId: 'zone-uuid',
          areaExternalId: 'area-uuid',
          propertyExternalId: 'property-uuid',
        }),
        PRINCIPAL_CTX,
      );
      const arg = lastListQuery(mocks);
      expect(arg.zoneId).toBe(10n);
      expect(arg.areaId).toBe(11n);
      expect(arg.propertyId).toBe(12n);
    });
  });

  describe('multi-tipo', () => {
    it('resuelve todos los external_ids de tipo y los pasa como array', async () => {
      const mocks = freshMocks();
      mocks.geo.resolveIncidentTypeByExternalId
        .mockResolvedValueOnce(TYPE_THEFT)
        .mockResolvedValueOnce(TYPE_INTRUSION);
      const uc = await build(mocks);
      await uc.execute(
        baseInput({ incidentTypeExternalIds: ['type-theft', 'type-intrusion'] }),
        PRINCIPAL_CTX,
      );
      const arg = lastListQuery(mocks);
      expect(arg.incidentTypeIds).toEqual([200n, 201n]);
    });

    it('falla si algún external_id no existe', async () => {
      const mocks = freshMocks();
      mocks.geo.resolveIncidentTypeByExternalId
        .mockResolvedValueOnce(TYPE_THEFT)
        .mockResolvedValueOnce(null);
      const uc = await build(mocks);
      await expect(
        uc.execute(
          baseInput({ incidentTypeExternalIds: ['type-theft', 'type-broken'] }),
          PRINCIPAL_CTX,
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('array vacío equivale a "sin filtro" (NULL en query)', async () => {
      const mocks = freshMocks();
      const uc = await build(mocks);
      await uc.execute(baseInput({ incidentTypeExternalIds: [] }), PRINCIPAL_CTX);
      const arg = lastListQuery(mocks);
      expect(arg.incidentTypeIds).toBeNull();
    });
  });

  describe('búsquedas de texto', () => {
    it('descarta búsquedas de menos de 2 caracteres', async () => {
      const mocks = freshMocks();
      const uc = await build(mocks);
      await uc.execute(
        baseInput({ freeTextSearch: 'a', personSearch: 'b', vehicleSearch: ' ' }),
        PRINCIPAL_CTX,
      );
      const arg = lastListQuery(mocks);
      expect(arg.freeTextSearch).toBeNull();
      expect(arg.personSearch).toBeNull();
      expect(arg.vehicleSearch).toBeNull();
    });

    it('trimea y propaga búsquedas válidas', async () => {
      const mocks = freshMocks();
      const uc = await build(mocks);
      await uc.execute(
        baseInput({
          freeTextSearch: '  robo madera  ',
          personSearch: '76543210',
          vehicleSearch: 'GHKZ12',
        }),
        PRINCIPAL_CTX,
      );
      const arg = lastListQuery(mocks);
      expect(arg.freeTextSearch).toBe('robo madera');
      expect(arg.personSearch).toBe('76543210');
      expect(arg.vehicleSearch).toBe('GHKZ12');
    });
  });

  describe('visibilidad por organización', () => {
    it('principal: visibleZoneIds = NULL (ve todo)', async () => {
      const mocks = freshMocks();
      const uc = await build(mocks);
      await uc.execute(baseInput(), PRINCIPAL_CTX);
      const arg = lastListQuery(mocks);
      expect(arg.visibleZoneIds).toBeNull();
    });

    it('security_provider: visibleZoneIds = asignaciones vigentes', async () => {
      const mocks = freshMocks();
      mocks.geo.findVisibleZoneIdsForOrganization.mockResolvedValue([7n, 8n]);
      const uc = await build(mocks);
      await uc.execute(baseInput(), SECURITY_PROVIDER_CTX);
      const arg = lastListQuery(mocks);
      expect(arg.visibleZoneIds).toEqual([7n, 8n]);
      expect(mocks.geo.findVisibleZoneIdsForOrganization).toHaveBeenCalledWith(9n);
    });
  });
});
