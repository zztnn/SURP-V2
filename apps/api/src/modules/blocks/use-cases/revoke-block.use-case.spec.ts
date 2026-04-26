import { Test } from '@nestjs/testing';
import {
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { RequestContext } from '../../../common';
import { CLOCK } from '../../../common';
import { Block } from '../domain/block';
import { BLOCK_REPOSITORY } from '../ports/block.repository.port';
import { RevokeBlockUseCase } from './revoke-block.use-case';

const NOW = new Date('2026-04-25T12:00:00Z');

const CTX: RequestContext = {
  requestId: 'req-1',
  userId: 1n,
  organizationId: 10n,
  ip: '1.1.1.1',
  userAgent: 'jest',
  source: 'http',
  startedAt: NOW,
  sessionExternalId: null,
};

function makeActiveBlock(): Block {
  return Block.fromSnapshot({
    id: 100n,
    externalId: 'uuid-100',
    targetType: 'party',
    targetId: 5n,
    reason: 'Sospecha de robo de madera reiterado en zona Vichuquén',
    active: true,
    grantedAt: NOW,
    grantedByUserId: 1n,
    revokedAt: null,
    revokedByUserId: null,
    revokeReason: null,
    linkedIncidentId: 42n,
  });
}

async function build(opts: { found: Block | null }): Promise<{
  uc: RevokeBlockUseCase;
  persist: jest.Mock;
}> {
  const persist = jest.fn().mockImplementation((b: Block) => Promise.resolve(b));
  const m = await Test.createTestingModule({
    providers: [
      RevokeBlockUseCase,
      {
        provide: BLOCK_REPOSITORY,
        useValue: {
          findById: jest.fn().mockResolvedValue(opts.found),
          persist,
        },
      },
      { provide: CLOCK, useValue: { now: () => NOW } },
    ],
  }).compile();
  return { uc: m.get(RevokeBlockUseCase), persist };
}

describe('RevokeBlockUseCase', () => {
  it('happy path: revoca bloqueo activo', async () => {
    const block = makeActiveBlock();
    const { uc, persist } = await build({ found: block });
    const r = await uc.execute({ blockId: 100n, revokeReason: 'Aclarado tras reunión URP' }, CTX);
    expect(r.active).toBe(false);
    expect(r.revokeReason).toBe('Aclarado tras reunión URP');
    expect(r.revokedByUserId).toBe('1');
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('rechaza sin auth (401)', async () => {
    const { uc, persist } = await build({ found: makeActiveBlock() });
    await expect(
      uc.execute({ blockId: 100n, revokeReason: 'razón válida' }, { ...CTX, userId: null }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(persist).not.toHaveBeenCalled();
  });

  it('404 si bloqueo no existe', async () => {
    const { uc } = await build({ found: null });
    await expect(
      uc.execute({ blockId: 999n, revokeReason: 'razón válida' }, CTX),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('422 si bloqueo ya revocado (DomainError → mapeado)', async () => {
    const block = makeActiveBlock();
    block.revoke(2n, 'revocado previamente', NOW);
    const { uc, persist } = await build({ found: block });
    await expect(
      uc.execute({ blockId: 100n, revokeReason: 'segunda intentona' }, CTX),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(persist).not.toHaveBeenCalled();
  });

  it('422 si revokeReason corto', async () => {
    const { uc, persist } = await build({ found: makeActiveBlock() });
    await expect(uc.execute({ blockId: 100n, revokeReason: 'x' }, CTX)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(persist).not.toHaveBeenCalled();
  });
});
