import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { PermissionsSyncService } from './permissions-sync.service';

/**
 * Módulo dedicado al sync del catálogo de permisos al arranque.
 * Independiente de `AuthModule` (que viene en F6.5) para que el sync
 * corra incluso si la auth está desactivada (worker, scripts).
 */
@Module({
  imports: [DatabaseModule],
  providers: [PermissionsSyncService],
  exports: [PermissionsSyncService],
})
export class AuthPermissionsModule {}
