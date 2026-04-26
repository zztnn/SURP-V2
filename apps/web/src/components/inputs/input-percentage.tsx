'use client';

import * as React from 'react';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface InputPercentageProps {
  value: number;
  onChange: (value: number) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}

export function InputPercentage({
  value,
  onChange,
  className,
  placeholder,
  disabled,
  id,
}: InputPercentageProps): React.JSX.Element {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const parsed = parseFloat(e.target.value);
    if (!isNaN(parsed)) {
      if (parsed < 0 || parsed > 100) {
        return;
      }
      onChange(parsed);
    } else if (e.target.value === '') {
      onChange(0);
    }
  };

  return (
    <div className="relative">
      <Input
        id={id}
        type="number"
        value={value || ''}
        onChange={handleChange}
        min={0}
        max={100}
        step={0.01}
        className={cn('pr-8', className)}
        placeholder={placeholder || '0'}
        disabled={disabled}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        %
      </span>
    </div>
  );
}
