'use client';

import * as React from 'react';
import { useState, useCallback } from 'react';

import { Input } from '@/components/ui/input';
import { getLocaleConfig } from '@/lib/locale-config';
import { cn } from '@/lib/utils';

interface InputCurrencyProps {
  value: number;
  onChange: (value: number) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}

export function InputCurrency({
  value,
  onChange,
  className,
  placeholder,
  disabled,
  id,
}: InputCurrencyProps): React.JSX.Element {
  const config = getLocaleConfig();
  const [displayValue, setDisplayValue] = useState(() =>
    formatForDisplay(value, config.locale, config.currency),
  );
  const [isFocused, setIsFocused] = useState(false);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    setDisplayValue(value === 0 ? '' : value.toString());
  }, [value]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    const parsed = parseFloat(displayValue.replace(/[^\d.-]/g, '')) || 0;
    onChange(parsed);
    setDisplayValue(formatForDisplay(parsed, config.locale, config.currency));
  }, [displayValue, onChange, config.locale, config.currency]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setDisplayValue(e.target.value);
  }, []);

  return (
    <div className="relative">
      {!isFocused && (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          {config.currencySymbol}
        </span>
      )}
      <Input
        id={id}
        type={isFocused ? 'number' : 'text'}
        value={displayValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className={cn(!isFocused && 'pl-7', className)}
        placeholder={placeholder || '0.00'}
        disabled={disabled}
        step="0.01"
      />
    </div>
  );
}

function formatForDisplay(value: number, locale: string, currency: string): string {
  if (value === 0) {
    return '';
  }
  return new Intl.NumberFormat(locale, {
    style: 'decimal',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
