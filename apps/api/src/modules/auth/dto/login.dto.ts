import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'email debe ser un correo válido' })
  @MaxLength(255, { message: 'email excede 255 caracteres' })
  email!: string;

  // No imponemos política de password fuerte en login (solo en signup /
  // password-reset). Aquí basta con que sea string no-vacío y < 1024
  // chars (mismo límite del hasher para evitar DoS).
  @IsString()
  @MinLength(1, { message: 'password requerida' })
  @MaxLength(1024, { message: 'password excede 1024 caracteres' })
  password!: string;
}
