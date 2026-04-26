import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { DatabasePingService } from './database-ping.service';
import { HealthController } from './health.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [HealthController],
  providers: [DatabasePingService],
})
export class HealthModule {}
