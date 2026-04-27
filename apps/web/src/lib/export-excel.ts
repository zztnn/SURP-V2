/**
 * Export a Excel — stub temporal. Ver `export-pdf.ts` para rationale
 * (mismo patrón: `exceljs` + `file-saver` requieren ADR).
 */

import type { ExportColumn } from './export-pdf';

export interface ExportToExcelOptions {
  title: string;
  columns: ExportColumn[];
  data: Record<string, unknown>[];
  filename?: string | undefined;
  sheetName?: string | undefined;
}

export async function exportToExcel(_options: ExportToExcelOptions): Promise<void> {
  console.warn(
    '[export-excel] stub — exportar a Excel requiere `exceljs` + `file-saver`. Pendiente ADR.',
  );
  return Promise.resolve();
}
