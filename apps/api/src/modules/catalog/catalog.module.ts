import { Module } from '@nestjs/common';

import { CommonModule } from '../../common';
import { DatabaseModule } from '../../database/database.module';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

@Module({
  imports: [CommonModule, DatabaseModule],
  controllers: [CatalogController],
  providers: [CatalogService],
})
export class CatalogModule {}
