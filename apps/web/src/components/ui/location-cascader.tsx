'use client';

import { ChevronRight, MapPin, Search, X } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

import type { CatalogArea, CatalogProperty, CatalogZone } from '@/types/incidents';

/**
 * Valor del cascader. Los 3 niveles son independientes; cuando se selecciona
 * un nivel inferior, los superiores se completan automáticamente. Limpiar
 * un nivel intermedio (vía el chip X del trigger) limpia también los hijos.
 */
export interface LocationCascaderValue {
  zoneExternalId: string | null;
  areaExternalId: string | null;
  propertyExternalId: string | null;
}

interface LocationCascaderProps {
  value: LocationCascaderValue;
  onChange: (next: LocationCascaderValue) => void;
  /** Catálogo COMPLETO de zonas. */
  zones: readonly CatalogZone[];
  /** Catálogo COMPLETO de áreas (no filtradas). El cascader filtra internamente por zona. */
  areas: readonly CatalogArea[];
  /** Catálogo COMPLETO de predios (no filtrados). El cascader filtra internamente por área/zona. */
  properties: readonly CatalogProperty[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

const EMPTY_VALUE: LocationCascaderValue = {
  zoneExternalId: null,
  areaExternalId: null,
  propertyExternalId: null,
};

const SEARCH_RESULTS_LIMIT = 50;

/** Normaliza para fuzzy match: lowercase + sin diacríticos. */
function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

interface SearchResult {
  level: 'zone' | 'area' | 'property';
  zoneId: string;
  areaId: string | null;
  propertyId: string | null;
  /** Segmentos del path para render con separadores. Último = el item match. */
  pathParts: string[];
}

export function LocationCascader({
  value,
  onChange,
  zones,
  areas,
  properties,
  placeholder = 'Cualquier ubicación',
  disabled,
  className,
}: LocationCascaderProps): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  // `draft` es la selección "pendiente" mientras el popover está abierto.
  // Solo se commit-ea con "Aplicar", click en predio, o click en un resultado
  // de búsqueda. Cerrar con click-fuera o Cancelar descarta el draft.
  const [draft, setDraft] = React.useState<LocationCascaderValue>(value);

  // Mapas e índices auxiliares — memoizados.
  const zoneById = React.useMemo(() => new Map(zones.map((z) => [z.externalId, z])), [zones]);
  const areaById = React.useMemo(() => new Map(areas.map((a) => [a.externalId, a])), [areas]);
  const propertyById = React.useMemo(
    () => new Map(properties.map((p) => [p.externalId, p])),
    [properties],
  );
  const areasByZoneId = React.useMemo(() => {
    const m = new Map<string, CatalogArea[]>();
    for (const a of areas) {
      const list = m.get(a.zoneExternalId) ?? [];
      list.push(a);
      m.set(a.zoneExternalId, list);
    }
    return m;
  }, [areas]);
  const propertiesByAreaId = React.useMemo(() => {
    const m = new Map<string, CatalogProperty[]>();
    for (const p of properties) {
      const list = m.get(p.areaExternalId) ?? [];
      list.push(p);
      m.set(p.areaExternalId, list);
    }
    return m;
  }, [properties]);

  // Path legible para el trigger.
  const triggerLabel = React.useMemo(() => {
    const parts: string[] = [];
    if (value.zoneExternalId !== null) {
      const z = zoneById.get(value.zoneExternalId);
      if (z) {
        parts.push(`Z${z.shortCode} · ${z.name}`);
      }
    }
    if (value.areaExternalId !== null) {
      const a = areaById.get(value.areaExternalId);
      if (a) {
        parts.push(a.name);
      }
    }
    if (value.propertyExternalId !== null) {
      const p = propertyById.get(value.propertyExternalId);
      if (p) {
        parts.push(p.name);
      }
    }
    return parts;
  }, [value, zoneById, areaById, propertyById]);

  const hasValue =
    value.zoneExternalId !== null ||
    value.areaExternalId !== null ||
    value.propertyExternalId !== null;

  // Resultados del search global. Busca match en zonas, áreas y predios y
  // arma el path completo para cada uno. Limitado para no sobrecargar el DOM.
  const searchResults = React.useMemo<SearchResult[]>(() => {
    const term = normalize(search.trim());
    if (term.length === 0) {
      return [];
    }
    const out: SearchResult[] = [];
    for (const z of zones) {
      if (out.length >= SEARCH_RESULTS_LIMIT) {
        break;
      }
      // Match en code, shortCode o name de la zona.
      const haystack = normalize(`${z.code} ${z.shortCode} ${z.name}`);
      if (haystack.includes(term)) {
        out.push({
          level: 'zone',
          zoneId: z.externalId,
          areaId: null,
          propertyId: null,
          pathParts: [`Z${z.shortCode} · ${z.name}`],
        });
      }
    }
    for (const a of areas) {
      if (out.length >= SEARCH_RESULTS_LIMIT) {
        break;
      }
      // Match en code o name del área.
      if (normalize(`${a.code} ${a.name}`).includes(term)) {
        const z = zoneById.get(a.zoneExternalId);
        out.push({
          level: 'area',
          zoneId: a.zoneExternalId,
          areaId: a.externalId,
          propertyId: null,
          pathParts: z
            ? [`Z${z.shortCode} · ${z.name}`, `${a.code} · ${a.name}`]
            : [`${a.code} · ${a.name}`],
        });
      }
    }
    for (const p of properties) {
      if (out.length >= SEARCH_RESULTS_LIMIT) {
        break;
      }
      // Match en code o name del predio.
      if (normalize(`${p.code} ${p.name}`).includes(term)) {
        const z = zoneById.get(p.zoneExternalId);
        const a = areaById.get(p.areaExternalId);
        const parts: string[] = [];
        if (z) {
          parts.push(`Z${z.shortCode} · ${z.name}`);
        }
        if (a) {
          parts.push(`${a.code} · ${a.name}`);
        }
        parts.push(`${p.code} · ${p.name}`);
        out.push({
          level: 'property',
          zoneId: p.zoneExternalId,
          areaId: p.areaExternalId,
          propertyId: p.externalId,
          pathParts: parts,
        });
      }
    }
    return out;
  }, [search, zones, areas, properties, zoneById, areaById]);

  // Listas activas de cada columna del cascader (modo no-search).
  const visibleAreas = React.useMemo<CatalogArea[]>(() => {
    if (draft.zoneExternalId === null) {
      return [];
    }
    return areasByZoneId.get(draft.zoneExternalId) ?? [];
  }, [draft.zoneExternalId, areasByZoneId]);

  const visibleProperties = React.useMemo<CatalogProperty[]>(() => {
    if (draft.areaExternalId === null) {
      return [];
    }
    return propertiesByAreaId.get(draft.areaExternalId) ?? [];
  }, [draft.areaExternalId, propertiesByAreaId]);

  /* ---------------------------------------------------------------- */
  /*  Handlers                                                         */
  /* ---------------------------------------------------------------- */

  const handleOpenChange = (next: boolean): void => {
    if (next) {
      // Al abrir: inicializar draft con el valor actual y limpiar search.
      setDraft(value);
      setSearch('');
    }
    setOpen(next);
  };

  const commit = (next: LocationCascaderValue): void => {
    onChange(next);
    setOpen(false);
  };

  const handleClearAll = (e: React.MouseEvent): void => {
    e.stopPropagation();
    onChange(EMPTY_VALUE);
  };

  const handlePickZoneInDraft = (zoneId: string): void => {
    setDraft({ zoneExternalId: zoneId, areaExternalId: null, propertyExternalId: null });
  };

  const handlePickAreaInDraft = (areaId: string): void => {
    setDraft((prev) => ({
      zoneExternalId: prev.zoneExternalId,
      areaExternalId: areaId,
      propertyExternalId: null,
    }));
  };

  const handlePickPropertyInDraft = (propertyId: string): void => {
    // Click en predio confirma directo (atajo natural — el predio es el
    // nivel más específico y suele ser la intención del usuario).
    const prop = propertyById.get(propertyId);
    if (!prop) {
      return;
    }
    commit({
      zoneExternalId: prop.zoneExternalId,
      areaExternalId: prop.areaExternalId,
      propertyExternalId: propertyId,
    });
  };

  const handlePickSearchResult = (r: SearchResult): void => {
    commit({
      zoneExternalId: r.zoneId,
      areaExternalId: r.areaId,
      propertyExternalId: r.propertyId,
    });
  };

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            'w-full justify-between gap-2 font-normal',
            !hasValue && 'text-muted-foreground',
            className,
          )}
        >
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
            {hasValue ? (
              <span className="flex min-w-0 flex-1 items-center gap-1 truncate">
                {triggerLabel.map((part, i) => (
                  <React.Fragment key={`${String(i)}-${part}`}>
                    {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />}
                    <span
                      className={cn(
                        'truncate',
                        i === triggerLabel.length - 1 ? 'text-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {part}
                    </span>
                  </React.Fragment>
                ))}
              </span>
            ) : (
              <span className="truncate">{placeholder}</span>
            )}
          </span>
          {hasValue ? (
            <span
              role="button"
              tabIndex={0}
              aria-label="Limpiar ubicación"
              onClick={handleClearAll}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleClearAll(e as unknown as React.MouseEvent);
                }
              }}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 rotate-90 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-[640px] max-w-[calc(100vw-2rem)] p-0"
      >
        {/* Search header */}
        <div className="border-b p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
              }}
              placeholder="Buscar zona, área o predio…"
              className="h-9 pl-8"
              autoComplete="off"
            />
          </div>
        </div>

        {/* Body */}
        {search.trim().length > 0 ? (
          <SearchResultsList results={searchResults} onSelect={handlePickSearchResult} />
        ) : (
          <div className="grid grid-cols-3 divide-x">
            <CascaderColumn
              title="Zona"
              items={zones.map((z) => ({
                id: z.externalId,
                label: `Z${z.shortCode} · ${z.name}`,
                hasChildren: (areasByZoneId.get(z.externalId)?.length ?? 0) > 0,
              }))}
              selectedId={draft.zoneExternalId}
              onSelect={handlePickZoneInDraft}
              emptyMsg="Sin zonas"
            />
            <CascaderColumn
              title="Área"
              items={visibleAreas.map((a) => ({
                id: a.externalId,
                label: a.name,
                hint: a.code,
                hasChildren: (propertiesByAreaId.get(a.externalId)?.length ?? 0) > 0,
              }))}
              selectedId={draft.areaExternalId}
              onSelect={handlePickAreaInDraft}
              emptyMsg={draft.zoneExternalId === null ? 'Elige una zona' : 'Sin áreas en esta zona'}
            />
            <CascaderColumn
              title="Predio"
              items={visibleProperties.map((p) => ({
                id: p.externalId,
                label: p.name,
                hint: p.code,
                hasChildren: false,
              }))}
              selectedId={draft.propertyExternalId}
              onSelect={handlePickPropertyInDraft}
              emptyMsg={
                draft.areaExternalId === null ? 'Elige un área' : 'Sin predios en esta área'
              }
            />
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t bg-muted/30 p-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setDraft(EMPTY_VALUE);
              setSearch('');
            }}
            disabled={
              draft.zoneExternalId === null &&
              draft.areaExternalId === null &&
              draft.propertyExternalId === null
            }
          >
            Limpiar
          </Button>
          <div className="flex gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setOpen(false);
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                commit(draft);
              }}
            >
              Aplicar
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------------------------------------------ */
/*  Subcomponentes                                                     */
/* ------------------------------------------------------------------ */

interface CascaderColumnProps {
  title: string;
  items: readonly { id: string; label: string; hint?: string; hasChildren: boolean }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  emptyMsg: string;
}

function CascaderColumn({
  title,
  items,
  selectedId,
  onSelect,
  emptyMsg,
}: CascaderColumnProps): React.JSX.Element {
  return (
    <div className="flex max-h-72 flex-col">
      <div className="border-b bg-muted/30 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="px-3 py-3 text-xs text-muted-foreground">{emptyMsg}</div>
        ) : (
          <ul>
            {items.map((it) => (
              <li key={it.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(it.id);
                  }}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm transition-colors',
                    selectedId === it.id
                      ? 'bg-primary/10 font-medium text-foreground'
                      : 'hover:bg-accent',
                  )}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{it.label}</span>
                    {it.hint !== undefined && it.hint.length > 0 && (
                      <span className="truncate font-mono text-[10px] text-muted-foreground">
                        {it.hint}
                      </span>
                    )}
                  </span>
                  {it.hasChildren && (
                    <ChevronRight
                      className={cn(
                        'h-3.5 w-3.5 shrink-0',
                        selectedId === it.id ? 'text-primary' : 'text-muted-foreground/60',
                      )}
                    />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

interface SearchResultsListProps {
  results: readonly SearchResult[];
  onSelect: (r: SearchResult) => void;
}

function SearchResultsList({ results, onSelect }: SearchResultsListProps): React.JSX.Element {
  if (results.length === 0) {
    return (
      <div className="px-3 py-6 text-center text-sm text-muted-foreground">Sin resultados</div>
    );
  }
  return (
    <ul className="max-h-80 overflow-y-auto">
      {results.map((r) => {
        const key = `${r.level}-${r.zoneId}-${r.areaId ?? ''}-${r.propertyId ?? ''}`;
        return (
          <li key={key}>
            <button
              type="button"
              onClick={() => {
                onSelect(r);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
            >
              <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="flex flex-1 flex-wrap items-center gap-x-1 truncate">
                {r.pathParts.map((part, i) => (
                  <React.Fragment key={`${String(i)}-${part}`}>
                    {i > 0 && (
                      <ChevronRight className="inline h-3 w-3 shrink-0 text-muted-foreground" />
                    )}
                    <span
                      className={cn(
                        'truncate',
                        i === r.pathParts.length - 1
                          ? 'font-medium text-foreground'
                          : 'text-muted-foreground',
                      )}
                    >
                      {part}
                    </span>
                  </React.Fragment>
                ))}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
