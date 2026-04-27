import { IsString, MinLength } from 'class-validator';

export class VoidIncidentDto {
  @IsString({ message: 'voidReason debe ser texto' })
  @MinLength(10, { message: 'voidReason debe tener al menos 10 caracteres' })
  voidReason!: string;
}
