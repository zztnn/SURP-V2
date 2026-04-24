# Map Patterns — SURP 2.0 Frontend

> Patrones para visualización geoespacial con Leaflet en el frontend de SURP.

---

## Setup base

### Instalar dependencias

```bash
pnpm add leaflet react-leaflet
pnpm add -D @types/leaflet
```

### Wrapper base con SSR deshabilitado

Todo componente que use Leaflet DEBE ser dinámico (`ssr: false`) ya que Leaflet usa `window` directamente:

```typescript
// src/components/maps/map-view.tsx
'use client';

import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { CHILE_CENTER, CHILE_ZOOM } from '@/lib/geo-constants';

interface MapViewProps {
  children?: React.ReactNode;
  center?: [number, number]; // [lat, lng]
  zoom?: number;
  className?: string;
  onBoundsChange?: (bounds: MapBounds) => void;
}

export function MapView({ children, center = CHILE_CENTER, zoom = CHILE_ZOOM, ... }: MapViewProps) {
  return (
    <MapContainer center={center} zoom={zoom} className={className}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; OpenStreetMap contributors'
      />
      {children}
    </MapContainer>
  );
}
```

```typescript
// src/lib/geo-constants.ts
export const CHILE_CENTER: [number, number] = [-35.675, -71.543]; // Centro aproximado de Chile
export const CHILE_ZOOM = 6;
export const ARAUCO_DEFAULT_CENTER: [number, number] = [-37.8, -72.7]; // Zona Arauco
export const ARAUCO_DEFAULT_ZOOM = 10;
```

### Dynamic import en las páginas

```typescript
// En cualquier page o componente server-side:
const IncidentMap = dynamic(
  () => import('@/components/maps/incident-map').then(m => m.IncidentMap),
  { ssr: false, loading: () => <MapSkeleton /> }
);
```

---

## Visualizar incidentes como marcadores

```typescript
// src/components/maps/incident-map.tsx
'use client';

import { Marker, Popup, CircleMarker } from 'react-leaflet';
import { MapView } from './map-view';

const TYPE_COLORS: Record<string, string> = {
  theft: '#ef4444',
  fire: '#f97316',
  illegal_logging: '#78350f',
  intrusion: '#eab308',
  occupation: '#8b5cf6',
  other: '#6b7280',
};

export function IncidentMap({ features, onMarkerClick }: IncidentMapProps) {
  return (
    <MapView center={ARAUCO_DEFAULT_CENTER} zoom={ARAUCO_DEFAULT_ZOOM}>
      {features.map((feature) => {
        const [lng, lat] = feature.geometry.coordinates; // GeoJSON: [lng, lat]
        const color = TYPE_COLORS[feature.properties.incidentType] ?? '#6b7280';

        return (
          <CircleMarker
            key={feature.properties.externalId}
            center={[lat, lng]}  // Leaflet: [lat, lng]
            radius={8}
            pathOptions={{ color, fillColor: color, fillOpacity: 0.7 }}
            eventHandlers={{ click: () => onMarkerClick?.(feature.properties.externalId) }}
          >
            <Popup>
              <div>
                <strong>{feature.properties.incidentTypeName}</strong>
                <br />
                {feature.properties.occurredAt}
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapView>
  );
}
```

---

## Visualizar polígonos de predios

```typescript
// src/components/maps/property-map.tsx
'use client';

import { GeoJSON } from 'react-leaflet';
import { MapView } from './map-view';

export function PropertyMap({ property }: { property: PropertyGeoDto }) {
  if (!property.boundary) return null;

  return (
    <MapView>
      <GeoJSON
        data={property.boundary}
        style={{
          color: '#22c55e',
          weight: 2,
          fillOpacity: 0.1,
        }}
      />
    </MapView>
  );
}
```

---

## Input de coordenadas con mini-mapa

Cuando el usuario registra un incidente, puede seleccionar la ubicación clickeando en el mapa:

```typescript
// src/components/forms/coordinate-input.tsx
'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { UseFormReturn } from 'react-hook-form';

const LocationPicker = dynamic(() => import('./location-picker'), { ssr: false });

interface CoordinateInputProps {
  form: UseFormReturn<any>;
  latName: string;
  lngName: string;
}

export function CoordinateInput({ form, latName, lngName }: CoordinateInputProps) {
  const [showMap, setShowMap] = useState(false);
  const lat = form.watch(latName);
  const lng = form.watch(lngName);

  return (
    <div>
      <div className="flex gap-2">
        <FormField name={latName} render={({ field }) => (
          <Input placeholder="Latitud (-90 a 90)" type="number" step="0.000001" {...field} />
        )} />
        <FormField name={lngName} render={({ field }) => (
          <Input placeholder="Longitud (-180 a 180)" type="number" step="0.000001" {...field} />
        )} />
        <Button type="button" variant="outline" onClick={() => setShowMap(!showMap)}>
          <MapPin className="h-4 w-4" />
        </Button>
      </div>

      {lat && lng && (
        <a
          href={`https://maps.google.com/?q=${lat},${lng}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-muted-foreground hover:underline"
        >
          Ver en Google Maps
        </a>
      )}

      {showMap && (
        <LocationPicker
          initialLat={lat}
          initialLng={lng}
          onSelect={(newLat, newLng) => {
            form.setValue(latName, newLat, { shouldDirty: true });
            form.setValue(lngName, newLng, { shouldDirty: true });
            setShowMap(false);
          }}
        />
      )}
    </div>
  );
}
```

---

## Filtrado por bounding box del viewport

Cuando el usuario mueve el mapa, refetchear los incidentes visibles:

```typescript
// Hook para capturar bounds del mapa
function MapBoundsTracker({ onBoundsChange }: { onBoundsChange: (bounds: MapBounds) => void }) {
  const map = useMapEvents({
    moveend: () => {
      const bounds = map.getBounds();
      onBoundsChange({
        swLat: bounds.getSouth(),
        swLng: bounds.getWest(),
        neLat: bounds.getNorth(),
        neLng: bounds.getEast(),
      });
    },
  });
  return null;
}

// En la página de incidentes
const [mapBounds, setMapBounds] = useState<MapBounds | null>(null);

const { data: mapFeatures } = useQuery({
  queryKey: queryKeys.incidents.map(mapBounds),
  queryFn: () => mapBounds
    ? apiClient.get<IncidentFeatureCollection>('/incidents/map', mapBounds)
    : Promise.resolve(null),
  enabled: viewMode === 'map' && mapBounds !== null,
  staleTime: 30_000,
});
```

---

## Reglas de mapas

- **SSR siempre deshabilitado** para componentes Leaflet — `dynamic(..., { ssr: false })`.
- **GeoJSON usa `[lng, lat]`**; Leaflet usa `[lat, lng]`. No mezclar.
- **Máx 2000 features** en una sola carga de mapa. Si hay más, filtrar por bounding box o por fecha.
- **Clustering** en el backend o con `leaflet.markercluster` cuando hay >500 marcadores en el viewport.
- **Iconos de incidente** por tipo (colores o SVG) para distinción visual rápida.
- **No SSR en producción** — los tiles de OSM son gratuitos para uso moderado. Para uso intensivo, usar tiles propios o Mapbox.
- **Coordenadas en display** al usuario: `Lat: -37.4617, Lon: -72.3552` (6 decimales).
- **Link a Google Maps** junto a toda coordenada mostrada al usuario.
