import {
  BadRequestException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { CLOCK, type RequestContext } from '../../../common';
import { Incident } from '../domain/incident';
import {
  GEO_CONTEXT,
  type GeoContextPort,
  type ResolvedArea,
  type ResolvedCommune,
  type ResolvedIncidentType,
  type ResolvedProperty,
  type ResolvedZone,
} from '../ports/geo-context.port';
import { INCIDENT_REPOSITORY } from '../ports/incident.repository.port';
import { RegisterIncidentUseCase, type RegisterIncidentInput } from './register-incident.use-case';

const NOW = new Date('2026-04-26T15:00:00Z');

const CTX: RequestContext = {
  requestId: 'req-1',
  userId: 100n,
  organizationId: 1n,
  ip: '10.0.0.1',
  userAgent: 'jest',
  source: 'http',
  startedAt: NOW,
  sessionExternalId: 'sess-1',
};

const ZONE: ResolvedZone = {
  id: 10n,
  externalId: 'zone-uuid',
  shortCode: 'ML',
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

const COMMUNE: ResolvedCommune = {
  id: 50n,
  externalId: 'commune-uuid',
  regionId: 7n,
};

const INCIDENT_TYPE: ResolvedIncidentType = {
  id: 200n,
  externalId: 'itype-uuid',
  active: true,
};

function baseInput(overrides: Partial<RegisterIncidentInput> = {}): RegisterIncidentInput {
  return {
    zoneExternalId: 'zone-uuid',
    areaExternalId: null,
    propertyExternalId: null,
    communeExternalId: null,
    incidentTypeExternalId: 'itype-uuid',
    operationTypeExternalId: null,
    occurredAt: new Date('2026-04-25T12:00:00Z'),
    detectedAt: null,
    location: { lat: -35.42, lng: -71.65 },
    locationSource: 'gps',
    gpsAccuracyMeters: 5,
    description: 'Robo de madera detectado en patrullaje matutino',
    semaforo: null,
    timberFate: null,
    aggravatingFactors: [],
    ...overrides,
  };
}

interface Mocks {
  geo: jest.Mocked<GeoContextPort>;
  incidents: {
    withSequenceLock: jest.Mock;
    insert: jest.Mock;
  };
}

function freshMocks(): Mocks {
  return {
    geo: {
      resolveZoneByExternalId: jest.fn().mockResolvedValue(ZONE),
      resolveAreaByExternalId: jest.fn().mockResolvedValue(AREA),
      resolvePropertyByExternalId: jest.fn().mockResolvedValue(PROPERTY),
      resolveCommuneByExternalId: jest.fn().mockResolvedValue(COMMUNE),
      resolveIncidentTypeByExternalId: jest.fn().mockResolvedValue(INCIDENT_TYPE),
      findPropertyContaining: jest.fn().mockResolvedValue(PROPERTY),
      findAreaContaining: jest.fn().mockResolvedValue(AREA),
      findCommuneContaining: jest.fn().mockResolvedValue(COMMUNE),
    },
    incidents: {
      withSequenceLock: jest
        .fn()
        .mockImplementation((_zone: bigint, _year: number, fn: (n: number) => Promise<unknown>) =>
          fn(7),
        ),
      insert: jest.fn().mockImplementation((incident: Incident) => {
        const s = incident.toSnapshot();
        return Promise.resolve({
          ...s,
          id: 999n,
          externalId: 'incident-uuid',
        });
      }),
    },
  };
}

async function build(mocks: Mocks): Promise<RegisterIncidentUseCase> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      RegisterIncidentUseCase,
      { provide: GEO_CONTEXT, useValue: mocks.geo },
      { provide: INCIDENT_REPOSITORY, useValue: mocks.incidents },
      { provide: CLOCK, useValue: { now: () => NOW } },
    ],
  }).compile();
  return moduleRef.get(RegisterIncidentUseCase);
}

describe('RegisterIncidentUseCase', () => {
  it('happy path: registra con auto-resolve de área/predio/comuna y correlativo', async () => {
    const mocks = freshMocks();
    const uc = await build(mocks);

    const result = await uc.execute(baseInput(), CTX);

    expect(result.externalId).toBe('incident-uuid');
    expect(result.correlativeCode).toBe('7-2026-ZML');
    expect(result.state).toBe('submitted');
    expect(result.zoneExternalId).toBe('zone-uuid');
    expect(result.areaExternalId).toBe('area-uuid');
    expect(result.propertyExternalId).toBe('property-uuid');
    expect(result.communeExternalId).toBe('commune-uuid');

    expect(mocks.incidents.withSequenceLock).toHaveBeenCalledWith(10n, 2026, expect.any(Function));
    expect(mocks.geo.findAreaContaining).toHaveBeenCalledWith(-35.42, -71.65);
    expect(mocks.geo.findPropertyContaining).toHaveBeenCalledWith(-35.42, -71.65);
  });

  it('respeta los IDs explícitos del cliente y NO hace ST_Contains', async () => {
    const mocks = freshMocks();
    const uc = await build(mocks);

    await uc.execute(
      baseInput({
        areaExternalId: 'area-uuid',
        propertyExternalId: 'property-uuid',
        communeExternalId: 'commune-uuid',
      }),
      CTX,
    );

    expect(mocks.geo.findAreaContaining).not.toHaveBeenCalled();
    expect(mocks.geo.findPropertyContaining).not.toHaveBeenCalled();
    // Si pasa communeExternalId, no llamamos findCommuneContaining.
    expect(mocks.geo.findCommuneContaining).not.toHaveBeenCalled();
  });

  it('rechaza si zoneExternalId no existe', async () => {
    const mocks = freshMocks();
    mocks.geo.resolveZoneByExternalId.mockResolvedValue(null);
    const uc = await build(mocks);

    await expect(uc.execute(baseInput(), CTX)).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('rechaza si incidentType está inactivo', async () => {
    const mocks = freshMocks();
    mocks.geo.resolveIncidentTypeByExternalId.mockResolvedValue({
      ...INCIDENT_TYPE,
      active: false,
    });
    const uc = await build(mocks);

    await expect(uc.execute(baseInput(), CTX)).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('rechaza si area no pertenece a la zona declarada', async () => {
    const mocks = freshMocks();
    mocks.geo.resolveAreaByExternalId.mockResolvedValue({
      ...AREA,
      zoneId: 999n, // ⚠️ otra zona
    });
    const uc = await build(mocks);

    try {
      await uc.execute(baseInput({ areaExternalId: 'area-uuid' }), CTX);
      fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(UnprocessableEntityException);
      const resp = (e as UnprocessableEntityException).getResponse() as { code: string };
      expect(resp.code).toBe('INCIDENT_AREA_ZONE_MISMATCH');
    }
  });

  it('rechaza si property no pertenece al area declarada', async () => {
    const mocks = freshMocks();
    mocks.geo.resolvePropertyByExternalId.mockResolvedValue({
      ...PROPERTY,
      areaId: 999n, // ⚠️ otra área
    });
    const uc = await build(mocks);

    try {
      await uc.execute(
        baseInput({ areaExternalId: 'area-uuid', propertyExternalId: 'property-uuid' }),
        CTX,
      );
      fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(UnprocessableEntityException);
      const resp = (e as UnprocessableEntityException).getResponse() as { code: string };
      expect(resp.code).toBe('INCIDENT_PROPERTY_AREA_MISMATCH');
    }
  });

  it('rechaza año fuera de rango', async () => {
    const mocks = freshMocks();
    const uc = await build(mocks);
    await expect(
      uc.execute(baseInput({ occurredAt: new Date('1999-12-31T00:00:00Z') }), CTX),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza usuario anónimo (defense in depth aunque el guard ya filtre)', async () => {
    const mocks = freshMocks();
    const uc = await build(mocks);
    const anonCtx: RequestContext = { ...CTX, userId: null, organizationId: null };
    await expect(uc.execute(baseInput(), anonCtx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('correlativo usa el AÑO de occurredAt, no el de hoy', async () => {
    const mocks = freshMocks();
    const uc = await build(mocks);
    // occurredAt en 2025 aunque NOW = 2026-04-26.
    const result = await uc.execute(
      baseInput({ occurredAt: new Date('2025-12-31T20:00:00Z') }),
      CTX,
    );
    expect(result.correlativeCode).toBe('7-2025-ZML');
    expect(mocks.incidents.withSequenceLock).toHaveBeenCalledWith(10n, 2025, expect.any(Function));
  });
});
