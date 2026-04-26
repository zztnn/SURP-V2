'use client';

import { Calendar as CalendarIcon } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getLocaleConfig } from '@/lib/locale-config';
import { cn } from '@/lib/utils';

/** Format a Date as DD MMM YYYY (centralized format from locale-config). */
function formatDateDisplay(date: Date): string {
  const { locale } = getLocaleConfig();
  const day = new Intl.DateTimeFormat(locale, { day: '2-digit' }).format(date);
  const month = new Intl.DateTimeFormat(locale, { month: 'short' }).format(date);
  const year = new Intl.DateTimeFormat(locale, { year: 'numeric' }).format(date);
  return `${day} ${month} ${year}`;
}

interface DatePickerProps {
  /** ISO date string (yyyy-MM-dd) or empty. */
  value: string;
  /** Called with ISO date string or empty. */
  onChange: (isoDate: string) => void;
  placeholder?: string;
  className?: string;
}

function DatePicker({
  value,
  onChange,
  placeholder = 'Elegir fecha',
  className,
}: DatePickerProps): React.JSX.Element {
  const [open, setOpen] = React.useState(false);

  const selected = React.useMemo(() => {
    if (!value) {
      return undefined;
    }
    const d = new Date(value);
    return isNaN(d.getTime()) ? undefined : d;
  }, [value]);

  const displayText = selected ? formatDateDisplay(selected) : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'h-7 w-full justify-start text-left text-xs font-normal',
            !displayText && 'text-muted-foreground',
            className,
          )}
        >
          <CalendarIcon className="mr-1.5 h-3 w-3 shrink-0" />
          {displayText ?? placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => {
            if (date) {
              const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
              onChange(iso);
            } else {
              onChange('');
            }
            setOpen(false);
          }}
          autoFocus
        />
        <div className="border-t px-3 py-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs"
            onClick={() => {
              const now = new Date();
              const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
              onChange(iso);
              setOpen(false);
            }}
          >
            Hoy
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { DatePicker, formatDateDisplay };
