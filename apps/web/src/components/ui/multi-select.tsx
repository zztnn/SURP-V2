'use client';

import { Check, ChevronDown, X } from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/**
 * `MultiSelect` — combobox con selección múltiple sobre un catálogo.
 * Patrón shadcn (Popover + Command). Usado en el filtro "Tipo (Delito)"
 * de incidentes para igualar el `select multiple` del legacy SURP.
 *
 * El componente trabaja con `string[]` de IDs (no objetos), porque el
 * caso de uso típico son `external_id` UUID. La lista de opciones se
 * pasa pre-resuelta — este componente no fetcha.
 */
export interface MultiSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface MultiSelectProps {
  options: readonly MultiSelectOption[];
  value: readonly string[];
  onChange: (next: readonly string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  /** Si `true`, muestra los seleccionados como badges debajo del trigger. */
  showBadges?: boolean;
  align?: 'start' | 'center' | 'end';
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = 'Seleccionar…',
  searchPlaceholder = 'Buscar…',
  emptyText = 'Sin resultados',
  className,
  showBadges = true,
  align = 'start',
}: MultiSelectProps): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  const valueSet = React.useMemo(() => new Set(value), [value]);

  const toggle = (v: string): void => {
    const next = valueSet.has(v) ? value.filter((x) => x !== v) : [...value, v];
    onChange(next);
  };

  const clearAll = (e: React.MouseEvent): void => {
    e.stopPropagation();
    e.preventDefault();
    onChange([]);
  };

  const selectedLabels = options.filter((o) => valueSet.has(o.value));

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              'h-9 w-full justify-between gap-2 px-3 font-normal',
              value.length === 0 && 'text-muted-foreground',
            )}
          >
            <span className="truncate text-sm">
              {value.length === 0
                ? placeholder
                : value.length === 1
                  ? (selectedLabels[0]?.label ?? `${String(value.length)} seleccionado`)
                  : `${String(value.length)} seleccionados`}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              {value.length > 0 ? (
                <span
                  role="button"
                  tabIndex={0}
                  aria-label="Limpiar selección"
                  className="-mr-1 inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  onClick={clearAll}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation();
                      e.preventDefault();
                      onChange([]);
                    }
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </span>
              ) : null}
              <ChevronDown className="h-4 w-4 opacity-50" />
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align={align} className="w-[var(--radix-popover-trigger-width)] p-0">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup>
                {options.map((opt) => {
                  const checked = valueSet.has(opt.value);
                  return (
                    <CommandItem
                      key={opt.value}
                      value={opt.label}
                      disabled={opt.disabled === true}
                      onSelect={() => {
                        toggle(opt.value);
                      }}
                      className="flex cursor-pointer items-center gap-2"
                    >
                      <span
                        className={cn(
                          'flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                          checked
                            ? 'bg-primary text-primary-foreground'
                            : 'opacity-50 [&_svg]:invisible',
                        )}
                      >
                        <Check className="h-3 w-3" />
                      </span>
                      <span className="truncate">{opt.label}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {showBadges && selectedLabels.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {selectedLabels.map((opt) => (
            <Badge key={opt.value} variant="secondary" className="gap-1 pr-1 text-xs font-normal">
              <span className="truncate">{opt.label}</span>
              <button
                type="button"
                aria-label={`Quitar ${opt.label}`}
                className="-mr-0.5 inline-flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  toggle(opt.value);
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}
