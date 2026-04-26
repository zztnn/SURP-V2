// Re-exports públicos del módulo database. Los consumidores siempre
// importan desde 'src/database', nunca directamente de generated/.
export type { DB } from './generated/database.types';
export { DATABASE } from './database.token';
