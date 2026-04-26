// Re-exports públicos del módulo blocks.
// Internals (use cases, ports, adapters, dominio) NO se exportan — el
// resto del código solo consume el módulo vía BlocksModule + endpoints.

export { BlocksModule } from './blocks.module';
