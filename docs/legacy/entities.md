# Entidades EF del SURP Legacy — Modelo de Dominio

> Complemento funcional de `schema.md`. Mientras schema.md describe la tabla en SQL Server, este documento presenta el **modelo de dominio tal como lo ve el código C#**: relaciones navegacionales, anotaciones DataAnnotations, enums y guía para reconstruir DTOs y validators en NestJS.
>
> Fuente: `SACL.EF/Entidades/*.cs` (57 entidades) y `SACL.EF/Enums/*.cs` (35+ enums).

---

## Resumen por dominio

Las 57 entidades se organizan en **9 dominios funcionales**:

1. **Geografía** (5) — Region, Provincia, Comuna, Zona, Area
2. **Predios** (1) — Predio
3. **Incidentes** (9) — Incidente, IncidentesExternos, IncidentePredio, IncidenteBienAfectado, IncidenteExternoBienAfectado, IncidenteSeguimiento, Foto, FotosIncidenteExterno, Incendio
4. **Denuncias** (9) — Denuncia, DenunciaImputado, DenunciaTestigo, DenunciaVehiculo, DenunciaVehiculoNI, GuiaDespacho, Destino, MedioIncautado, NoIncautado
5. **Causas judiciales** (8) — Causa, CausaQuerella, Querella, Hito, DocumentoCausa, Evidencia, Resolucion, ResolucionPersona
6. **Actores** (8) — Persona, Fiscal, Tribunal, UnidadPolicial, Usuario, Empresa, EmpresasExternas, AbogadoCausa
7. **Vehículos** (4) — Vehiculo, VehiculoNI, VehiculoUsuarios, SeguimientoVehiculo
8. **Seguimientos** (1) — Seguimiento
9. **Sistemas auxiliares** (12) — BienAfectado, Permiso, AuditoriaApi, AuditoriaConsulta, AuditoriaPersonaApi, AuditoriaUsuario, SurpMaat, SurpMaatDetalle, SurpMaatDetalleIncidente, SurpMaatDetalleVinculo, ArchivoPersona

---

## Modelo de relaciones (árbol textual)

```
GEOGRAFÍA
├─ Region
│  └─ Provincia
│     └─ Comuna
│        ├─ Predio (ComunaId)
│        ├─ UnidadPolicial (ComunaId)
│        └─ IncidentesExternos (ComunaId)

PREDIOS (jerarquía interna Arauco)
├─ Zona
│  └─ Area
│     └─ Predio
│        ├─ IncidentePredio
│        ├─ Incendio (PredioId)
│        └─ Seguimiento (PredioId)

INCIDENTES (core)
├─ Incidente (IncidenteId)
│  ├─ IncidentePredio (FK Predio) — m:n
│  ├─ IncidenteBienAfectado (FK BienAfectado) — m:n
│  ├─ IncidenteSeguimiento (← Seguimiento) — m:n
│  ├─ Foto (← FK IncidenteId)
│  └─ Denuncia (← FK IncidenteId)

INCIDENTES EXTERNOS
├─ IncidentesExternos (IncidenteExternoId)
│  ├─ EmpresaExterna (FK EmpresaExternaId)
│  ├─ Comuna (FK ComunaId)
│  ├─ IncidenteExternoBienAfectado — m:n
│  ├─ FotosIncidenteExterno (←)
│  └─ Denuncia (← FK IncidenteExternoId) [OR con Incidente]

DENUNCIAS
├─ Denuncia (DenunciaId)
│  ├─ Incidente (FK IncidenteId, nullable)
│  ├─ IncidentesExternos (FK IncidenteExternoId, nullable)
│  ├─ UnidadPolicial (FK UnidadPolicialId)
│  ├─ Fiscalia (FK FiscaliaId)
│  ├─ DenunciaImputado (← FK DenunciaId, ← Persona)
│  ├─ DenunciaTestigo (← FK DenunciaId, ← Persona)
│  ├─ DenunciaVehiculo (← FK DenunciaId, ← Vehiculo, ← NoIncautado)
│  ├─ DenunciaVehiculoNI (← FK DenunciaId, ← VehiculoNI, ← NoIncautado)
│  ├─ MedioIncautado (← FK DenunciaId)
│  ├─ GuiaDespacho (← FK DenunciaId, ← Persona Origen, ← Persona Destino)
│  ├─ Destino (← FK DenunciaId)
│  └─ Causa (← FK DenunciaId)

CAUSAS JUDICIALES
├─ Causa (CausaId)
│  ├─ Denuncia (FK DenunciaId)
│  ├─ Fiscal (FK FiscalId)
│  ├─ Fiscalia (FK FiscaliaId)
│  ├─ Tribunal (FK TribunalId)
│  ├─ UnidadPolicial (FK UnidadPolicialId)
│  ├─ AbogadoCausa — m:n con Usuario (como abogado)
│  │  └─ Responsable (bool)
│  ├─ Hito (FK CausaId) → TipoHito + NombreHito (enum)
│  ├─ DocumentoCausa (FK CausaId) → TipoAdjunto (enum)
│  ├─ Evidencia (FK CausaId) → TiposEvidencia (enum)
│  ├─ Resolucion (FK CausaId)
│  │  ├─ Persona (FK PersonaId) [resuelto para]
│  │  ├─ Resoluciones (enum)
│  │  ├─ AcuerdoReparaciones (enum)
│  │  └─ Beneficios (enum)
│  ├─ ResolucionPersona (FK CausaId) — resolución por persona
│  ├─ CausaQuerella (→ FK QuerellaId)
│  └─ Incendio (FK CausaId) [vinculación judicial desde incendio]

QUERELLA
├─ Querella (QuerellaId)
│  ├─ Abogado (FK AbogadoId → Usuario)
│  ├─ TipoQuerella (enum)
│  └─ CausaQuerella (→ FK CausaId)

PERSONAS Y VEHÍCULOS
├─ Persona (PersonaId)
│  ├─ Rut (validado)
│  ├─ Nombres, ApellidoPaterno/Materno
│  ├─ Vinculacion (enum) → RutVinculacion [vínculo con otra persona]
│  ├─ Bloqueado (bool) [para búsquedas API]
│  ├─ DenunciaImputado (← FK PersonaId)
│  ├─ DenunciaTestigo (← FK PersonaId)
│  ├─ Vehiculo (→ ICollection) [dueño]
│  ├─ VehiculoUsuarios (→ múltiples propietarios con FechaInscripcion)
│  ├─ Resolucion (← FK PersonaId)
│  ├─ ResolucionPersona (← FK PersonaId)
│  ├─ GuiaDespacho.Origen/Destino (← FK PersonaId)
│  └─ ArchivoPersona (← FK PersonaId)

├─ Vehiculo (VehiculoId)
│  ├─ Patente (única, validada por regex)
│  ├─ Persona (FK PersonaId) [dueño principal, opcional]
│  ├─ TipoDeVehiculo (enum)
│  ├─ Chasis (enum, nullable)
│  ├─ Bloqueado (bool=true defecto) [para incautación / consulta API]
│  ├─ DenunciaVehiculo (← FK VehiculoId)
│  ├─ SeguimientoVehiculo (← FK VehiculoId)
│  └─ VehiculoUsuarios (← FK VehiculoId)

├─ VehiculoNI (VehiculoNIId) [no identificado]
│  ├─ Patente (opcional, incompleta)
│  ├─ TipoDeVehiculo (nullable enum)
│  ├─ Chasis (nullable enum)
│  └─ DenunciaVehiculoNI (← FK VehiculoNIId)

├─ VehiculoUsuarios (composita)
│  ├─ Vehiculo (FK VehiculoId)
│  ├─ Persona (FK PersonaId)
│  └─ FechaInscripcion [parte de PK]

SEGUIMIENTOS (Patrullajes)
├─ Seguimiento (SeguimientoId)
│  ├─ Predio (FK PredioId)
│  ├─ Especie (enum) [madera objetivo]
│  ├─ TipoSeguimiento (enum: Terrestre, Aeronave, Dron)
│  ├─ SeguimientoVehiculo (FK SeguimientoId) [vehículos vistos]
│  │  ├─ Vehiculo (FK VehiculoId, nullable)
│  │  ├─ Chasis (enum)
│  │  ├─ TipoDeVehiculo (enum)
│  │  └─ IdentificacionVehiculo (enum: Predio, Ruta)
│  └─ IncidenteSeguimiento (← FK SeguimientoId)
│     └─ Incidente (FK IncidenteId) [vinculación retrospectiva]

INCENDIOS
├─ Incendio (IncendioId)
│  ├─ ClaveExternaIncendio [ID en BD externa CONAF]
│  ├─ Causa (FK CausaId) [vinculación judicial]
│  ├─ Predio (FK PredioId)
│  ├─ Datos temporales (Fecha, Semana, Mes, Hora, Hora2)
│  ├─ Datos de afectación (Pira, Euca, Otras en ha)
│  ├─ Geolocación (Latitud, Longitud)
│  ├─ Cronología (Arribo, FechaControl, Despacho, Control, Extincion)
│  └─ Datos procesales (Detector, Despachador, Estado, Temporada, etc.)

USUARIOS Y CONTROL DE ACCESO
├─ Usuario (UsuarioId)
│  ├─ Empresa (FK EmpresaId)
│  ├─ Rut, Nombres, Apellidos (validados)
│  ├─ CorreoElectronico (validado)
│  ├─ Perfil (enum: Administrador, Abogado, UnidadPatrimonial, etc.)
│  ├─ Password (hash en BD con clave GUID fija — PITFALL-B-018)
│  ├─ Activo (bool) [activación de cuenta]
│  ├─ Estadisticas (bool) [permiso para reportes]
│  └─ Permisos (NotMapped IList<Permiso>) [carga dinámica desde controller]

├─ Empresa (EmpresaId: string)
│  ├─ RazonSocial
│  └─ Usuario (← FK EmpresaId)

├─ Permiso (Perfil + Controlador) — CÓDIGO MUERTO, tabla no consultada
│  ├─ Perfil (enum)
│  ├─ Controlador (enum)
│  └─ Acceso, Create, Edit, Details, Delete (bool)

AUDITORÍA (append-only)
├─ AuditoriaUsuario — login/logout
├─ AuditoriaApi — consultas de vehículos por patente (API externa)
├─ AuditoriaConsulta — log general de consultas
└─ AuditoriaPersonaApi — consultas de personas por RUT (API externa)

MAAT (antecedentes externos)
├─ SurpMaat (MaatId)
│  ├─ Usuario (FK AddUserId) [solicitante]
│  ├─ Solicitante, Negocio (strings)
│  ├─ FechaSolicitud
│  └─ SurpMaatDetalle (← FK MaatId)

├─ SurpMaatDetalle (MaatDetalleId, MaatId)
│  ├─ Resultado, ResultadoAntiguo (bool)
│  ├─ RazonCambioResultado
│  ├─ SurpMaatDetalleVinculo (← m:n por RutPatente)
│  └─ SurpMaatDetalleIncidente (← m:n por Codigo de Incidente)

MANTENEDORES / CATÁLOGOS
├─ BienAfectado (catálogo de tipos)
├─ NoIncautado (razones)
├─ Fiscal, Fiscalia, Tribunal (justicia)
├─ UnidadPolicial (con institución + comuna)
└─ EmpresasExternas (terceros para incidentes externos)
```

---

## Matriz de auditoría

Columnas `AddUserId/AddDate/ChgUserId/ChgDate/Activo` presentes en cada entidad:

| Entidad                                                                     | AddUser | ChgUser | Activo | Notas                                                 |
| --------------------------------------------------------------------------- | ------- | ------- | ------ | ----------------------------------------------------- |
| Usuario, Empresa, Persona, Vehiculo, VehiculoNI                             | ✓       | ✓       | ✓      | Completo                                              |
| Incidente, IncidentesExternos, Denuncia, Causa                              | ✓       | ✓       | ✓      | Completo                                              |
| Hito, Resolucion, ResolucionPersona, Querella                               | ✓       | ✓       | ✓      | Completo                                              |
| AbogadoCausa, DenunciaImputado, DenunciaTestigo, DenunciaVehiculo           | ✓       | ✓       | ✓      | Completo (m:n)                                        |
| Region, Provincia, Comuna, Zona, Area, Predio                               | ✓       | ✓       | ✓      | Completo                                              |
| BienAfectado, Fiscal, Fiscalia, Tribunal, UnidadPolicial                    | ✓       | ✓       | ✓      | Completo                                              |
| Foto, FotosIncidenteExterno, Evidencia, DocumentoCausa                      | ✓       | ✓       | ✓      | Completo                                              |
| MedioIncautado, NoIncautado, GuiaDespacho, Destino                          | ✓       | ✓       | ✓      | Completo                                              |
| Seguimiento, SeguimientoVehiculo, IncidenteSeguimiento                      | ✓       | ✓       | ✓      | Completo                                              |
| ArchivoPersona                                                              | ✓       | ✗       | ✓      | **Sin ChgUser/ChgDate** (append-only)                 |
| AuditoriaUsuario, AuditoriaApi, AuditoriaConsulta, AuditoriaPersonaApi      | parcial | ✗       | ✗      | **Solo AddDate + UsuarioId** — append-only por diseño |
| SurpMaat, SurpMaatDetalle, SurpMaatDetalleVinculo, SurpMaatDetalleIncidente | ✗       | ✗       | ✗      | **Sin auditoría alguna** — problema                   |
| Permiso                                                                     | ✓       | ✓       | ✓      | Completo pero tabla no consultada (código muerto)     |

---

## Validaciones DataAnnotations presentes en el legacy

Resumen transversal de qué validaciones existen y dónde. Esto guía la reconstrucción de DTOs en SURP 2.0 con `class-validator`:

| DataAnnotation legacy           | Apariciones                                                  | class-validator equivalente (NestJS)   |
| ------------------------------- | ------------------------------------------------------------ | -------------------------------------- |
| `[Required]`                    | 85+ propiedades                                              | `@IsNotEmpty()` + `@IsDefined()`       |
| `[StringLength(n)]`             | Usuario, Persona, Empresa, catálogos                         | `@Length(0, n)` + `@MaxLength(n)`      |
| `[MinLength(n)]`                | Password, Nombres                                            | `@MinLength(n)`                        |
| `[EmailAddress]`                | Usuario.CorreoElectronico, Fiscal.CorreoElectronico, Persona | `@IsEmail()`                           |
| `[RegularExpression(...)]`      | Rut, Patente, Telefono, DestinoLugar                         | `@Matches(regex)`                      |
| `[DataType(DataType.Password)]` | Usuario.Password                                             | (manejar en DTO de auth, hash antes)   |
| `[DataType(DataType.Date)]`     | Fechas                                                       | `@IsDate()` o `@IsISO8601()`           |
| `[Display(Name="...")]`         | Múltiples                                                    | Mover a labels en frontend (Next.js)   |
| `[NotMapped]`                   | Campos calculados (ZonaId, AreaId en Incidente)              | No persistidos en BD — DTOs de cascada |

### Regex de RUT del legacy

```csharp
[RegularExpression(@"\d{1,8}-[K|k|0-9]")]
```

En SURP 2.0: validación módulo 11 (decorator `@IsRut()` custom) además del regex.

### Regex de patente del legacy

4 formatos aceptados:

- `[A-Z]{2}[0-9]{4}` — "AB1234" (autos viejos).
- `[BCDFGHJKLPRSTVWXYZ]{4}[0-9]{2}` — "BCDF12" (nueva).
- `[A-Z]{2}\d{3}[A-Z]{1}` y `[A-Z]{3}\d{3}` — variantes.

---

## Problemas detectados (resumen funcional)

### 1. Relaciones `virtual` inconsistentes

Algunas navegaciones no marcadas como `virtual` (impide lazy loading):

- `AuditoriaApi.Usuario`, `AuditoriaPersonaApi.Usuario`.
- `DenunciaVehiculoNI.Denuncia`, `VehiculoNI`, `NoIncautado`.
- `VehiculoNI.AddUser`, `ChgUser`.
- `ResolucionPersona.AddUser`, `ChgUser`, `Causa`, `Persona`.

### 2. Enums con duplicados

- `Especie.PinoOregon = 801` + `Especie.NoAplica = 801` — mismo entero.
- `NombreHito` tiene valores repetidos en 171, 405, 471.
- `EstadoIncidente` vs `EstadoDelIncidente` — dos enums parecidos.

### 3. Auditoría inconsistente

- `AuditoriaUsuario`, `AuditoriaApi`, etc. — sin `Activo/ChgUser/ChgDate` (apropiado para logs, pero inconsistente con el patrón de dominio).
- `ArchivoPersona` — sin `ChgUser/ChgDate`.
- MAAT completo — sin auditoría (grave, ver PITFALL a crear).

### 4. Campos `[Required]` inconsistentes con nullability

- `FiscaliaId int?` pero nav `public Fiscalia Fiscalia` sin nullable.
- Varios campos `[Required]` en propiedad nullable.

### 5. `NotMapped` excesivos con lógica de dominio

- `Incidente`: `ExistePorton`, `ZonaId`, `AreaId`, `PredioId`, `wwwrootpath`, `codigo`, `mapa` — mezclados con lógica de dominio.
- `IncidentesExternos`: idem + `RegionId`, `ProvinciaId`.

Sugieren **formulario con cascadas** no persistidas. En SURP 2.0 estas cascadas deben vivir en el DTO del frontend, no en la entidad.

### 6. `AutoCargante` inconsistente entre entidades

Ya mencionado en schema: `bool` en `Vehiculo`/`VehiculoNI`, `int` en `SeguimientoVehiculo`.

### 7. Enums sin archivo localizado

- `AcuerdoReparaciones` — referenciado en `Resolucion.AcuerdoReparaciones` pero archivo no encontrado en algunas builds.
- `EstadoIncidente`, `EstadoDelIncidente` — posibles duplicados.

### 8. Encoding legacy en Incendio

`Incendio.CombustibleInicial`, `CombustibleFinal`, `ComandanteIncidente` tienen setters que sanitizan caracteres malformados (restos de encoding incorrecto al migrar desde sistema anterior).

### 9. Falta de cascada explícita en FKs

`Usuario` tiene múltiples `AddUser/ChgUser` en N entidades. Sin `[ForeignKey]` explícito en todos los casos — EF Core los infiere por convención.

### 10. Clase huérfana en DbContext

```csharp
public partial class Personas
{
    public virtual ICollection<Persona> Personitas { get; set; }
}
```

Resto de refactor incompleto.

---

## Guía para reconstrucción en SURP 2.0 (NestJS)

### DTOs

- Replicar cada `[Required]` como `@IsNotEmpty()` en el DTO de Create/Update.
- Combinar `[StringLength] + [RegularExpression]` en `@Length() + @Matches()`.
- Enums → **tabla de catálogo en BD** (editables por admin), no enum en código. Preservar `migrated_from_legacy_value` para identificadores legacy (gaps y duplicados).
- `NotMapped` con cascadas → DTOs específicos en frontend (`CreateIncidentDto` con `zoneId/areaId/propertyId`); el backend recibe solo `propertyId`.

### Auditoría

- Interceptor NestJS inyecta `createdById/createdAt/updatedById/updatedAt` automáticamente (ADR-B-009).
- No se replica el patrón `Activo` universal — soft delete solo donde tiene valor de negocio (`deletedAt TIMESTAMPTZ`).

### Lazy loading

- Kysely no resuelve relaciones automáticamente — cada JOIN es explícito en el query builder. Evita los problemas N+1 del legacy (PITFALL B-008 del schema — `SELECT *` con 20+ includes): el desarrollador ve cada JOIN en el código y decide el shape del resultado.

### Relaciones bidireccionales

- Mantener solo las necesarias. Un `Usuario` legacy tiene 20+ `ICollection` (`AddBy*`, `ChgBy*` en cada entidad) — en SURP 2.0 esas se acceden por query explícita, no por navegación.

### Geo

- Latitud/Longitud como columnas separadas → `GEOMETRY(POINT, 4326)` PostGIS con índice GIST.
- Usar helpers de `src/database/geo.ts` para `ST_MakePoint`, `ST_DWithin`, etc.

### Validación RUT

- Decorator custom `@IsRut()` que ejecuta módulo 11 (no solo regex).
- Misma validación en frontend (Zod refinement) y en imports batch.

### Persona.Bloqueado por default=true

- Patrón legacy: personas se crean bloqueadas, requieren desbloqueo explícito con archivo.
- Evaluación para SURP 2.0: el comportamiento tiene sentido (evita exposición accidental en API), pero debe quedar explícito en el UI (checkbox "bloqueado" default true + textarea razón obligatoria al desbloquear).

### Password

- El legacy usa "encriptación" reversible con clave fija. **No se migra ni se replica.**
- SURP 2.0: argon2id + `must_reset_password=true` al migrar.

---

## Ver también

- `schema.md` — detalle columna-por-columna de cada tabla.
- `controllers.md` — cómo se usan las entidades desde los controllers.
- `modules.md` — flujos de negocio que recorren estas entidades.
- `apps/api/.ai-docs/standards/DATA-MIGRATION.md` — mapeo legacy → SURP 2.0.
