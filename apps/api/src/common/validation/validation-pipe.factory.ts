import { BadRequestException, ValidationPipe, type ValidationError } from '@nestjs/common';

/**
 * Construye el ValidationPipe global con un formato de error consistente
 * en español. Lo aplica `main.ts` con `app.useGlobalPipes(buildValidationPipe())`.
 *
 * Output esperado:
 * ```json
 * {
 *   "error": "Bad Request",
 *   "code": "VALIDATION_FAILED",
 *   "message": "Datos inválidos",
 *   "errors": [
 *     { "field": "name", "messages": ["No puede estar vacío"] }
 *   ]
 * }
 * ```
 *
 * Características:
 *   - whitelist: descarta campos no declarados en el DTO.
 *   - forbidNonWhitelisted: rechaza campos extra (no solo los descarta).
 *   - transform: aplica @Type, @Transform automáticamente.
 *   - stopAtFirstError: false → reporta todos los errores juntos para
 *     mejor UX.
 */
export function buildValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    stopAtFirstError: false,
    exceptionFactory: (errors: ValidationError[]): BadRequestException => {
      return new BadRequestException({
        error: 'Bad Request',
        code: 'VALIDATION_FAILED',
        message: 'Datos inválidos',
        errors: flattenValidationErrors(errors),
      });
    },
  });
}

interface FieldError {
  field: string;
  messages: string[];
}

export function flattenValidationErrors(errors: ValidationError[], parentPath = ''): FieldError[] {
  const out: FieldError[] = [];
  for (const err of errors) {
    const fieldPath = parentPath ? `${parentPath}.${err.property}` : err.property;
    if (err.constraints) {
      out.push({
        field: fieldPath,
        messages: Object.values(err.constraints),
      });
    }
    if (err.children && err.children.length > 0) {
      out.push(...flattenValidationErrors(err.children, fieldPath));
    }
  }
  return out;
}
