'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';

interface KeyboardShortcutsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Shortcut {
  keys: string[];
  description: string;
}

const SHORTCUTS: { group: string; items: Shortcut[] }[] = [
  {
    group: 'Navegación',
    items: [
      { keys: ['⌘/Ctrl', 'M'], description: 'Enfocar búsqueda del menú' },
      { keys: ['Esc'], description: 'Cerrar diálogos y overlays' },
    ],
  },
  {
    group: 'Apariencia',
    items: [{ keys: ['F11'], description: 'Pantalla completa (nativo del navegador)' }],
  },
];

export function KeyboardShortcutsModal({
  open,
  onOpenChange,
}: KeyboardShortcutsModalProps): React.ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Atajos de teclado</DialogTitle>
          <DialogDescription>Accesos rápidos disponibles en toda la aplicación.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {SHORTCUTS.map((section, idx) => (
            <div key={section.group}>
              {idx > 0 && <Separator className="my-3" />}
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {section.group}
              </h3>
              <ul className="space-y-2">
                {section.items.map((s) => (
                  <li
                    key={s.description}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span>{s.description}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {s.keys.map((k) => (
                        <kbd
                          key={k}
                          className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
