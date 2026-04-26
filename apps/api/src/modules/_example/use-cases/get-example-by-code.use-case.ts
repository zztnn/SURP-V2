import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { RequestContext } from '../../../common';
import { EXAMPLE_REPOSITORY, type ExampleRepositoryPort } from '../ports/example.repository.port';
import type { Example } from '../domain/example';

interface Input {
  code: string;
}

/**
 * Use case plantilla. Demuestra el orden canónico:
 *   1. Validaciones adicionales al DTO (el DTO ya las validó vía
 *      ValidationPipe).
 *   2. Cargar aggregates desde puertos.
 *   3. Aplicar invariantes de dominio.
 *   4. Mutar y persistir.
 *   5. Eventos (audit + notificaciones).
 *   6. Retornar DTO tipado (nunca row de BD).
 *
 * En este ejemplo solo lee (sin mutación). Para acciones que mutan, ver
 * el README — el patrón se repite con `repo.save(...)` después de las
 * invariantes.
 */
@Injectable()
export class GetExampleByCodeUseCase {
  constructor(
    @Inject(EXAMPLE_REPOSITORY)
    private readonly repo: ExampleRepositoryPort,
  ) {}

  async execute(input: Input, _ctx: RequestContext): Promise<Example> {
    const example = await this.repo.findByCode(input.code);
    if (!example) {
      throw new NotFoundException({
        error: 'Not Found',
        code: 'EXAMPLE_NOT_FOUND',
        message: `No existe example con code=${input.code}`,
      });
    }
    return example;
  }
}
