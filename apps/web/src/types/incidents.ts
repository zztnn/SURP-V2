export type IncidentState = 'draft' | 'active' | 'voided';

export type IncidentSemaforo = 'no_determinado' | 'verde' | 'amarillo' | 'rojo';

export interface IncidentLocation {
  lat: number;
  lng: number;
}

export interface IncidentListItem {
  externalId: string;
  correlativeCode: string | null;
  occurredAt: string;
  state: IncidentState;
  semaforo: IncidentSemaforo;
  incidentTypeCode: string;
  incidentTypeName: string;
  zoneShortCode: string;
  zoneName: string;
  areaName: string | null;
  propertyName: string | null;
  communeName: string | null;
  capturedByUserDisplayName: string;
  descriptionExcerpt: string;
  location: IncidentLocation;
}

export interface IncidentListResponse {
  items: readonly IncidentListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface IncidentListFilters {
  page?: number;
  pageSize?: number;
  zoneExternalId?: string;
  areaExternalId?: string;
  propertyExternalId?: string;
  semaforo?: IncidentSemaforo;
  occurredFrom?: string;
  occurredTo?: string;
  incidentTypeExternalIds?: readonly string[];
  q?: string;
  personSearch?: string;
  vehicleSearch?: string;
}

export interface IncidentDetail {
  externalId: string;
  correlativeCode: string | null;
  state: IncidentState;
  semaforo: IncidentSemaforo;
  occurredAt: string;
  detectedAt: string | null;
  reportedAt: string;
  submittedAt: string | null;
  description: string;
  location: IncidentLocation;
  locationSource: string;
  gpsAccuracyMeters: number | null;
  aggravatingFactors: readonly string[];
  timberFate: string | null;
  zone: { externalId: string; shortCode: string; name: string };
  area: { externalId: string; name: string } | null;
  property: { externalId: string; name: string } | null;
  commune: { externalId: string; name: string } | null;
  incidentType: { externalId: string; code: string; name: string };
  capturedByUser: { externalId: string; displayName: string };
  createdByOrganization: {
    externalId: string;
    name: string;
    type: 'principal' | 'security_provider' | 'api_consumer';
  };
}

export interface CatalogZone {
  externalId: string;
  code: string;
  shortCode: string;
  name: string;
  active: boolean;
}

export interface CatalogIncidentType {
  externalId: string;
  code: string;
  name: string;
  description: string | null;
  category: string;
  involvesTimber: boolean;
  involvesLandOccupation: boolean;
  involvesFire: boolean;
  orderIndex: number;
}

export interface CatalogArea {
  externalId: string;
  code: string;
  name: string;
  zoneExternalId: string;
  active: boolean;
}

export interface CatalogProperty {
  externalId: string;
  code: string;
  name: string;
  areaExternalId: string;
  zoneExternalId: string;
  active: boolean;
}
