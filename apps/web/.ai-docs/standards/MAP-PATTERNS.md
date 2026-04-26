# Map Patterns — SURP 2.0 Frontend

> Patrones para visualización geoespacial con **Google Maps JavaScript API**.
> Google Maps es el motor de mapas único de SURP 2.0 (ver ADR-F-007).

---

## Stack

- **Loader/wrapper:** `@vis.gl/react-google-maps` (librería oficial de Google Maps Platform para React). Soporta Server Components para la carcasa y Client Components para los mapas interactivos.
- **Clustering:** `@googlemaps/markerclusterer` (oficial).
- **Tipos:** `@types/google.maps` para autocompletado fuera del wrapper.

```bash
pnpm add @vis.gl/react-google-maps @googlemaps/markerclusterer
pnpm add -D @types/google.maps
```

No usar `@react-google-maps/api` (community, mantenimiento irregular) ni Leaflet.

---

## API key

**Una API key por entorno**, guardada como variable de entorno:

```
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIza...
```

La key es `NEXT_PUBLIC_*` porque la consume el navegador. Eso **no** es un riesgo si:

1. **Restricciones de referer** configuradas en Google Cloud Console:
   - Dev: `http://localhost:3000/*`
   - Staging: `https://staging.app.surp.cl/*`
   - Prod: `https://app.surp.cl/*`
2. **APIs restringidas** a lo que realmente usamos:
   - Maps JavaScript API
   - Places API (si usamos autocomplete de direcciones)
   - Geocoding API (si convertimos dirección ↔ coordenada)
   - **No** habilitar Directions, Distance Matrix, Roads, etc. hasta que haya caso de uso.
3. **Billing alert** en Google Cloud con límite duro mensual. Aunque la key se filtre, el daño es acotado.
4. **Rotación anual** + cada vez que un dev se va.

La key **de producción** no se compromete a git ni en `.env.example` — vive en Azure Key Vault y se inyecta en build de Container Apps.

---

## Setup del provider

```typescript
// apps/web/components/maps/maps-provider.tsx
'use client';

import { APIProvider } from '@vis.gl/react-google-maps';

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!;

export function MapsProvider({ children }: { children: React.ReactNode }) {
  return (
    <APIProvider
      apiKey={API_KEY}
      libraries={['places', 'marker']}
      language="es-CL"
      region="CL"
    >
      {children}
    </APIProvider>
  );
}
```

Montar **una vez** en el layout protegido (no en el layout raíz — las páginas públicas no necesitan cargar Google Maps). Carga lazy, script async.

```typescript
// apps/web/app/(protected)/layout.tsx
export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return <MapsProvider>{children}</MapsProvider>;
}
```

---

## Constantes geo

```typescript
// apps/web/lib/geo-constants.ts
export const CHILE_CENTER = { lat: -35.675, lng: -71.543 };
export const CHILE_ZOOM = 5;

export const ARAUCO_DEFAULT_CENTER = { lat: -37.8, lng: -72.7 };
export const ARAUCO_DEFAULT_ZOOM = 9;

// Map IDs configurados en Google Cloud Console para styling (Cloud-based styling).
// SURP usa un estilo "híbrido claro" por default; dark mode cambia el Map ID.
export const MAP_ID_LIGHT = process.env.NEXT_PUBLIC_GMAP_ID_LIGHT!;
export const MAP_ID_DARK = process.env.NEXT_PUBLIC_GMAP_ID_DARK!;
```

Los Map IDs son **requisito** para usar Advanced Markers y cloud-based styling. Configurar dos (claro/oscuro) en Google Cloud → Maps Management.

---

## Wrapper base

```typescript
// apps/web/components/maps/map-view.tsx
'use client';

import { Map } from '@vis.gl/react-google-maps';
import { useTheme } from 'next-themes';
import { CHILE_CENTER, CHILE_ZOOM, MAP_ID_LIGHT, MAP_ID_DARK } from '@/lib/geo-constants';

interface MapViewProps {
  children?: React.ReactNode;
  defaultCenter?: google.maps.LatLngLiteral;
  defaultZoom?: number;
  className?: string;
  onBoundsChange?: (bounds: MapBounds) => void;
}

export function MapView({
  children,
  defaultCenter = CHILE_CENTER,
  defaultZoom = CHILE_ZOOM,
  className,
  onBoundsChange,
}: MapViewProps) {
  const { resolvedTheme } = useTheme();
  const mapId = resolvedTheme === 'dark' ? MAP_ID_DARK : MAP_ID_LIGHT;

  return (
    <div className={className}>
      <Map
        mapId={mapId}
        defaultCenter={defaultCenter}
        defaultZoom={defaultZoom}
        gestureHandling="greedy"
        disableDefaultUI={false}
        onBoundsChanged={(ev) => {
          if (!onBoundsChange) return;
          const bounds = ev.map.getBounds();
          if (!bounds) return;
          const sw = bounds.getSouthWest();
          const ne = bounds.getNorthEast();
          onBoundsChange({ swLat: sw.lat(), swLng: sw.lng(), neLat: ne.lat(), neLng: ne.lng() });
        }}
        style={{ width: '100%', height: '100%' }}
      >
        {children}
      </Map>
    </div>
  );
}
```

**Nota importante:** `@vis.gl/react-google-maps` es compatible con Next.js App Router y no necesita `dynamic({ ssr: false })` — la carcasa renderiza en SSR pero el script de Google Maps se inyecta en cliente. A pesar de eso, marcar con `'use client'` por el uso de hooks (`useMap`, `useMapsLibrary`).

---

## Marcadores de incidentes (Advanced Markers)

```typescript
// apps/web/components/maps/incident-map.tsx
'use client';

import { AdvancedMarker, InfoWindow, Pin } from '@vis.gl/react-google-maps';
import { MapView } from './map-view';
import { ARAUCO_DEFAULT_CENTER, ARAUCO_DEFAULT_ZOOM } from '@/lib/geo-constants';

const TYPE_COLORS: Record<string, { background: string; border: string; glyphColor: string }> = {
  theft:           { background: '#ef4444', border: '#991b1b', glyphColor: '#fff' },
  fire:            { background: '#f97316', border: '#9a3412', glyphColor: '#fff' },
  illegal_logging: { background: '#78350f', border: '#451a03', glyphColor: '#fef3c7' },
  intrusion:       { background: '#eab308', border: '#854d0e', glyphColor: '#1c1917' },
  occupation:      { background: '#8b5cf6', border: '#5b21b6', glyphColor: '#fff' },
  other:           { background: '#6b7280', border: '#374151', glyphColor: '#fff' },
};

export function IncidentMap({ features, onMarkerClick }: IncidentMapProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <MapView defaultCenter={ARAUCO_DEFAULT_CENTER} defaultZoom={ARAUCO_DEFAULT_ZOOM}>
      {features.map((feature) => {
        // GeoJSON: [lng, lat]; Google Maps: { lat, lng }
        const [lng, lat] = feature.geometry.coordinates;
        const colors = TYPE_COLORS[feature.properties.incidentType] ?? TYPE_COLORS.other;

        return (
          <AdvancedMarker
            key={feature.properties.externalId}
            position={{ lat, lng }}
            onClick={() => {
              setOpenId(feature.properties.externalId);
              onMarkerClick?.(feature.properties.externalId);
            }}
          >
            <Pin {...colors} />

            {openId === feature.properties.externalId && (
              <InfoWindow position={{ lat, lng }} onCloseClick={() => setOpenId(null)}>
                <div className="text-sm">
                  <strong>{feature.properties.incidentTypeName}</strong>
                  <br />
                  <span className="text-muted-foreground">{feature.properties.occurredAt}</span>
                </div>
              </InfoWindow>
            )}
          </AdvancedMarker>
        );
      })}
    </MapView>
  );
}
```

**Usar `AdvancedMarker`, no `Marker`**: `Marker` está deprecado desde 2024. Advanced Markers son el reemplazo oficial y requieren `mapId`.

---

## Clustering con `@googlemaps/markerclusterer`

Cuando hay más de ~200 marcadores visibles:

```typescript
// apps/web/components/maps/incident-cluster.tsx
'use client';

import { useMap } from '@vis.gl/react-google-maps';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import { useEffect, useRef } from 'react';

export function IncidentCluster({ features }: { features: IncidentFeature[] }) {
  const map = useMap();
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);

  useEffect(() => {
    if (!map) return;

    // Crear markers imperativos (sin React) — clusterer los gestiona
    markersRef.current = features.map((feature) => {
      const [lng, lat] = feature.geometry.coordinates;
      const marker = new google.maps.marker.AdvancedMarkerElement({
        position: { lat, lng },
      });
      marker.addListener('click', () => onMarkerClick(feature.properties.externalId));
      return marker;
    });

    clustererRef.current = new MarkerClusterer({ map, markers: markersRef.current });

    return () => {
      clustererRef.current?.clearMarkers();
    };
  }, [map, features]);

  return null;
}
```

**Umbral de cambio de estrategia:**

- `< 200` features: `<AdvancedMarker>` declarativos.
- `>= 200` features: clusterer imperativo.
- `> 2.000` features visibles: el backend debe reducir (filtrar por bounds + heatmap agregado).

---

## Polígonos de predios y áreas (Data Layer)

El backend retorna GeoJSON (`FeatureCollection` de `MultiPolygon`). Renderizar con el Data Layer de Google Maps (soporta GeoJSON nativo):

```typescript
// apps/web/components/maps/property-layer.tsx
'use client';

import { useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { useEffect } from 'react';

export function PropertyLayer({
  featureCollection,
}: {
  featureCollection: GeoJSON.FeatureCollection;
}) {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');

  useEffect(() => {
    if (!map || !mapsLib || !featureCollection) return;

    map.data.addGeoJson(featureCollection);
    map.data.setStyle((feature) => ({
      fillColor: '#22c55e',
      fillOpacity: 0.15,
      strokeColor: '#15803d',
      strokeWeight: 2,
    }));

    return () => {
      map.data.forEach((f) => map.data.remove(f));
    };
  }, [map, mapsLib, featureCollection]);

  return null;
}
```

Para polígonos con más de 500 vértices por predio, el backend envía `geometry_simplified` (ST_Simplify tolerance 0.0005 para predios, 0.005 para comunas, 0.01 para regiones; ver `apps/api/.ai-docs/standards/GEO-PATTERNS.md`).

---

## Input de coordenadas con mini-mapa

```typescript
// apps/web/components/forms/coordinate-input.tsx
'use client';

import { Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import { useState } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { ARAUCO_DEFAULT_CENTER, MAP_ID_LIGHT } from '@/lib/geo-constants';

interface CoordinateInputProps {
  form: UseFormReturn<any>;
  latName: string;
  lngName: string;
}

export function CoordinateInput({ form, latName, lngName }: CoordinateInputProps) {
  const [showMap, setShowMap] = useState(false);
  const lat = form.watch(latName);
  const lng = form.watch(lngName);
  const hasCoords = typeof lat === 'number' && typeof lng === 'number';

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <FormField name={latName} render={({ field }) => (
          <Input placeholder="Latitud (-90 a 90)" type="number" step="0.000001" {...field} />
        )} />
        <FormField name={lngName} render={({ field }) => (
          <Input placeholder="Longitud (-180 a 180)" type="number" step="0.000001" {...field} />
        )} />
        <Button type="button" variant="outline" onClick={() => setShowMap((s) => !s)}>
          <MapPin className="h-4 w-4" />
        </Button>
      </div>

      {hasCoords && (
        <a
          href={`https://www.google.com/maps?q=${lat},${lng}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-muted-foreground hover:underline"
        >
          Abrir en Google Maps
        </a>
      )}

      {showMap && (
        <div className="h-[320px] rounded-md overflow-hidden border">
          <Map
            mapId={MAP_ID_LIGHT}
            defaultCenter={hasCoords ? { lat, lng } : ARAUCO_DEFAULT_CENTER}
            defaultZoom={hasCoords ? 14 : 9}
            onClick={(ev) => {
              const clicked = ev.detail.latLng;
              if (!clicked) return;
              form.setValue(latName, clicked.lat, { shouldDirty: true });
              form.setValue(lngName, clicked.lng, { shouldDirty: true });
            }}
            style={{ width: '100%', height: '100%' }}
          >
            {hasCoords && <AdvancedMarker position={{ lat, lng }} />}
          </Map>
        </div>
      )}
    </div>
  );
}
```

---

## Filtrado por bounds del viewport

```typescript
// apps/web/app/(protected)/incidents/page.tsx (fragmento)
const [mapBounds, setMapBounds] = useState<MapBounds | null>(null);

const { data: mapFeatures } = useQuery({
  queryKey: queryKeys.incidents.map(mapBounds),
  queryFn: () =>
    mapBounds
      ? apiClient.get<IncidentFeatureCollection>('/incidents/map', mapBounds)
      : Promise.resolve(null),
  enabled: viewMode === 'map' && mapBounds !== null,
  staleTime: 30_000,
});
```

El `onBoundsChange` del `<MapView>` alimenta el state; TanStack Query dedupea con debounce por `staleTime`.

---

## Places autocomplete (direcciones)

Para formularios que piden una dirección (p.ej. domicilio de imputado en `persons`):

```typescript
// apps/web/components/forms/address-autocomplete.tsx
'use client';

import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { useEffect, useRef } from 'react';

export function AddressAutocomplete({ onSelect }: { onSelect: (place: google.maps.places.PlaceResult) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const placesLib = useMapsLibrary('places');

  useEffect(() => {
    if (!placesLib || !inputRef.current) return;

    const autocomplete = new placesLib.Autocomplete(inputRef.current, {
      componentRestrictions: { country: 'cl' },       // solo Chile
      fields: ['formatted_address', 'geometry', 'address_components'],
      types: ['address'],
    });

    autocomplete.addListener('place_changed', () => {
      onSelect(autocomplete.getPlace());
    });
  }, [placesLib, onSelect]);

  return <Input ref={inputRef} placeholder="Buscar dirección en Chile..." />;
}
```

---

## Reglas

1. **Google Maps es el único motor**. Sin Leaflet, sin MapLibre, sin OpenLayers.
2. **API key restringida por referer + APIs específicas**. Billing alert obligatorio.
3. **Map ID configurado en Cloud Console** — es requisito de Advanced Markers.
4. **`AdvancedMarker`, no `Marker`** (Marker está deprecado).
5. **GeoJSON usa `[lng, lat]`**; Google Maps usa `{ lat, lng }`. Convertir en el borde.
6. **Máx 2.000 features** por vista de mapa; por encima, clustering obligatorio o reducir en backend.
7. **Coordenadas en display al usuario**: `Lat: -37.461700, Lon: -72.355200` (6 decimales ≈ 11 cm).
8. **Link "Abrir en Google Maps"** (`https://www.google.com/maps?q=${lat},${lng}`) junto a toda coordenada.
9. **Provider único** montado en el layout protegido — no instanciar `APIProvider` por página.
10. **Dark mode** cambia `mapId` (Light/Dark configurados aparte en Cloud Console).
11. **No cargar Places/Geocoding** hasta que realmente se use la pantalla que los necesita (lazy).
12. **Testear con Google Maps Reporting**: revisar consumo semanal en Cloud Console.
