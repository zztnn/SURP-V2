import type { RowData } from '@tanstack/react-table';
import type { ComponentType } from 'react';

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** When true, column is hidden on mobile and shown in the expanded row */
    responsive?: boolean | undefined;
    /** Label displayed in the expanded row for this column */
    label?: string | undefined;
    /**
     * Alineamiento de columna. Convención canónica:
     *   - text columns → "left" (default, can be omitted)
     *   - numeric columns → "right"
     *   - boolean / checkbox / small-toggle columns → "center"
     * Applied to BOTH the header and the cell.
     */
    align?: 'left' | 'right' | 'center' | undefined;
    /** When true, column grows to fill available space instead of using a fixed width */
    flex?: boolean | undefined;
    /** When true, column shrinks to fit its content (width: 1% + white-space: nowrap) */
    shrink?: boolean | undefined;
    /** Icon shown next to the label in the expanded detail row */
    icon?: ComponentType<{ className?: string }> | undefined;
    /** When true, column sticks to the right edge of the table */
    stickyRight?: boolean | undefined;
  }
}
