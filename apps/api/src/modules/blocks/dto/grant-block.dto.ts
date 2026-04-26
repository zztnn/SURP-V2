import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { BlockTargetType } from '../domain/block';

export class GrantBlockDto {
  @IsIn(['party', 'vehicle'], { message: 'targetType debe ser party o vehicle' })
  targetType!: BlockTargetType;

  // El payload viaja como string (JSON no tiene bigint nativo). El use
  // case lo convierte a bigint antes de llamar al dominio.
  @Type(() => Number)
  @IsInt({ message: 'targetId debe ser entero' })
  @IsPositive({ message: 'targetId debe ser positivo' })
  targetId!: number;

  // ≥30 chars match con la invariante del dominio (Ley 21.719). Atrapamos
  // aquí primero para devolver 400 en vez de 422.
  @IsString()
  @MinLength(30, {
    message: 'reason debe tener al menos 30 caracteres (Ley 21.719 — finalidad determinada)',
  })
  @MaxLength(2000, { message: 'reason excede 2000 caracteres' })
  reason!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'linkedIncidentId debe ser entero' })
  @IsPositive({ message: 'linkedIncidentId debe ser positivo' })
  linkedIncidentId?: number;
}
