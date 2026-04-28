import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

const VALID_SEMAFOROS = ['no_determinado', 'verde', 'amarillo', 'rojo'] as const;
type Semaforo = (typeof VALID_SEMAFOROS)[number];

const VALID_FORMATS = ['xlsx'] as const;
type ExportFormat = (typeof VALID_FORMATS)[number];

const MAX_INCIDENT_TYPE_IDS = 50;

/**
 * Snapshot de los filtros aplicados al listado al momento de pedir el
 * export. Se persiste en `export_jobs.filters` (JSONB) y el processor
 * los aplica a la query de fetch. La auditoría legal (Ley 21.719) lo
 * usa para saber qué subset de datos personales fue exportado.
 *
 * V1: filtros simples. Búsquedas libres (free-text / persona / vehículo)
 * NO se aplican (el processor las ignora silenciosamente — V2).
 */
export class CreateIncidentExportDto {
  @IsIn(VALID_FORMATS, { message: `format debe ser uno de: ${VALID_FORMATS.join(', ')}` })
  format!: ExportFormat;

  @IsOptional()
  @IsString()
  @Length(36, 36, { message: 'zoneExternalId debe ser un UUID' })
  zoneExternalId?: string;

  @IsOptional()
  @IsString()
  @Length(36, 36, { message: 'areaExternalId debe ser un UUID' })
  areaExternalId?: string;

  @IsOptional()
  @IsString()
  @Length(36, 36, { message: 'propertyExternalId debe ser un UUID' })
  propertyExternalId?: string;

  @IsOptional()
  @IsIn(VALID_SEMAFOROS, { message: `semaforo debe ser uno de: ${VALID_SEMAFOROS.join(', ')}` })
  semaforo?: Semaforo;

  @IsOptional()
  @IsDateString()
  occurredFrom?: string;

  @IsOptional()
  @IsDateString()
  occurredTo?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_INCIDENT_TYPE_IDS, {
    message: `Máximo ${MAX_INCIDENT_TYPE_IDS.toString()} tipos de incidente`,
  })
  @IsString({ each: true })
  incidentTypeExternalIds?: string[];
}
