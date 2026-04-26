import { Global, Module } from '@nestjs/common';
import { CLOCK } from './clock/clock.port';
import { SystemClock } from './clock/system-clock';
import { RequestContextService } from './context/request-context.service';

/**
 * Módulo transversal con primitives que usan todos los módulos de
 * dominio. `@Global` para que no haya que importarlo en cada feature
 * module.
 */
@Global()
@Module({
  providers: [RequestContextService, { provide: CLOCK, useClass: SystemClock }],
  exports: [RequestContextService, CLOCK],
})
export class CommonModule {}
