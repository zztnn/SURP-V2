import { registerAs } from '@nestjs/config';

export interface JwtConfig {
  secret: string;
  expiresIn: string;
  refreshExpiresIn: string;
}

export default registerAs('jwt', (): JwtConfig => {
  // validateEnv ya garantiza que JWT_SECRET existe y cumple los mínimos
  // (≥32 chars dev, ≥64 prod). El throw aquí es defensa secundaria por
  // si alguien instancia ConfigService sin pasar por validateEnv.
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET no seteado — auth requiere secret');
  }
  return {
    secret,
    expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '30d',
  };
});
