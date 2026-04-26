import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/auth';
import { DatabasePingService } from './database-ping.service';

interface HealthResponse {
  status: 'ok' | 'degraded';
  service: string;
  mode: 'api' | 'worker';
  uptime_seconds: number;
  timestamp: string;
  database: 'ok' | 'unreachable';
}

@Controller('health')
export class HealthController {
  constructor(private readonly dbPing: DatabasePingService) {}

  @Public()
  @Get()
  async check(): Promise<HealthResponse> {
    const dbStatus = await this.dbPing.ping();
    return {
      status: dbStatus === 'ok' ? 'ok' : 'degraded',
      service: 'surp-api',
      mode: process.env.WORKER_MODE === 'true' ? 'worker' : 'api',
      uptime_seconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      database: dbStatus,
    };
  }
}
