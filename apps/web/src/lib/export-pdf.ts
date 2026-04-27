/**
 * Export a PDF — stub temporal.
 *
 * El componente <DataListView> portado del ERP soporta export a PDF/Excel
 * vía `exportConfig`. SURP no incluye `jspdf` ni `jspdf-autotable` en el
 * stack (regla #15: librería nueva requiere ADR). Hasta que se decida
 * agregarlas, este stub mantiene la API compatible.
 */

export interface ExportColumn {
  key: string;
  label: string;
  width?: number | undefined;
  align?: 'left' | 'center' | 'right' | undefined;
  format?: ((value: unknown) => string) | undefined;
}

export interface ExportToPdfOptions {
  title: string;
  columns: ExportColumn[];
  data: Record<string, unknown>[];
  filename?: string | undefined;
  orientation?: 'portrait' | 'landscape' | undefined;
  pageSize?: 'a4' | 'letter' | undefined;
}

export function exportToPdf(_options: ExportToPdfOptions): void {
  console.warn(
    '[export-pdf] stub — exportar a PDF requiere `jspdf` + `jspdf-autotable`. Pendiente ADR.',
  );
}
