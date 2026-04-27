'use client';

import { Check, ListChecks, Monitor, Moon, MoreHorizontal, Palette, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useState, type ReactElement } from 'react';

import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  SIDEBAR_PRESETS,
  THEME_PRESETS,
  type SidebarPresetId,
  type ThemePresetId,
} from '@/config/themes';
import { useMountEffect } from '@/hooks/use-mount-effect';
import { cn } from '@/lib/utils';
import { useListPreferencesStore, type ActionMenuStyle } from '@/stores/list-preferences-store';
import { useThemeStore } from '@/stores/theme-store';
import { ZOOM_FACTORS, useZoomStore, type ZoomFactor } from '@/stores/zoom-store';

import type { LucideIcon } from 'lucide-react';

export default function SettingsAparienciaPage(): ReactElement {
  const [mounted, setMounted] = useState(false);
  useMountEffect(() => {
    setMounted(true);
    return undefined;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Palette}
        title="Apariencia"
        description="Tema, zoom de la interfaz, paleta principal y color del sidebar"
      />

      {mounted ? (
        <>
          <ThemeSection />
          <ListActionMenuSection />
          <ZoomSection />
          <PresetSection />
          <SidebarPresetSection />
        </>
      ) : (
        <div className="space-y-4 text-sm text-muted-foreground">Cargando preferencias…</div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Tema (light / dark / system)
// ────────────────────────────────────────────────────────────────────

interface ThemeOption {
  value: 'light' | 'dark' | 'system';
  label: string;
  icon: LucideIcon;
  description: string;
}

const THEME_OPTIONS: readonly ThemeOption[] = [
  { value: 'light', label: 'Claro', icon: Sun, description: 'Fondo claro siempre' },
  { value: 'dark', label: 'Oscuro', icon: Moon, description: 'Fondo oscuro siempre' },
  {
    value: 'system',
    label: 'Sistema',
    icon: Monitor,
    description: 'Sigue la preferencia del SO',
  },
];

function ThemeSection(): ReactElement {
  const { theme, setTheme } = useTheme();
  const current = (theme ?? 'system') as 'light' | 'dark' | 'system';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tema</CardTitle>
        <CardDescription>Apariencia general claro u oscuro</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-3">
          {THEME_OPTIONS.map((opt) => (
            <ThemeOptionCard
              key={opt.value}
              option={opt}
              active={current === opt.value}
              onSelect={() => {
                setTheme(opt.value);
              }}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ThemeOptionCard({
  option,
  active,
  onSelect,
}: {
  option: ThemeOption;
  active: boolean;
  onSelect: () => void;
}): ReactElement {
  const Icon = option.icon;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        'group relative flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors',
        active
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/40 hover:bg-accent',
      )}
    >
      <div className="flex w-full items-center justify-between">
        <Icon className={cn('h-5 w-5', active ? 'text-primary' : 'text-muted-foreground')} />
        {active ? <Check className="h-4 w-4 text-primary" /> : null}
      </div>
      <div>
        <div className="text-sm font-medium">{option.label}</div>
        <div className="text-xs text-muted-foreground">{option.description}</div>
      </div>
    </button>
  );
}

// ────────────────────────────────────────────────────────────────────
// Zoom (80 / 90 / 100 / 110 / 125 %)
// ────────────────────────────────────────────────────────────────────

function ZoomSection(): ReactElement {
  const factor = useZoomStore((s) => s.factor);
  const setFactor = useZoomStore((s) => s.setFactor);
  const topbarVisible = useZoomStore((s) => s.topbarVisible);
  const setTopbarVisible = useZoomStore((s) => s.setTopbarVisible);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Zoom</CardTitle>
        <CardDescription>
          Tamaño de la interfaz. Se aplica a todo el sistema (texto, botones, espaciado).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {ZOOM_FACTORS.map((value) => (
            <ZoomButton
              key={value}
              value={value}
              active={value === factor}
              onSelect={() => {
                setFactor(value);
              }}
            />
          ))}
        </div>
        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/40 p-3">
          <div className="space-y-0.5">
            <Label htmlFor="zoom-topbar-toggle" className="text-sm font-medium">
              Mostrar control de zoom en el topbar
            </Label>
            <p className="text-xs text-muted-foreground">
              Acceso rápido al zoom desde el menú superior. Por defecto está oculto.
            </p>
          </div>
          <Switch
            id="zoom-topbar-toggle"
            checked={topbarVisible}
            onCheckedChange={setTopbarVisible}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function ZoomButton({
  value,
  active,
  onSelect,
}: {
  value: ZoomFactor;
  active: boolean;
  onSelect: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        'min-w-16 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-muted text-foreground hover:border-primary/40 hover:bg-muted/70',
      )}
    >
      {Math.round(value * 100)} %
    </button>
  );
}

// ────────────────────────────────────────────────────────────────────
// Preset de paleta principal — árboles nativos
// ────────────────────────────────────────────────────────────────────

function PresetSection(): ReactElement {
  const preset = useThemeStore((s) => s.preset);
  const setPreset = useThemeStore((s) => s.setPreset);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Paleta principal</CardTitle>
        <CardDescription>
          Colores de fondo, primario y acentos. Inspirados en árboles nativos del sur de Chile.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {THEME_PRESETS.map((p) => (
            <ThemePresetCard
              key={p.id}
              id={p.id}
              name={p.name}
              description={p.description}
              previewLight={p.preview.light}
              previewDark={p.preview.dark}
              active={p.id === preset}
              onSelect={() => {
                setPreset(p.id);
              }}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface ThemeSwatch {
  bg: string;
  primary: string;
  card: string;
  accent: string;
}

function ThemePresetCard({
  id: _id,
  name,
  description,
  previewLight,
  previewDark,
  active,
  onSelect,
}: {
  id: ThemePresetId;
  name: string;
  description: string;
  previewLight: ThemeSwatch;
  previewDark: ThemeSwatch;
  active: boolean;
  onSelect: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        'group relative flex flex-col gap-3 rounded-lg border p-3 text-left transition-colors',
        active
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/40 hover:bg-accent',
      )}
    >
      {active ? (
        <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="h-3 w-3" />
        </span>
      ) : null}
      <div className="flex gap-2">
        <ThemePreview swatch={previewLight} />
        <ThemePreview swatch={previewDark} />
      </div>
      <div>
        <div className="text-sm font-semibold">{name}</div>
        <div className="line-clamp-2 text-xs text-muted-foreground">{description}</div>
      </div>
    </button>
  );
}

function ThemePreview({ swatch }: { swatch: ThemeSwatch }): ReactElement {
  return (
    <div
      className="flex h-14 w-full flex-col gap-1 overflow-hidden rounded-md border border-border/50 p-1.5"
      style={{ backgroundColor: swatch.bg }}
      aria-hidden
    >
      <div className="h-3 w-3/4 rounded-sm" style={{ backgroundColor: swatch.card }} />
      <div className="flex flex-1 items-end gap-1">
        <div className="h-2 w-1/2 rounded-sm" style={{ backgroundColor: swatch.primary }} />
        <div className="h-2 flex-1 rounded-sm" style={{ backgroundColor: swatch.accent }} />
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Preset de sidebar — ambientes del bosque
// ────────────────────────────────────────────────────────────────────

function SidebarPresetSection(): ReactElement {
  const preset = useThemeStore((s) => s.sidebarPreset);
  const setPreset = useThemeStore((s) => s.setSidebarPreset);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Color del sidebar</CardTitle>
        <CardDescription>
          Tonalidad del menú lateral. Independiente de la paleta principal — combina el que
          prefieras.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SIDEBAR_PRESETS.map((p) => (
            <SidebarPresetCard
              key={p.id}
              id={p.id}
              name={p.name}
              description={p.description}
              previewLight={p.preview.light}
              previewDark={p.preview.dark}
              active={p.id === preset}
              onSelect={() => {
                setPreset(p.id);
              }}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface SidebarSwatch {
  sidebar: string;
  accent: string;
  foreground: string;
}

function SidebarPresetCard({
  id: _id,
  name,
  description,
  previewLight,
  previewDark,
  active,
  onSelect,
}: {
  id: SidebarPresetId;
  name: string;
  description: string;
  previewLight: SidebarSwatch;
  previewDark: SidebarSwatch;
  active: boolean;
  onSelect: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        'group relative flex flex-col gap-3 rounded-lg border p-3 text-left transition-colors',
        active
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/40 hover:bg-accent',
      )}
    >
      {active ? (
        <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="h-3 w-3" />
        </span>
      ) : null}
      <div className="flex gap-2">
        <SidebarPreview swatch={previewLight} />
        <SidebarPreview swatch={previewDark} />
      </div>
      <div>
        <div className="text-sm font-semibold">{name}</div>
        <div className="line-clamp-2 text-xs text-muted-foreground">{description}</div>
      </div>
    </button>
  );
}

function SidebarPreview({ swatch }: { swatch: SidebarSwatch }): ReactElement {
  return (
    <div
      className="flex h-14 w-full flex-col gap-1 overflow-hidden rounded-md border border-border/50 p-1.5"
      style={{
        background: `linear-gradient(to bottom, ${swatch.sidebar}, ${swatch.accent})`,
      }}
      aria-hidden
    >
      <div
        className="h-2 w-2/3 rounded-sm"
        style={{ backgroundColor: swatch.foreground, opacity: 0.85 }}
      />
      <div
        className="h-1.5 w-1/2 rounded-sm"
        style={{ backgroundColor: swatch.foreground, opacity: 0.45 }}
      />
      <div
        className="h-1.5 w-2/5 rounded-sm"
        style={{ backgroundColor: swatch.foreground, opacity: 0.45 }}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Estilo del menú de acciones en listas (inline / dropdown)
// ────────────────────────────────────────────────────────────────────

interface ActionMenuOption {
  value: ActionMenuStyle;
  label: string;
  description: string;
  icon: LucideIcon;
}

const ACTION_MENU_OPTIONS: readonly ActionMenuOption[] = [
  {
    value: 'inline',
    label: 'Botones inline',
    icon: ListChecks,
    description: 'Cluster de íconos visible en cada fila (ver, cerrar, anular).',
  },
  {
    value: 'dropdown',
    label: 'Menú contextual',
    icon: MoreHorizontal,
    description: 'Botón ⋯ que abre menú con las acciones. Más compacto.',
  },
];

function ListActionMenuSection(): ReactElement {
  const style = useListPreferencesStore((s) => s.actionMenuStyle);
  const setStyle = useListPreferencesStore((s) => s.setActionMenuStyle);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Acciones en listas</CardTitle>
        <CardDescription>
          Estilo del menú de acciones en las tablas. En pantallas angostas (≤ 1024 px) siempre se
          fuerza el menú contextual para evitar overflow.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2">
          {ACTION_MENU_OPTIONS.map((opt) => (
            <ActionMenuOptionCard
              key={opt.value}
              option={opt}
              active={style === opt.value}
              onSelect={() => {
                setStyle(opt.value);
              }}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ActionMenuOptionCard({
  option,
  active,
  onSelect,
}: {
  option: ActionMenuOption;
  active: boolean;
  onSelect: () => void;
}): ReactElement {
  const Icon = option.icon;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        'group relative flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors',
        active
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/40 hover:bg-accent',
      )}
    >
      <div className="flex w-full items-center justify-between">
        <Icon className={cn('h-5 w-5', active ? 'text-primary' : 'text-muted-foreground')} />
        {active ? <Check className="h-4 w-4 text-primary" /> : null}
      </div>
      <div>
        <div className="text-sm font-medium">{option.label}</div>
        <div className="text-xs text-muted-foreground">{option.description}</div>
      </div>
    </button>
  );
}
