// Re-exports públicos del módulo auth.
// Internals (use cases, ports, adapters) NO se exportan — el resto del
// código solo consume el módulo vía AuthModule + decorators de F6.6.

export { AuthModule } from './auth.module';
export { TOKEN_ISSUER } from './ports/token-issuer.port';
export type { AccessTokenPayload, TokenIssuerPort } from './ports/token-issuer.port';
export { USER_REPOSITORY } from './ports/user.repository.port';
export type { UserRepositoryPort, UserWithPermissions } from './ports/user.repository.port';
