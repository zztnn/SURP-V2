import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * `refreshToken` es opcional porque la fuente principal es la cookie
 * httpOnly `surp_refresh`. Solo se usa el body como fallback para
 * clientes que aún no migraron a cookies (curl, scripts).
 */
export class RefreshTokenDto {
  @IsOptional()
  @IsString()
  @MinLength(20, { message: 'refreshToken inválido' })
  @MaxLength(512, { message: 'refreshToken inválido' })
  refreshToken?: string;
}
