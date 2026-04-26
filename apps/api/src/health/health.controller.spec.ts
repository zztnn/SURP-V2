import { Test, type TestingModule } from '@nestjs/testing';
import { DatabasePingService } from './database-ping.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  let pingMock: jest.Mock;

  beforeEach(async () => {
    pingMock = jest.fn().mockResolvedValue('ok');
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: DatabasePingService, useValue: { ping: pingMock } }],
    }).compile();
    controller = module.get(HealthController);
  });

  afterEach(() => {
    delete process.env.WORKER_MODE;
  });

  it('reporta status=ok cuando DB ping responde ok', async () => {
    const result = await controller.check();
    expect(result.status).toBe('ok');
    expect(result.service).toBe('surp-api');
    expect(result.mode).toBe('api');
    expect(result.database).toBe('ok');
    expect(result.uptime_seconds).toBeGreaterThanOrEqual(0);
    expect(typeof result.timestamp).toBe('string');
    expect(pingMock).toHaveBeenCalledTimes(1);
  });

  it('reporta mode=worker cuando WORKER_MODE=true', async () => {
    process.env.WORKER_MODE = 'true';
    const result = await controller.check();
    expect(result.mode).toBe('worker');
  });

  it('reporta status=degraded cuando DB ping responde unreachable', async () => {
    pingMock.mockResolvedValueOnce('unreachable');
    const result = await controller.check();
    expect(result.status).toBe('degraded');
    expect(result.database).toBe('unreachable');
  });
});
