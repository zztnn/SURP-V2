import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import ExcelJS from 'exceljs';

/**
 * Una fila del export de incidentes. Más rica que `IncidentListItem` —
 * incluye descripción completa, agravantes y origen de la coordenada
 * (datos relevantes para auditoría URP / Ley 21.719 que no caben en la
 * lista pero sí en el archivo descargado).
 */
export interface IncidentExportRow {
  correlativeCode: string | null;
  occurredAt: Date;
  state: 'draft' | 'active' | 'voided';
  semaforo: 'no_determinado' | 'verde' | 'amarillo' | 'rojo';
  incidentTypeCode: string;
  incidentTypeName: string;
  zoneShortCode: string;
  zoneName: string;
  areaName: string | null;
  propertyName: string | null;
  communeName: string | null;
  lat: number;
  lng: number;
  locationSource: string;
  capturedByUserDisplayName: string;
  organizationName: string;
  description: string;
  aggravatingFactors: readonly string[];
}

export interface IncidentsExcelOptions {
  /** Título del sheet. Default: `"Incidentes"`. */
  sheetTitle?: string;
  /** Resumen humano de los filtros aplicados — va en el header del sheet. */
  filtersSummary?: string;
  /** Fecha que aparece como "Generado el" en el header. Default: `new Date()`. */
  generatedAt?: Date;
  /** Quien pidió el export. Aparece en el header del sheet. */
  generatedByDisplayName?: string;
}

// Etiquetas en español. **Duplicadas** con `apps/web/src/lib/incidents-format.ts`
// — fuente de verdad canónica vive en el frontend hoy. Cuando aparezca un
// `packages/shared`, se extrae allí.
const STATE_LABELS: Record<IncidentExportRow['state'], string> = {
  draft: 'Borrador',
  active: 'Activo',
  voided: 'Anulado',
};

const SEMAFORO_LABELS: Record<IncidentExportRow['semaforo'], string> = {
  no_determinado: 'Sin determinar',
  verde: 'Verde',
  amarillo: 'Amarillo',
  rojo: 'Rojo',
};

const AGGRAVATING_FACTOR_LABELS: Record<string, string> = {
  motorized_vehicle_used: 'Uso de vehículo motorizado',
  chainsaw_used: 'Uso de motosierra',
  crane_used: 'Uso de grúa',
  multiple_offenders: 'Múltiples partícipes',
  fence_breach: 'Forzamiento de cerco',
  animal_rustling: 'Sustracción de animales',
  possible_organized_crime: 'Posible crimen organizado',
};

const LOCATION_SOURCE_LABELS: Record<string, string> = {
  gps: 'GPS',
  property_centroid: 'Centroide del predio',
  area_centroid: 'Centroide del área',
  zone_centroid: 'Centroide de la zona',
  manual: 'Ingreso manual',
};

/**
 * Genera un archivo `.xlsx` con el listado de incidentes. Función **pura**:
 * no toca DB, storage ni Nest. Recibe filas y devuelve un `Buffer` listo
 * para subir al `StoragePort`.
 *
 * Layout:
 *   - Filas 1-3: header con título, "Generado el", filtros aplicados,
 *     "Generado por". Para que cualquier reviewer del archivo entienda
 *     el contexto sin abrir el sistema.
 *   - Fila 5: cabecera de columnas con bold + fondo gris.
 *   - Fila 6+: datos.
 *
 * Columnas (en orden):
 *   Folio · Ocurrido · Estado · Semáforo · Tipo · Código tipo · Zona ·
 *   Cód zona · Área · Predio · Comuna · Latitud · Longitud · Origen
 *   ubicación · Capturado por · Organización · Descripción · Agravantes
 */
export async function generateIncidentsExcel(
  rows: readonly IncidentExportRow[],
  options: IncidentsExcelOptions = {},
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SURP 2.0';
  workbook.created = options.generatedAt ?? new Date();

  const sheet = workbook.addWorksheet(options.sheetTitle ?? 'Incidentes');

  // -- Header de contexto (filas 1-3). ----------------------------------
  const generatedAt = options.generatedAt ?? new Date();
  const headerRows: Array<[string, string]> = [
    ['SURP 2.0 — Listado de incidentes', ''],
    ['Generado el', format(generatedAt, "dd-MM-yyyy HH:mm 'hrs.'", { locale: es })],
  ];
  if (options.generatedByDisplayName !== undefined) {
    headerRows.push(['Generado por', options.generatedByDisplayName]);
  }
  if (options.filtersSummary !== undefined && options.filtersSummary.length > 0) {
    headerRows.push(['Filtros aplicados', options.filtersSummary]);
  }
  for (const [label, value] of headerRows) {
    const row = sheet.addRow([label, value]);
    row.getCell(1).font = { bold: true };
  }
  // Línea en blanco entre header de contexto y header de columnas.
  sheet.addRow([]);

  // -- Definición de columnas (esto setea anchos pero NO la fila header). -
  sheet.columns = [
    { key: 'correlativeCode', width: 16 },
    { key: 'occurredAt', width: 20 },
    { key: 'state', width: 12 },
    { key: 'semaforo', width: 16 },
    { key: 'incidentTypeName', width: 32 },
    { key: 'incidentTypeCode', width: 18 },
    { key: 'zoneName', width: 22 },
    { key: 'zoneShortCode', width: 10 },
    { key: 'areaName', width: 24 },
    { key: 'propertyName', width: 28 },
    { key: 'communeName', width: 20 },
    { key: 'lat', width: 12 },
    { key: 'lng', width: 12 },
    { key: 'locationSource', width: 22 },
    { key: 'capturedByUserDisplayName', width: 26 },
    { key: 'organizationName', width: 26 },
    { key: 'description', width: 60 },
    { key: 'aggravatingFactors', width: 32 },
  ];

  // -- Header de columnas (fila siguiente al espacio). -------------------
  const headerRow = sheet.addRow([
    'Folio',
    'Ocurrido',
    'Estado',
    'Semáforo',
    'Tipo',
    'Código tipo',
    'Zona',
    'Cód zona',
    'Área',
    'Predio',
    'Comuna',
    'Latitud',
    'Longitud',
    'Origen ubicación',
    'Capturado por',
    'Organización',
    'Descripción',
    'Agravantes',
  ]);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE5E5E5' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'left' };

  // -- Filas de datos. ---------------------------------------------------
  for (const r of rows) {
    sheet.addRow([
      r.correlativeCode ?? '',
      format(r.occurredAt, 'dd-MM-yyyy HH:mm', { locale: es }),
      STATE_LABELS[r.state],
      SEMAFORO_LABELS[r.semaforo],
      r.incidentTypeName,
      r.incidentTypeCode,
      r.zoneName,
      r.zoneShortCode,
      r.areaName ?? '',
      r.propertyName ?? '',
      r.communeName ?? '',
      r.lat,
      r.lng,
      LOCATION_SOURCE_LABELS[r.locationSource] ?? r.locationSource,
      r.capturedByUserDisplayName,
      r.organizationName,
      r.description,
      r.aggravatingFactors.map((c) => AGGRAVATING_FACTOR_LABELS[c] ?? c).join(', '),
    ]);
  }

  // Freeze del header de columnas (filas de contexto + en blanco + header).
  const frozenRows = headerRows.length + 1 + 1;
  sheet.views = [{ state: 'frozen', ySplit: frozenRows }];

  // ExcelJS retorna `ArrayBuffer | Buffer` según versión — normalizamos.
  const out = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(out) ? out : Buffer.from(out);
}
