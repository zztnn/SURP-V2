// Token + tipo para inyectar la configuración JWT en el JwtTokenIssuer.
// Vive separado para que tests instancien el adapter sin tener que
// arrastrar @nestjs/config.

export const JWT_CONFIG = Symbol('JWT_CONFIG');

export interface JwtAuthConfig {
  secret: string;
  accessExpiresIn: string;
  issuer: string;
  audience: string;
}
