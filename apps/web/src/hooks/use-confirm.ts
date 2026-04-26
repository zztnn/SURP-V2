'use client';

import { useState, useCallback } from 'react';

import type React from 'react';

export function useConfirm(): {
  isOpen: boolean;
  isLoading: boolean;
  open: () => void;
  close: () => void;
  confirm: (action: () => Promise<void>) => Promise<void>;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
} {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const open = useCallback(() => {
    setIsOpen(true);
  }, []);
  const close = useCallback(() => {
    setIsOpen(false);
    setIsLoading(false);
  }, []);

  const confirm = useCallback(async (action: () => Promise<void>) => {
    setIsLoading(true);
    try {
      await action();
    } finally {
      setIsLoading(false);
      setIsOpen(false);
    }
  }, []);

  return {
    isOpen,
    isLoading,
    open,
    close,
    confirm,
    setIsOpen,
  };
}
