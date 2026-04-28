import ExcelJS from 'exceljs';

import { generateIncidentsExcel, type IncidentExportRow } from './incidents-excel.generator';

function row(overrides: Partial<IncidentExportRow> = {}): IncidentExportRow {
  return {
    correlativeCode: '1-2026-ZML',
    occurredAt: new Date(Date.UTC(2026, 3, 15, 12, 30)),
    state: 'active',
    semaforo: 'rojo',
    incidentTypeCode: 'THEFT_TIMBER',
    incidentTypeName: 'Robo de madera',
    zoneShortCode: 'ML',
    zoneName: 'Zona Maule',
    areaName: 'Área Norte',
    propertyName: 'Predio La Pampa',
    communeName: 'Cauquenes',
    lat: -35.42,
    lng: -71.65,
    locationSource: 'gps',
    capturedByUserDisplayName: 'Juan Pérez',
    organizationName: 'Forestal Arauco',
    description: 'Robo de madera en sector norte. Camión avistado en escape.',
    aggravatingFactors: ['chainsaw_used', 'motorized_vehicle_used'],
    ...overrides,
  };
}

async function loadWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  // ExcelJS espera el tipo legacy de Buffer; el cast a `ArrayBuffer` evita
  // el conflicto del nuevo `Buffer<ArrayBufferLike>` introducido en
  // Node 22 + @types/node recientes.
  await wb.xlsx.load(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
  );
  return wb;
}

async function loadSheet(buffer: Buffer): Promise<ExcelJS.Worksheet> {
  const wb = await loadWorkbook(buffer);
  const sheet = wb.getWorksheet('Incidentes');
  if (sheet === undefined) {
    throw new Error('Worksheet "Incidentes" no encontrada');
  }
  return sheet;
}

describe('generateIncidentsExcel', () => {
  it('produce un Buffer xlsx válido', async () => {
    const buffer = await generateIncidentsExcel([row()]);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    // Magic number de ZIP/xlsx: PK\x03\x04
    expect(buffer.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  });

  it('arma sheet con header de columnas y al menos una fila de datos', async () => {
    const buffer = await generateIncidentsExcel([row()]);
    const sheet = await loadSheet(buffer);
    // Filas: 2 contexto (título + Generado el) + 1 en blanco + 1 header + 1 dato = 5
    expect(sheet.rowCount).toBeGreaterThanOrEqual(5);
  });

  it('traduce state, semáforo, agravantes y locationSource a español', async () => {
    const buffer = await generateIncidentsExcel([
      row({
        state: 'voided',
        semaforo: 'amarillo',
        locationSource: 'property_centroid',
        aggravatingFactors: ['chainsaw_used', 'fence_breach'],
      }),
    ]);
    const sheet = await loadSheet(buffer);
    const dataRow = sheet.getRow(sheet.rowCount);
    expect(dataRow.getCell(3).value).toBe('Anulado');
    expect(dataRow.getCell(4).value).toBe('Amarillo');
    expect(dataRow.getCell(14).value).toBe('Centroide del predio');
    expect(dataRow.getCell(18).value).toBe('Uso de motosierra, Forzamiento de cerco');
  });

  it('incluye el header de contexto (Generado el, Generado por, Filtros)', async () => {
    const generatedAt = new Date(Date.UTC(2026, 3, 28, 14, 0));
    const buffer = await generateIncidentsExcel([row()], {
      generatedAt,
      generatedByDisplayName: 'Iván Vuskovic',
      filtersSummary: 'Zona: Maule · Semáforo: Rojo',
    });
    const sheet = await loadSheet(buffer);
    expect(sheet.getRow(1).getCell(1).value).toContain('SURP 2.0');
    expect(sheet.getRow(2).getCell(1).value).toBe('Generado el');
    expect(sheet.getRow(3).getCell(1).value).toBe('Generado por');
    expect(sheet.getRow(3).getCell(2).value).toBe('Iván Vuskovic');
    expect(sheet.getRow(4).getCell(1).value).toBe('Filtros aplicados');
    expect(sheet.getRow(4).getCell(2).value).toBe('Zona: Maule · Semáforo: Rojo');
  });

  it('soporta dataset vacío (solo header, sin filas de datos)', async () => {
    const buffer = await generateIncidentsExcel([]);
    const sheet = await loadSheet(buffer);
    // Header de columnas presente, sin filas de datos.
    expect(sheet.rowCount).toBeGreaterThanOrEqual(3);
  });

  it('mantiene `correlativeCode` null como string vacío en la celda', async () => {
    const buffer = await generateIncidentsExcel([row({ correlativeCode: null })]);
    const sheet = await loadSheet(buffer);
    expect(sheet.getRow(sheet.rowCount).getCell(1).value).toBe('');
  });

  it('lat / lng se preservan como números (no string)', async () => {
    const buffer = await generateIncidentsExcel([row({ lat: -37.46, lng: -72.36 })]);
    const sheet = await loadSheet(buffer);
    const dataRow = sheet.getRow(sheet.rowCount);
    expect(typeof dataRow.getCell(12).value).toBe('number');
    expect(dataRow.getCell(12).value).toBe(-37.46);
  });

  it('agravantes desconocidos se preservan tal cual (fallback)', async () => {
    const buffer = await generateIncidentsExcel([row({ aggravatingFactors: ['unknown_code'] })]);
    const sheet = await loadSheet(buffer);
    expect(sheet.getRow(sheet.rowCount).getCell(18).value).toBe('unknown_code');
  });
});
