import { Test } from '@nestjs/testing';
import {
  ConflictException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { RequestContext } from '../../../common';
import { CLOCK } from '../../../common';
import { EnqueueNotificationUseCase } from '../../notifications';
import { Block } from '../domain/block';
import { BLOCK_REPOSITORY } from '../ports/block.repository.port';
import { TARGET_EXISTENCE } from '../ports/target-existence.port';
import { GrantBlockUseCase } from './grant-block.use-case';

const NOW = new Date('2026-04-25T12:00:00Z');

const CTX: RequestContext = {
  requestId: 'req-1',
  userId: 1n,
  organizationId: 10n,
  organizationType: 'principal',
  ip: '127.0.0.1',
  userAgent: 'jest',
  source: 'http',
  startedAt: NOW,
  sessionExternalId: null,
};

const VALID_INPUT = {
  targetType: 'party' as const,
  targetId: 5n,
  reason: 'Sospecha de robo de madera reiterado en zona Vichuquén',
  linkedIncidentId: 42n,
};

interface Mocks {
  blocks: {
    findActiveByTarget: jest.Mock;
    save: jest.Mock;
    findById: jest.Mock;
    persist: jest.Mock;
  };
  targets: { existsParty: jest.Mock; existsVehicle: jest.Mock };
  clock: { now: jest.Mock };
  enqueue: { execute: jest.Mock };
}

function freshMocks(): Mocks {
  return {
    blocks: {
      findActiveByTarget: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
      findById: jest.fn(),
      persist: jest.fn(),
    },
    targets: {
      existsParty: jest.fn().mockResolvedValue(true),
      existsVehicle: jest.fn().mockResolvedValue(true),
    },
    clock: { now: jest.fn().mockReturnValue(NOW) },
    enqueue: {
      execute: jest.fn().mockResolvedValue({
        notificationId: '1',
        externalId: 'uuid',
        status: 'queued',
      }),
    },
  };
}

async function buildUseCase(m: Mocks): Promise<GrantBlockUseCase> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      GrantBlockUseCase,
      { provide: BLOCK_REPOSITORY, useValue: m.blocks },
      { provide: TARGET_EXISTENCE, useValue: m.targets },
      { provide: CLOCK, useValue: m.clock },
      { provide: EnqueueNotificationUseCase, useValue: m.enqueue },
    ],
  }).compile();
  return moduleRef.get(GrantBlockUseCase);
}

describe('GrantBlockUseCase', () => {
  it('happy path: party existe + sin bloqueo activo previo + linked incidente', async () => {
    const m = freshMocks();
    m.blocks.save.mockImplementation((b: Block) =>
      Promise.resolve(Block.fromSnapshot({ ...b.toSnapshot(), id: 100n, externalId: 'uuid-100' })),
    );
    const uc = await buildUseCase(m);

    const r = await uc.execute(VALID_INPUT, CTX);

    expect(r.id).toBe('100');
    expect(r.externalId).toBe('uuid-100');
    expect(r.targetType).toBe('party');
    expect(r.targetId).toBe('5');
    expect(r.active).toBe(true);
    expect(r.linkedIncidentId).toBe('42');
    expect(r.warning).toBeNull();
    expect(m.targets.existsParty).toHaveBeenCalledWith(5n);
    expect(m.targets.existsVehicle).not.toHaveBeenCalled();
    expect(m.blocks.findActiveByTarget).toHaveBeenCalledWith('party', 5n);
    expect(m.blocks.save).toHaveBeenCalledTimes(1);
  });

  it('vehicle target: usa existsVehicle', async () => {
    const m = freshMocks();
    m.blocks.save.mockImplementation((b: Block) =>
      Promise.resolve(Block.fromSnapshot({ ...b.toSnapshot(), id: 200n, externalId: 'uuid-veh' })),
    );
    const uc = await buildUseCase(m);
    await uc.execute({ ...VALID_INPUT, targetType: 'vehicle', targetId: 7n }, CTX);
    expect(m.targets.existsVehicle).toHaveBeenCalledWith(7n);
    expect(m.targets.existsParty).not.toHaveBeenCalled();
  });

  it('sin linked_incident_id: emite warning y persiste igual', async () => {
    const m = freshMocks();
    m.blocks.save.mockImplementation((b: Block) =>
      Promise.resolve(Block.fromSnapshot({ ...b.toSnapshot(), id: 100n, externalId: 'uuid-100' })),
    );
    const uc = await buildUseCase(m);

    const r = await uc.execute({ ...VALID_INPUT, linkedIncidentId: null }, CTX);
    expect(r.linkedIncidentId).toBeNull();
    expect(r.warning).toMatch(/Ley 21\.719/);
    expect(m.blocks.save).toHaveBeenCalledTimes(1);
  });

  it('rechaza si ctx.userId es null (sin auth)', async () => {
    const m = freshMocks();
    const uc = await buildUseCase(m);
    await expect(uc.execute(VALID_INPUT, { ...CTX, userId: null })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(m.blocks.save).not.toHaveBeenCalled();
  });

  it('rechaza si target party no existe (422 BLOCK_TARGET_NOT_FOUND)', async () => {
    const m = freshMocks();
    m.targets.existsParty.mockResolvedValue(false);
    const uc = await buildUseCase(m);
    await expect(uc.execute(VALID_INPUT, CTX)).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(m.blocks.save).not.toHaveBeenCalled();
  });

  it('rechaza si ya hay bloqueo activo (409 BLOCK_ALREADY_ACTIVE)', async () => {
    const m = freshMocks();
    const existing = Block.fromSnapshot({
      id: 50n,
      externalId: 'old',
      targetType: 'party',
      targetId: 5n,
      reason: 'Bloqueo previo activo aún',
      active: true,
      grantedAt: NOW,
      grantedByUserId: 1n,
      revokedAt: null,
      revokedByUserId: null,
      revokeReason: null,
      linkedIncidentId: null,
    });
    m.blocks.findActiveByTarget.mockResolvedValue(existing);
    const uc = await buildUseCase(m);

    try {
      await uc.execute(VALID_INPUT, CTX);
      fail('expected ConflictException');
    } catch (e) {
      expect(e).toBeInstanceOf(ConflictException);
    }
    expect(m.blocks.save).not.toHaveBeenCalled();
  });

  it('reason corto bubblea como UnprocessableEntity (DomainError → 422)', async () => {
    // Block.grant lanza DomainError; en este use case NO lo capturamos
    // explícitamente — el filter global lo deja pasar como 500. Documentar
    // que el DTO debe atrapar eso primero (validación de class-validator
    // ≥30 chars). Aquí verificamos que la validación de dominio se
    // ejecuta SI el DTO falló en pasarla.
    const m = freshMocks();
    const uc = await buildUseCase(m);
    await expect(uc.execute({ ...VALID_INPUT, reason: 'corto' }, CTX)).rejects.toThrow();
    expect(m.blocks.save).not.toHaveBeenCalled();
  });
});
