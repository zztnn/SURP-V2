'use client';

import {
  endOfMonth,
  endOfWeek,
  endOfYear,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
  subYears,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar as CalendarIcon, X } from 'lucide-react';
import * as React from 'react';
import { type DateRange } from 'react-day-picker';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { dateToIso, formatDateDisplay, parseIsoLocal } from '@/lib/date-utils';
import { cn } from '@/lib/utils';

/**
 * `DateRangePicker` — selección de rango con presets del legacy SURP
 * ("Año en curso", "Mes pasado", "Últimos 30 días", etc.) más un
 * calendario de rango libre para el caso "Personalizado".
 *
 * El componente trabaja en ISO `yyyy-MM-dd`; convierte a `Date` solo
 * para el calendario interno. La UI sigue el patrón de ERP/IWH: trigger
 * tipo `<Input>` con icono y label legible (`del 01 abr 2026 al 27 abr 2026`)
 * y popover con sidebar de presets a la izquierda + calendar mode="range"
 * a la derecha.
 */
export interface DateRangeValue {
  from: string | null; // yyyy-MM-dd
  to: string | null; // yyyy-MM-dd
}

export interface DateRangePickerProps {
  value: DateRangeValue;
  onChange: (next: DateRangeValue) => void;
  placeholder?: string;
  className?: string;
  align?: 'start' | 'center' | 'end';
}

interface PresetDef {
  id: string;
  label: string;
  /** Devuelve `[from, to]` en `Date`. Ambos se serializan a ISO local. */
  build: (today: Date) => readonly [Date, Date];
}

const PRESETS: readonly PresetDef[] = [
  {
    id: 'year-current',
    label: 'Año en curso',
    build: (t) => [startOfYear(t), t],
  },
  {
    id: 'year-previous',
    label: 'Año pasado',
    build: (t) => {
      const prev = subYears(t, 1);
      return [startOfYear(prev), endOfYear(prev)];
    },
  },
  {
    id: 'last-12m',
    label: 'Últimos 12 meses',
    build: (t) => [subMonths(t, 12), t],
  },
  {
    id: 'last-6m',
    label: 'Últimos 6 meses',
    build: (t) => [subMonths(t, 6), t],
  },
  {
    id: 'last-3m',
    label: 'Últimos 3 meses',
    build: (t) => [subMonths(t, 3), t],
  },
  {
    id: 'last-30d',
    label: 'Últimos 30 días',
    build: (t) => [subDays(t, 30), t],
  },
  {
    id: 'month-current',
    label: 'Mes en curso',
    build: (t) => [startOfMonth(t), t],
  },
  {
    id: 'month-previous',
    label: 'Mes pasado',
    build: (t) => {
      const prev = subMonths(t, 1);
      return [startOfMonth(prev), endOfMonth(prev)];
    },
  },
  {
    id: 'last-7d',
    label: 'Últimos 7 días',
    build: (t) => [subDays(t, 7), t],
  },
  {
    id: 'week-current',
    label: 'Semana en curso',
    build: (t) => [startOfWeek(t, { weekStartsOn: 1 }), t],
  },
  {
    id: 'week-previous',
    label: 'Semana pasada',
    build: (t) => {
      const prev = subDays(t, 7);
      return [startOfWeek(prev, { weekStartsOn: 1 }), endOfWeek(prev, { weekStartsOn: 1 })];
    },
  },
  {
    id: 'today',
    label: 'Hoy',
    build: (t) => [t, t],
  },
  {
    id: 'yesterday',
    label: 'Ayer',
    build: (t) => {
      const y = subDays(t, 1);
      return [y, y];
    },
  },
];

function rangeFromValue(value: DateRangeValue): DateRange | undefined {
  const from = value.from !== null ? parseIsoLocal(value.from) : null;
  const to = value.to !== null ? parseIsoLocal(value.to) : null;
  if (from === null && to === null) {
    return undefined;
  }
  return {
    from: from ?? undefined,
    to: to ?? undefined,
  };
}

function describeRange(value: DateRangeValue): string | null {
  if (value.from === null && value.to === null) {
    return null;
  }
  const fromDate = value.from !== null ? parseIsoLocal(value.from) : null;
  const toDate = value.to !== null ? parseIsoLocal(value.to) : null;
  if (fromDate !== null && toDate !== null) {
    return `${formatDateDisplay(fromDate)} — ${formatDateDisplay(toDate)}`;
  }
  if (fromDate !== null) {
    return `Desde ${formatDateDisplay(fromDate)}`;
  }
  if (toDate !== null) {
    return `Hasta ${formatDateDisplay(toDate)}`;
  }
  return null;
}

export function DateRangePicker({
  value,
  onChange,
  placeholder = 'Cualquier fecha',
  className,
  align = 'start',
}: DateRangePickerProps): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  const today = React.useMemo(() => new Date(), []);
  const label = describeRange(value);

  const handlePreset = (def: PresetDef): void => {
    const [from, to] = def.build(today);
    onChange({ from: dateToIso(from), to: dateToIso(to) });
    setOpen(false);
  };

  const handleCalendarSelect = (range: DateRange | undefined): void => {
    if (!range || (range.from === undefined && range.to === undefined)) {
      onChange({ from: null, to: null });
      return;
    }
    onChange({
      from: range.from ? dateToIso(range.from) : null,
      to: range.to ? dateToIso(range.to) : null,
    });
  };

  const handleClear = (e: React.MouseEvent): void => {
    e.stopPropagation();
    e.preventDefault();
    onChange({ from: null, to: null });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'h-9 w-full justify-between gap-2 px-3 font-normal',
            label === null && 'text-muted-foreground',
            className,
          )}
          aria-label={label ?? placeholder}
        >
          <span className="flex min-w-0 items-center gap-2">
            <CalendarIcon className="h-4 w-4 shrink-0" />
            <span className="truncate text-sm">{label ?? placeholder}</span>
          </span>
          {label !== null ? (
            <span
              role="button"
              tabIndex={0}
              aria-label="Limpiar rango"
              className="-mr-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              onClick={handleClear}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation();
                  e.preventDefault();
                  onChange({ from: null, to: null });
                }
              }}
            >
              <X className="h-3.5 w-3.5" />
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        sideOffset={4}
        collisionPadding={8}
        className="w-[min(100vw-1rem,46rem)] max-h-[80vh] overflow-y-auto p-0 sm:w-auto sm:max-h-none sm:overflow-visible"
      >
        <div className="flex flex-col sm:flex-row">
          {/* Sidebar de presets — vertical desde sm; en mobile se vuelve un
              chip-row scrollable horizontal arriba del calendar para no
              empujar el calendar fuera del viewport. */}
          <div className="flex border-b border-border/60 p-2 sm:w-44 sm:flex-col sm:gap-0.5 sm:border-b-0 sm:border-r">
            <span className="hidden px-2 pb-1 pt-0.5 text-xs font-medium text-muted-foreground sm:block">
              Rango rápido
            </span>
            <div className="flex gap-1.5 overflow-x-auto sm:flex-col sm:gap-0.5 sm:overflow-x-visible">
              {PRESETS.map((def) => (
                <button
                  key={def.id}
                  type="button"
                  className="shrink-0 whitespace-nowrap rounded-md border border-border/60 bg-muted/40 px-2.5 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:outline-none sm:w-full sm:border-0 sm:bg-transparent sm:text-left sm:text-sm"
                  onClick={() => {
                    handlePreset(def);
                  }}
                >
                  {def.label}
                </button>
              ))}
              <Separator className="hidden sm:my-1 sm:block" />
              <button
                type="button"
                className="shrink-0 whitespace-nowrap rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive hover:bg-destructive/10 focus:outline-none sm:w-full sm:border-0 sm:bg-transparent sm:text-left sm:text-sm sm:text-foreground"
                onClick={() => {
                  onChange({ from: null, to: null });
                  setOpen(false);
                }}
              >
                Limpiar rango
              </button>
            </div>
          </div>
          <div className="flex justify-center p-1">
            <Calendar
              mode="range"
              numberOfMonths={2}
              selected={rangeFromValue(value)}
              onSelect={handleCalendarSelect}
              locale={es}
              defaultMonth={
                value.from !== null ? (parseIsoLocal(value.from) ?? today) : subMonths(today, 1)
              }
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
