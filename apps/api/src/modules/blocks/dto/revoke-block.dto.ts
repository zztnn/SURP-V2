import { IsString, MaxLength, MinLength } from 'class-validator';

export class RevokeBlockDto {
  @IsString()
  @MinLength(10, { message: 'revokeReason debe tener al menos 10 caracteres' })
  @MaxLength(2000, { message: 'revokeReason excede 2000 caracteres' })
  revokeReason!: string;
}
