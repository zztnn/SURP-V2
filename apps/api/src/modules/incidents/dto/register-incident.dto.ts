import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import type { LocationSource, Semaforo, TimberFate } from '../domain/incident';

const LOCATION_SOURCES: readonly LocationSource[] = [
  'gps',
  'property_centroid',
  'area_centroid',
  'zone_centroid',
  'manual',
];
const SEMAFOROS: readonly Semaforo[] = ['no_determinado', 'verde', 'amarillo', 'rojo'];
const TIMBER_FATES: readonly TimberFate[] = [
  'extracted',
  'felled_only',
  'partially_extracted',
  'unknown',
];

class IncidentLocationDto {
  @IsLatitude({ message: 'lat debe ser una latitud válida' })
  lat!: number;

  @IsLongitude({ message: 'lng debe ser una longitud válida' })
  lng!: number;
}

/**
 * Body de `POST /incidents`. Solo `zoneExternalId` es obligatorio en términos
 * de jerarquía territorial — `area`/`property`/`commune` se auto-resuelven
 * por geo en el use case si no se proveen explícitos (decisión 1A + fallback,
 * F12.2).
 */
export class RegisterIncidentDto {
  @IsUUID('4', { message: 'zoneExternalId debe ser UUID' })
  zoneExternalId!: string;

  @IsOptional()
  @IsUUID('4', { message: 'areaExternalId debe ser UUID' })
  areaExternalId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'propertyExternalId debe ser UUID' })
  propertyExternalId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'communeExternalId debe ser UUID' })
  communeExternalId?: string;

  @IsUUID('4', { message: 'incidentTypeExternalId debe ser UUID' })
  incidentTypeExternalId!: string;

  @IsOptional()
  @IsUUID('4', { message: 'operationTypeExternalId debe ser UUID' })
  operationTypeExternalId?: string;

  @IsDateString({}, { message: 'occurredAt debe ser ISO 8601' })
  occurredAt!: string;

  @IsOptional()
  @IsDateString({}, { message: 'detectedAt debe ser ISO 8601' })
  detectedAt?: string;

  @ValidateNested()
  @Type(() => IncidentLocationDto)
  location!: IncidentLocationDto;

  @IsIn(LOCATION_SOURCES, {
    message: `locationSource debe ser uno de: ${LOCATION_SOURCES.join(', ')}`,
  })
  locationSource!: LocationSource;

  @IsOptional()
  @IsNumber({}, { message: 'gpsAccuracyMeters debe ser numérico' })
  @Min(0, { message: 'gpsAccuracyMeters no puede ser negativo' })
  @Max(99_999, { message: 'gpsAccuracyMeters demasiado grande' })
  gpsAccuracyMeters?: number;

  @IsString({ message: 'description debe ser texto' })
  @MinLength(10, { message: 'description debe tener al menos 10 caracteres' })
  description!: string;

  @IsOptional()
  @IsIn(SEMAFOROS, { message: `semaforo debe ser uno de: ${SEMAFOROS.join(', ')}` })
  semaforo?: Semaforo;

  @IsOptional()
  @IsIn(TIMBER_FATES, { message: `timberFate debe ser uno de: ${TIMBER_FATES.join(', ')}` })
  timberFate?: TimberFate;

  @IsOptional()
  @IsArray({ message: 'aggravatingFactors debe ser un array' })
  @ArrayMaxSize(20, { message: 'aggravatingFactors no puede tener más de 20 ítems' })
  @IsString({ each: true, message: 'cada aggravatingFactor debe ser texto' })
  aggravatingFactors?: string[];
}
