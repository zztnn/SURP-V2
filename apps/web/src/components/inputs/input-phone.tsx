'use client';

import * as React from 'react';

import { Input } from '@/components/ui/input';
import { getLocaleConfig } from '@/lib/locale-config';
import { cn } from '@/lib/utils';

interface InputPhoneProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}

export function InputPhone({
  value,
  onChange,
  className,
  placeholder,
  disabled,
  id,
}: InputPhoneProps): React.JSX.Element {
  const config = getLocaleConfig();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const raw = e.target.value.replace(/[^\d+]/g, '');
    onChange(raw);
  };

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        {config.phonePrefix}
      </span>
      <Input
        id={id}
        type="tel"
        value={value}
        onChange={handleChange}
        className={cn('pl-10', className)}
        placeholder={placeholder || config.phoneMask}
        disabled={disabled}
      />
    </div>
  );
}
