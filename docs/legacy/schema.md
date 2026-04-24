# Schema SQL del SURP Legacy

> Catálogo exhaustivo del esquema de base de datos del SURP legacy. Fuente de verdad técnica para el rediseño PostgreSQL + PostGIS de SURP 2.0. Cada tabla legacy debe tener destino documentado en `apps/api/.ai-docs/standards/DATA-MIGRATION.md`.
>
> Extraído de `SACL.EF/SACLContext.cs` + `SACL.EF/Entidades/*.cs` + `SACL.EF/Enums/*.cs`.

---

## Resumen

- **60 tablas / entidades** distribuidas en 15 dominios funcionales.
- **35 enums** referenciados desde entidades (convertidos como `int` en BD).
- **6 seeds** principales en `OnModelCreating` (2 Empresas, 1 Usuario maestro, 6 Permisos base para Administrador).

### Dominios funcionales

1. Usuarios y autenticación — Usuario, Empresa, Perfil (enum).
2. Personas y contactos — Persona, ArchivoPersona, VehiculoUsuarios.
3. Incidentes (core) — Incidente, Incendio, IncidentePredio, IncidenteBienAfectado.
4. Incidentes externos — IncidentesExternos, IncidenteExternoBienAfectado, FotosIncidenteExterno, EmpresasExternas.
5. Denuncias — Denuncia, DenunciaImputado, DenunciaTestigo, DenunciaVehiculo, DenunciaVehiculoNI.
6. Causas judiciales — Causa, CausaQuerella, Querella, AbogadoCausa, Resolucion, ResolucionPersona, Hito, DocumentoCausa.
7. Vehículos — Vehiculo, VehiculoNI, SeguimientoVehiculo.
8. Bienes afectados — BienAfectado, IncidenteBienAfectado, IncidenteExternoBienAfectado, MedioIncautado, NoIncautado.
9. MAAT — SurpMaat, SurpMaatDetalle, SurpMaatDetalleVinculo, SurpMaatDetalleIncidente.
10. Seguimiento — Seguimiento, IncidenteSeguimiento, SeguimientoVehiculo.
11. Catálogos territoriales — Region, Provincia, Comuna, Zona, Area, Predio.
12. Catálogos de justicia — Fiscalia, Fiscal, Tribunal, UnidadPolicial.
13. Auditoría — AuditoriaApi, AuditoriaPersonaApi, AuditoriaConsulta, AuditoriaUsuario.
14. Evidencia y documentación — Foto, FotosIncidenteExterno, Evidencia, GuiaDespacho, Destino.
15. Permisos y control — Permiso, Controlador (enum).

---

## Convenciones del legacy

### Patrón de PK

- **Tablas principales**: `int` autoincremental (Identity con seed 1). Ej. `UsuarioId`, `IncidenteId`, `CausaId`, `PersonaId`.
- **Tablas catálogo con código natural**: `string(20)` manual (RUT de empresas, códigos de zona/área). Ej. `EmpresaId` = "96573310-8", `ZonaId`, `AreaId`.
- **Tablas lookup genéricas**: `int` autoincremental. Ej. `RegionId`, `ProvinciaId`, `ComunaId`.
- **Relaciones M:N**: PKs compuestas por FKs. Ej. `IncidenteSeguimiento(IncidenteId, SeguimientoId)`, `AbogadoCausa(AbogadoId, CausaId)`, `VehiculoUsuarios(VehiculoId, PersonaId, FechaInscripcion)`.
- **Casos complejos**: PKs compuestas de hasta 4 columnas en MAAT (`SurpMaatDetalle(MaatId, MaatDetalleId)`, `SurpMaatDetalleVinculo(VinculoId, MaatId, MaatDetalleId, RutPatente)`).

### Campos de auditoría estándar

Presentes en casi todas las tablas de dominio:
- `AddUserId` (int, FK → Usuario.UsuarioId) — creador.
- `AddDate` (datetime, NOT NULL) — fecha/hora creación.
- `ChgUserId` (int?, FK → Usuario.UsuarioId) — último modificador.
- `ChgDate` (datetime?) — fecha/hora último cambio.
- `Activo` (bool, default false o true según contexto) — flag de soft delete.

**Excepciones sin auditoría completa:**
- `AuditoriaApi`, `AuditoriaPersonaApi`, `AuditoriaConsulta`, `AuditoriaUsuario` — solo `AddDate + UsuarioId` (append-only).
- `SurpMaatDetalle`, `SurpMaatDetalleVinculo`, `SurpMaatDetalleIncidente` — sin auditoría alguna.
- `ArchivoPersona` — tiene `AddUserId/AddDate/Activo` pero no `ChgUserId/ChgDate`.

### Soft delete (`Activo`)

Columna bool NOT NULL en prácticamente todas las tablas de dominio. **El código NO filtra automáticamente** por `Activo=true` — es responsabilidad del controller. Esto genera el riesgo de mostrar datos "borrados" lógicamente en listados.

### Convención de nombres

- Singular vs plural: `DbSet` usa plural ("Usuarios"), nombre de entidad singular ("Usuario").
- Sin prefijos generalizados (excepto "Auditoria*" y "SurpMaat*").
- Sin sufijos; nombres descriptivos directos.
- Abreviaciones: `RUC`, `RIT`, `RUT` sin cambios.

### Tipos de datos

| Tipo SQL | Uso | Ejemplos |
|----------|-----|----------|
| `int` | IDs, cantidades, enums | `UsuarioId`, `IncidenteId`, `Cantidad`, `TipoIncidente` (enum→int) |
| `string(n)` | Textos acotados | `Rut(20)`, `Patente(10)`, `CorreoElectronico(256)`, `Nombres(128)` |
| `decimal(10,2)` / `decimal(18,2)` | Dinero, superficies, coordenadas | `Avaluo`, `Superficie`, `Latitud`, `Longitud`, `Cantidad` |
| `money` | Valores monetarios | `BienAfectado.Avaluo` |
| `datetime` | Fechas (sin TZ) | `AddDate`, `FechaTomaConocimiento`, `FechaCausa` |
| `datetime?` | Fechas opcionales | `ChgDate`, `FechaTermino`, `FechaDevolucion` |
| `TimeSpan` | Horas, duraciones | `HoraInicio`, `HoraTermino`, `Hora` (Incendio) |
| `bool` / `bool?` | Banderas | `Activo`, `Armado`, `Incautado`, `Recuperado`, `Querella`, `DonacionMadera` |
| Enum (int) | Discriminadores | `TipoIncidente`, `Perfil`, `Institucion`, `EstadoCausa` |
| `nvarchar(max)` | Textos largos | `Relato`, `Detalles`, `Observacion` |
| `string` GUID | IDs empresariales | `EmpresaId="96573310-8"` (RUT como PK) |

---

## Tablas por dominio funcional

### 1. Autenticación y Usuarios

#### Usuario

**Tabla:** `Usuarios` — PK `UsuarioId` (int, autoincremental). Usuarios del sistema con roles y empresa.

| Columna | Tipo | Null | Notas |
|---------|------|------|-------|
| UsuarioId | int | NO | PK Identity(1,1) |
| EmpresaId | string(20) | NO | FK → Empresa (RUT) |
| CorreoElectronico | string(256) | NO | UNIQUE INDEX |
| Perfil | int (enum Perfil) | NO | 2=Admin, 6=UP, 7=UPAdmin, 3=Abogado, 8=AbogadoAdmin, 5=Visor, 9=Incendios, 10=Seguimiento, 11=UsuarioApi, 12=Consultas, 13=AbogadoTerreno |
| Rut | string(15) | NO | UNIQUE INDEX |
| Nombres | string(128) | NO | |
| Apellidos | string(128) | NO | |
| Telefono | string(128) | SÍ | |
| Password | string(256) | NO | "Encriptada" con clave GUID fija (PITFALL-B-018) |
| Estadisticas | bool | NO | false |
| AddUserId | int | NO | FK auto-referencia a Usuario |
| AddDate | datetime | NO | |
| ChgUserId | int | SÍ | |
| ChgDate | datetime | SÍ | |
| Activo | bool | NO | false |

**FKs:** EmpresaId → Empresa (Restrict); AddUserId/ChgUserId → Usuario (self-reference).
**Índices únicos:** CorreoElectronico, Rut.
**Seed:** 1 usuario maestro (`master@softe.dev`, RUT `00000000-0`, Empresa `77033805-0`).

#### Empresa

**Tabla:** `Empresas` — PK `EmpresaId` (string, max 20). Organizaciones propietarias de usuarios.

| Columna | Tipo | Null | Notas |
|---------|------|------|-------|
| EmpresaId | string(20) | NO | PK (RUT) |
| RazonSocial | string(128) | NO | UNIQUE INDEX |
| Logo | string | SÍ | URL o path |
| AddUserId/AddDate/ChgUserId/ChgDate/Activo | | | Estándar |

**Seeds:**
- `96573310-8` — Forestal Arauco S.A.
- `77033805-0` — Softe SpA.

---

### 2. Personas y contactos

#### Persona

**Tabla:** `Personas` — PK `PersonaId` (int, autoincremental). Personas naturales (imputados, testigos, dueños, víctimas).

| Columna | Tipo | Null | Notas |
|---------|------|------|-------|
| PersonaId | int | NO | PK Identity |
| Rut | string(20) | SÍ | UNIQUE INDEX; regex `\d{1,8}-[K0-9]` |
| Nombres | string(128) | NO | solo letras |
| ApellidoPaterno | string(128) | SÍ | |
| ApellidoMaterno | string(128) | SÍ | |
| CorreoElectronico | string(128) | SÍ | validación email |
| Telefono1/Telefono2 | string(50) | SÍ | patrón chileno |
| Direccion | string(250) | SÍ | |
| DonacionMadera | bool? | SÍ | default 0 |
| Alias | string(50) | SÍ | ASCII |
| Banda | string(100) | SÍ | ASCII, banda criminal |
| Empresa | bool | NO | false, es persona jurídica |
| Bloqueado | bool | NO | **true por default** (clave para API externa) |
| RazonBloqueo | string | SÍ | |
| RazonDesbloqueo | string | SÍ | |
| OtraVinculacion | bool | NO | false (ver problemas §9) |
| Vinculacion | enum | SÍ | Hermana, Hermano, Hijo, MamaPareja, Papa, Pareja, etc. |
| ObservacionVinculacion | string | SÍ | |
| RutVinculacion | string | SÍ | RUT de persona relacionada |
| ArchivoDesbloqueo | string | SÍ | path Azure Blob |
| Observacion | string | SÍ | |
| AddUserId/AddDate/ChgUserId/ChgDate/Activo | | | Estándar |

**Relaciones salientes:** DenunciaImputado, DenunciaTestigo, Resolucion, Vehiculo, VehiculoUsuarios, ArchivoPersona.

#### ArchivoPersona

**Tabla:** `ArchivosPersona` — PK `ArchivoPersonaId`. Documentos adjuntos a personas. **Sin ChgUserId/ChgDate** (append-only).

#### VehiculoUsuarios (schema `cloudso1_softe`)

**Tabla:** `VehiculoUsuarios` — PK compuesta `(FechaInscripcion, VehiculoId, PersonaId)`. Vincula usuarios a vehículos con fecha.

---

### 3. Incidentes (core)

#### Incidente

**Tabla:** `Incidentes` — PK `IncidenteId`. Hechos ilícitos reportados.

| Columna | Tipo | Null | Notas |
|---------|------|------|-------|
| IncidenteId | int | NO | PK Identity |
| TipoIncidente | int (enum) | NO | 17=Hurto, 18=Robo, 19=Daño, 20=Amenazas, 157=Incendio, 416=TalaIlegal, etc. |
| FechaTomaConocimiento | datetime | SÍ | |
| Latitud | decimal | SÍ | -33 a -56 aprox |
| Longitud | decimal | SÍ | -66 a -75 aprox |
| Relato | string | SÍ | |
| Numero | int | NO | |
| Codigo | string | SÍ | ej. "INC-2024-00456" |
| Toma | bool | NO | false |
| Semaforo | enum | SÍ | 0=NoDeterminado, 1=Verde, 2=Amarillo, 3=Rojo |
| AddUserId/AddDate/ChgUserId/ChgDate/Activo | | | Estándar |

**Relaciones salientes:** Denuncia, Foto, IncidenteBienAfectado, IncidentePredio, IncidenteSeguimiento.
**Migración a PostGIS:** `Latitud/Longitud` → `location GEOMETRY(POINT, 4326)` vía `ST_MakePoint(Longitud, Latitud)`.

#### IncidentePredio

**Tabla:** `IncidentePredio` — PK compuesta `(IncidenteId, PredioId)`. Vincula incidentes a predios.

| Columna | Tipo | Null | Notas |
|---------|------|------|-------|
| IncidenteId | int | NO | FK → Incidente |
| PredioId | string(10) | NO | FK → Predio |
| ExistePorton | bool | NO | |
| CondicionPorton | enum | SÍ | 0=Abierto, 1=Cerrado |
| EstadoPorton | enum | SÍ | 0=Bueno, 1=Malo |
| (auditoría estándar) | | | |

#### IncidenteBienAfectado

**Tabla:** `IncidenteBienAfectado` — PK compuesta `(BienAfectadoId, IncidenteId)`. Bienes afectados en un incidente.

| Columna | Tipo | Null | Notas |
|---------|------|------|-------|
| BienAfectadoId | int | NO | FK |
| IncidenteId | int | NO | FK |
| Cantidad | decimal(18,2) | NO | |
| Avaluo | decimal(18,2) | NO | |
| Recuperado | bool | NO | false |
| CondicionMadera | enum | SÍ | 1=Arrumada, 2=Botada, 3=EnPie |
| EstadoMadera | enum | SÍ | 1=Fresca, 2=Humeda, 3=Impregnada, 4=Manchada, 5=Quemada, 6=Seca, 7=SinAsignar |
| AcopioMadera | enum | SÍ | 1=0-3m, 2=3-6m, 3=6+m |
| Especie | enum | SÍ | 5=Euca, 6=Pira, 212=PinoRadiata, etc. (26 valores) |
| Faena | bool? | SÍ | false |

#### Incendio

**Tabla:** `Incendios` — PK `IncendioId`. Incendios forestales con datos CONAF (50+ columnas).

Columnas destacadas: `CausaId` (FK → Causa), `ClaveExternaIncendio`, `Fecha/Semana/Mes/Hora/Hora2`, `PredioId`, `Pira/Euca/Otras` (hectáreas por especie), `Foco`, `Latitud/Longitud`, `ValorIFRS`, `TotalSuperficieAfectada`, `SuperficiePlantacionAfectada`, cronología completa (`Arribo`, `FechaControl`, `Despacho`, `Control`, `Extincion`, `MinDespacho`, `MinArribo`, `MinControl`, `MinExtincion`, `MinTotal`), `RecursosCombate/RecursosControl`, `Propietario`, `Sector`, `Causa1/Causa2/Motivacion`, `ObservacionIndagacion`, `SolicitudDenuncia`, `CombustibleInicial/Final`, `ComandanteIncidente`.

---

### 4. Incidentes externos

#### IncidentesExternos

**Tabla:** `IncidentesExternos` — PK `IncidenteExternoId`. Incidentes en empresas/propiedades externas a Arauco.

| Columna | Tipo | Null | Notas |
|---------|------|------|-------|
| IncidenteExternoId | int | NO | PK Identity |
| EmpresaExternaId | int | NO | FK → EmpresasExternas |
| ComunaId | int | NO | FK → Comuna |
| TipoIncidente | int (enum) | NO | |
| FechaTomaConocimiento | datetime | NO | |
| Latitud/Longitud | decimal | SÍ | |
| Relato | string | SÍ | |
| Numero/Codigo | | | |
| (auditoría estándar) | | | |

**Relaciones salientes:** Denuncia, IncidenteExternoBienAfectado, FotosIncidenteExterno.

#### EmpresasExternas

**Tabla:** `EmpresasExternas` — PK `EmpresaExternaId`. Catálogo de empresas/propietarios externos.

Columnas: `RazonSocial`, `Rut`, `Logo`, auditoría estándar.

#### IncidenteExternoBienAfectado

Análogo a `IncidenteBienAfectado`, PK compuesta `(BienAfectadoId, IncidenteExternoId)`.

#### FotosIncidenteExterno

**Tabla:** `FotosIncidenteExterno` — PK `FotoIncidenteExternoId`. Evidencia fotográfica de incidentes externos. Campos: `IncidenteExternoId`, `Url`, `Nombre`, `Observacion`, `AzureNombre`, auditoría.

---

### 5. Denuncias

#### Denuncia

**Tabla:** `Denuncias` — PK `DenunciaId`. Denuncia formal ante autoridad.

| Columna | Tipo | Null | Notas |
|---------|------|------|-------|
| DenunciaId | int | NO | PK Identity |
| IncidenteId | int | SÍ | FK → Incidente (**OR** IncidenteExternoId) |
| IncidenteExternoId | int | SÍ | FK → IncidentesExternos |
| UnidadPolicialId | int | SÍ | FK → UnidadPolicial |
| FiscaliaId | int | SÍ | FK → Fiscalia |
| NumeroDeDenuncia | string | NO | RUC/expediente |
| Institucion | int (enum) | NO | 25=Carabineros, 26=PDI, 27=Fiscalia, 28=SinDenuncia |
| Fecha | datetime | NO | |
| SeguimientoPenal | bool | NO | false |
| FechaSeguimientoPenal | datetime | SÍ | |
| FechaDeFormalizacion | datetime | SÍ | |
| (auditoría estándar) | | | |

**Relaciones salientes:** Causa, DenunciaImputado, DenunciaTestigo, DenunciaVehiculo, DenunciaVehiculoNI, MedioIncautado, GuiaDespacho, Destino.
**Nota de integridad:** puede referenciar `IncidenteId` **o** `IncidenteExternoId`, pero no hay constraint que evite que ambos estén nulos o ambos seteados.

#### DenunciaImputado

PK compuesta `(DenunciaId, PersonaId)`. Campos: `Armado` (bool), `FechaControlDetencion`, `Alias/Banda`, `MedidasCautelares` (enum: 96=SinCautelar, 223=PrisionPreventiva, 230=ArrestoDomiciliarioTotal, 237=ProhibicionCercaPredio, 249=ArraigoNacional, 466=PrisionPreventivaOtraCausa).

#### DenunciaTestigo

PK compuesta `(DenunciaId, PersonaId)`. Campo adicional: `Denunciante` (bool).

#### DenunciaVehiculo

PK compuesta `(DenunciaId, VehiculoId)`. Campos: `NoIncautadoId` (FK), `Incautado`, `RazonNoIncautado`, `FechaIncautacion`, `VehiculoDevuelto`, `FechaDevolucion`, `Controlado`.

#### DenunciaVehiculoNI

PK compuesta `(DenunciaId, VehiculoNIId)`. Análogo a `DenunciaVehiculo` pero para vehículos no identificados.

---

### 6. Causas y procesal

#### Causa

**Tabla:** `Causas` — PK `CausaId`. Proceso judicial derivado de denuncias.

| Columna | Tipo | Null | Notas |
|---------|------|------|-------|
| CausaId | int | NO | PK Identity |
| DenunciaId | int | SÍ | FK → Denuncia |
| Ruc | string(30) | SÍ | |
| Rit | string(30) | SÍ | |
| Delito | string(128) | SÍ | texto libre |
| TipoDelito | enum (TipoIncidente) | NO | |
| FiscalId | int | SÍ | FK → Fiscal |
| FiscaliaId | int | SÍ | FK → Fiscalia |
| TribunalId | int | SÍ | FK → Tribunal |
| UnidadPolicialId | int | SÍ | FK → UnidadPolicial |
| FechaCausa | datetime | SÍ | |
| EstadoCausa | enum | NO | 1=Vigentedesformalizada, 39=Vigenteformalizada, 40=NoPerseverar, 41=TerminadaParcial, 131=Terminada |
| Querella | bool? | SÍ | false |
| FechaQuerella | datetime | SÍ | |
| Observacion | string | SÍ | |
| FechaTermino | datetime | SÍ | |
| FormaTermino | enum | SÍ | 1=Condena, 2=SentenciaAbsolutoria, 3=AcuerdoReparatorio, 4=SupensionCondicional, 5=ComunicacionPerseverar, 6=ArchivoProvisional, 7=PrincipioOportunidad |
| NumeroDeParte | string | SÍ | |
| NumeroDeOficio | int | SÍ | |
| FechaOficio | datetime | SÍ | |
| FechaPreparacionRespuesta | datetime | SÍ | (para incendios) |
| FechaEnvioRespuesta | datetime | SÍ | (para incendios) |
| (auditoría estándar) | | | |

#### CausaQuerella

PK `CausaQuerellaId`. FK a Causa y Querella.

#### Querella

PK `QuerellaId`. Campos: `AbogadoId` (FK → Usuario), `FechaQuerella`, `DiasInvestigacion`, `tipoQuerella` (0=Querella, 1=AmpliacionQuerella), `Observacion`. **Nota:** `AbogadoId` referencia `Usuario.UsuarioId`; no existe tabla `Abogado` separada. No hay constraint que valide `Perfil=Abogado*`.

#### AbogadoCausa

PK compuesta `(AbogadoId, CausaId)`. Campo adicional: `Responsable` (bool). Asignación abogado↔causa.

#### Resolucion

PK `ResolucionId`. Decisión judicial sobre persona en causa. Campos: `CausaId`, `PersonaId`, `Fecha`, `Detalles`, `Resoluciones` (enum: 120=SuspensionCondicionalProcedimiento, 133=AcuerdoReparatorio, 134=NoPreservar, 135=ArchivoProvisional, 136=PrincipioOportunidad, 137=SobreseimientoTemporal, 138=SobreseimientoDefinitivo, 139=SentenciaAbsolutoria, 140=SentenciaCondenatoria), `NroDias` (pena en días), `AcuerdoReparaciones` (146=Acuerdo1, 699=DisculpasPublicas, 725=DonacionMotosierraABomberos, 740=PagarSumaDinero), `Beneficios` (121=ReclusionNocturna, 192=ReclusionNocturnaDomicilio, 262=RemisionCondicional).

#### ResolucionPersona

PK `ResolucionPersonaId`. Resolución específica por persona. Campos: `CausaId`, `PersonaId`, `Fecha`, `EstadoPersona` (enum EstadoCausa), `Detalles`, `FechaTermino`, `FormaTermino`.

#### Hito

PK `HitoId`. Eventos clave del procedimiento judicial. Campos: `CausaId`, `TipoHito` (104=Judicial, 105=Fiscalia, 106=Administrativo), `NombreHito` (enum con 70+ valores: CitacionTribunal, Audiencia, Querella, Entrevista, Requerimiento, FijaAudiencia, Acusacion, Certificacion, Fallo, Sentencia, etc.), `Fecha`, `Detalle`.

#### DocumentoCausa

PK `DocumentoId`. Adjuntos. Campos: `CausaId`, `Url`, `Descripcion`, `Nombre`, `IncidenteId` (string, sin uso), `TipoDocumento` (enum TipoAdjunto: 110=OtrosDocumentos, 108=CarpetaInvestigacion, 109=EcsYResoluciones, 111=Querella, 112=AmpliacionQuerella), `AzureNombre`.

#### Evidencia

PK `EvidenciaId`. Evidencia material. Campos: `CausaId`, `Descripcion`, `TiposEvidencia` (0=FotoSimple, 1=VideoSimple, 2=VideoGeoreferenciado, 3=FotoGeoreferenciado, 4=Otros), `AzureNombre`.

---

### 7. Vehículos

#### Vehiculo

**Tabla:** `Vehiculo` — PK `VehiculoId`. Vehículos identificados.

Columnas destacadas: `PersonaId` (propietario), `Patente` (regex validado), `TipoDeVehiculo` (enum con 20+ valores: Sedan, Camioneta, Camion, Motocicleta, YuntaDeBueyes, Carreton, Carreta, Van, Automovil, Jeep, Tractor, TraccionAnimal, Camiónforestal, Carroforestal, Camion34, StationWagon, SUV, Furgon, Minibus, Remolque), `Modelo`, `Marca`, `Color`, `Chasis` (4x2, 4x4, AutoCargante, CabinaSimple, CabinaYMedia, CargadorTroncos, PortaTroncos, Sedan, Suv, TraccionSimple, TransportePasajeros, TransporteTroncos, CabinaDoble, Tolba, NoAplica), `AutoCargante` (bool), `FechaInscripcion`, `Certificado/AzureCertificado`, **`Bloqueado`** (default true — clave para API), `RazonBloqueo`, `RazonDesbloqueo`, `ArchivoDesbloqueo`, `Observacion`.

#### VehiculoNI

**Tabla:** `VehiculoNI` — PK `VehiculoNIId`. Vehículos NO identificados. Campos similares pero todos nullable (patente incompleta o desconocida).

#### SeguimientoVehiculo

PK `SeguimientoVehiculoId`. Vehículos usados en operación de seguimiento terrestre. Campos: `VehiculoId`, `SeguimientoId`, `Chasis`, `TipoDeVehiculo`, **`AutoCargante` int** (0=No, 1=Sí, 2=Grua — inconsistente con `bool` en Vehiculo), `Marca`, `Color`, `Modelo`, `Detalle`, `IdentificacionVehiculo` (0=Predio, 1=Ruta).

---

### 8. Bienes afectados y medios incautados

#### BienAfectado

**Tabla:** `BienesAfectados` — PK `BienAfectadoId`. Catálogo. Campos: `Nombre` (ej. "Madera Pino Radiata"), `Avaluo` (money), `TipoBienAfectado` (enum: 95=NN, 204=Campamento, 224=Lena, 226=Trozos, 250=Astillas, 274=PlantacionJoven, 276=Arboles, 318=Desecho, 1=Madera, 2=Vehiculo, 3=Instalacion, 4=Otro), `UnidadMedida` (58=Unidad, 1=Metro, 2=Metro2, 3=Metro3, 210=MetroRuma, 459=Hectaria, 5=Otro).

#### MedioIncautado

PK `MedioIncautadoId`. Medios/objetos incautados por denuncia. Campos: `DenunciaId`, `Nombre`, `Incautado`.

#### NoIncautado

PK `NoIncautadoId`. Catálogo de razones por las que algo no fue incautado. Usado por `DenunciaVehiculo.NoIncautadoId` y `DenunciaVehiculoNI.NoIncautadoId`.

---

### 9. MAAT

#### SurpMaat

PK `MaatId`. Solicitud MAAT. Campos: `Solicitante`, `Negocio`, `FechaSolicitud`. **Sin auditoría completa.**

#### SurpMaatDetalle

PK compuesta `(MaatId, MaatDetalleId)`. Líneas de detalle. Campos: `Tipo`, `RutPpu`, `NombreTipoVeh`, `Certificado/CertificadoNombre`, `Resultado` (bool), `ResultadoAntiguo`, `RazonCambioResultado`. **Sin auditoría.**

#### SurpMaatDetalleVinculo

PK compuesta `(VinculoId, MaatId, MaatDetalleId, RutPatente)`. Vínculos de vehículo/ruta. Campos: `Descripcion`, `Tipo`. **Sin auditoría.**

#### SurpMaatDetalleIncidente

PK compuesta `(MaatId, MaatDetalleId, Codigo)`. Vincula detalle MAAT a incidente por `Incidente.Codigo`. **Sin auditoría.**

---

### 10. Seguimiento y monitoreo

#### Seguimiento

PK `SeguimientoId`. Operación de seguimiento terrestre de madera/vehículos. Campos: `PredioId` (requerido), `CodigoInforme`, `Fecha`, `Tipo`, `HoraInicio/HoraTermino`, `NombreLugar`, `Madera` (enum Especie), `LugarDestino`, `Latitud/Longitud`, `Observacion`, `TipoSeguimiento` (0=Terrestre, 1=Aeronave, 2=Dron).

#### IncidenteSeguimiento

PK compuesta `(IncidenteId, SeguimientoId)`. Vínculo M:N.

---

### 11. Catálogos territoriales

| Tabla | PK | Jerarquía | Notas |
|-------|----|-----------|-------|
| `Regiones` | `RegionId` int Identity | Top-level | Campos: `Nombre`, `Simbolo`, `Orden` |
| `Provincias` | `ProvinciaId` int manual | Region → Provincia | **PK NO autoincremental** |
| `Comunas` | `ComunaId` int Identity | Provincia → Comuna | |
| `Zonas` | `ZonaId` string(10) manual | Top-level interno | Campos: `Nombre(50)`, `NombreCorto(2)`, `Orden` |
| `Areas` | `AreaId` string(10) manual | Zona → Area | Campos: `Nombre(50)`, `ZonaId` |
| `Predios` | `PredioId` int **manual** | Area → Predio | **PK NO autoincremental** (código predial). Campos: `Nombre(50)`, `AreaId`, `Superficie`, `ComunaId` |

---

### 12. Catálogos de justicia

| Tabla | PK | Campos |
|-------|----|--------|
| `Fiscalias` | `FiscaliaId` int Identity | `Nombre` |
| `Fiscales` | `FiscalId` int manual | `Nombres`, `CorreoElectronico` |
| `Tribunales` | `TribunalId` int manual | `Nombre` |
| `UnidadPolicial` | `UnidadPolicialId` int Identity | `ComunaId`, `Nombre`, `Institucion` (25=Carabineros, 26=PDI, 27=Fiscalia, 28=SinDenuncia), `TipoUnidad` (1=Avanzada, 2=Brigada, 5=Comisaria, 6=Cuartel, 13=Reten, 14=Subcomisaria, 15=SucomisariaCarreteras, 16=Tenencia, 17=TenenciaCarreteras, 99=Desconocido), `Latitud/Longitud` |

---

### 13. Auditoría

#### AuditoriaApi (schema `cloudso1_softe`)

PK `AuditoriaApiId`. Log de consultas API de vehículos. Campos: `UsuarioId`, `Patente`, `AddDate`, `Resultado` (bool), `Ip`, `TiempoRespuesta` (decimal, ms). **Sin `ChgUser/ChgDate/Activo`.**

#### AuditoriaPersonaApi (schema `cloudso1_softe`)

PK `AuditoriaPersonaApiId`. Log de consultas API de personas por RUT. Campos análogos con `Rut`.

#### AuditoriaConsulta

PK `AuditoriaConsultaId`. Log general de consultas. Campos: `UsuarioId`, `AddDate`, `PatenteRut`, `Habilitado` (bool).

#### AuditoriaUsuario

PK `AuditoriaUsuarioId`. Log de login. Campos: `UsuarioId`, `AddDate`, `Ip`, `EstadoLogin` (1=LoginCorrecto, 2=ContrasenaIncorrecta, 3=CuentaDesactivada), `Perfil` (enum, snapshot).

---

### 14. Evidencia y documentación

#### Foto

PK `FotoId`. Fotos/imágenes de incidentes. Campos: `IncidenteId`, `Url`, `Nombre`, `Observacion`, `TiposEvidencia` (0=FotoSimple, 1=VideoSimple, 2=VideoGeoreferenciado, 3=FotoGeoreferenciado, 4=Otros), `AzureNombre`.

#### GuiaDespacho

PK `GuiaDespachoId`. Guías de despacho. Campos: `NumeroGuia`, `DenunciaId`, `OrigenId` (FK Persona emisora), `DestinoId` (FK Persona receptora), `Observacion`, `Fecha`, `DestinoLugar`, `Latitud/Longitud`, `AzureNombre`.

#### Destino

PK `DestinoId`. Destinos de madera incautada. Campos: `DenunciaId`, `DestinoLugar(50)` (solo mayúsculas/números), `Latitud/Longitud`, `Observacion`, `AzureNombre`.

---

### 15. Permisos y control

#### Permiso

**Tabla:** `Permisos` — PK compuesta `(Perfil, Controlador)`. **Código muerto** (PITFALL-B-024) — la tabla existe y recibe seeds pero el aplicativo no la consulta.

| Columna | Tipo | Notas |
|---------|------|-------|
| Perfil | enum int | 2=Admin, 6=UP, 7=UPAdmin, etc. |
| Controlador | enum int | 0=Incidentes, 1=Incendios, 2=Seguimiento, 3=Denuncias, 4=Causas, 5=Hitos, 6=Imputados, 7=Vehiculos, 8=Testigos, 9=Usuarios, 10=Busquedas, 11=Zonas, 12=Areas, 13=Predios, 14=Documentos, 15=Consultas, 16=Mantenedores |
| Acceso/Create/Edit/Details/Delete | bool | |
| (auditoría estándar) | | |

**Seeds:** 6 permisos para Administrador (Incidentes, Denuncias, Causas, Hitos, Mantenedores, Usuarios) todos `true`.

---

## Enums

### Enums de negocio

| Enum | Valores (resumen) | Usado por |
|------|-------------------|-----------|
| `Perfil` | Administrador(2), UnidadPatrimonial(6), UnidadPatrimonialAdministrador(7), Abogado(3), AbogadoAdministrador(8), Visor(5), Incendios(9), Seguimiento(10), UsuarioApi(11), Consultas(12), AbogadoTerreno(13) | Usuario, AuditoriaUsuario, Permiso |
| `Controlador` | Incidentes, Incendios, Seguimiento, Denuncias, Causas, Hitos, Imputados, Vehiculos, Testigos, Usuarios, Busquedas, Zonas, Areas, Predios, Documentos, Consultas, Mantenedores | Permiso |
| `TipoIncidente` | Hurto(17), Robo(18), Daño(19), Amenazas(20), Incendio(157), AtentadoPersonal(206), AsociacionIlicita(216), PorteDeArmas(228), InfraccionLeyBosques(229), Receptacion(241), Usurpacion(287), Denuncia(398), TalaIlegal(416), Desacato(468), OtrosHechos(506), Agresion(516), HurtoFrustrado(527), AtentadoIncendiario(603), PlantacionIlegal(695), AlteracionDestruccion(703), HurtoDeEnergiaElectrica(704) | Incidente, IncidentesExternos, Causa |
| `Institucion` | Carabineros(25), PDI(26), Fiscalia(27), SinDenuncia(28) | Denuncia, UnidadPolicial |
| `EstadoCausa` | Vigentedesformalizada(1), Vigenteformalizada(39), NoPerseverar(40), TerminadaParcial(41), Terminada(131) | Causa, ResolucionPersona |
| `FormaTermino` | Condena(1), SentenciaAbsolutoria(2), AcuerdoReparatorio(3), SupensionCondicional(4), ComunicacionPerseverar(5), ArchivoProvisional(6), PrincipioOportunidad(7) | Causa, ResolucionPersona |
| `TipoHito` | Judicial(104), Fiscalia(105), Administrativo(106) | Hito |
| `NombreHito` | 70+ valores | Hito |
| `TipoDeBienAfectado` | NN(95), Campamento(204), Lena(224), Trozos(226), Astillas(250), PlantacionJoven(274), Arboles(276), Desecho(318), Madera(1), Vehiculo(2), Instalacion(3), Otro(4) | BienAfectado |
| `Especie` | Euca(5), Pira(6), Euni(111), Nativo(112), Acacia(123), Aromo(182), PinoRadiata(212), Cipres(561), Quillay(560), Aliso(712), PinoOregon(801), **NoAplica(801)** (duplicado) | IncidenteBienAfectado, Incendio, Seguimiento |
| `CondicionDeMadera` | Arrumada(1), Botada(2), EnPie(3) | IncidenteBienAfectado |
| `EstadoDeLaMadera` | Fresca(1), Humeda(2), Impregnada(3), Manchada(4), Quemada(5), Seca(6), SinAsignar(7) | IncidenteBienAfectado |
| `AcopioDeMadera` | Meses0a3(1), Meses3a6(2), Meses6oMas(3) | IncidenteBienAfectado |
| `UnidadDeMedida` | Unidad(58), Metro(1), Metro2(2), Metro3(3), MetroRuma(210), Hectaria(459), otro(5) | BienAfectado |
| `TipoDeVehiculo` | Sedan, Camioneta, Camion, Motocicleta, YuntaDeBueyes, Carreton, Carreta, Van, Automovil, Jeep, Tractor, TraccionAnimal, Otro, Carro, Camiónforestal, Carroforestal, Camion34, StationWagon, SUV, Furgon, Minibus, Remolque | Vehiculo, VehiculoNI, SeguimientoVehiculo |
| `Chasis` | 4x2, 4x4, AutoCargante, CabinaSimple, CabinaYMedia, CargadorTroncos, PortaTroncos, Sedan, Suv, TraccionSimple, TransportePasajeros, TransporteTroncos, CabinaDoble, Tolba, NoAplica | Vehiculo, SeguimientoVehiculo |
| `TipoSeguimiento` | Terrestre(0), Aeronave(1), Dron(2) | Seguimiento |
| `IdentificacionVehiculo` | Predio(0), Ruta(1) | SeguimientoVehiculo |
| `Semaforo` | NoDeterminado(0), Verde(1), Amarillo(2), Rojo(3) | Incidente |
| `MedidasCautelares` | SinCautelar(96), PrisionPreventiva(223), ArrestoDomiciliarioTotal(230), ProhibicionCercaPredio(237), ArraigoNacional(249), PrisionPreventivaOtraCausa(466) | DenunciaImputado |
| `TipoLogin` | LoginCorrecto(1), ContrasenaIncorrecta(2), CuentaDesactivada(3) | AuditoriaUsuario |
| `TipoQuerella` | Querella(0), AmpliacionQuerella(1) | Querella |
| `Resoluciones` | SuspensionCondicionalProcedimiento(120), AcuerdoReparatorio(133), NoPreservar(134), ArchivoProvisional(135), PrincipioOportunidad(136), SobreseimientoTemporal(137), SobreseimientoDefinitivo(138), SentenciaAbsolutoria(139), SentenciaCondenatoria(140) | Resolucion |
| `Beneficios` | ReclusionNocturna(121), ReclusionNocturnaDomicilio(192), RemisionCondicional(262) | Resolucion |
| `AcuerdoReparaciones` | Acuerdo1(146), DisculpasPublicas(699), DonacionMotosierraABomberos(725), PagarSumaDinero(740) | Resolucion |
| `TiposEvidencia` | FotoSimple(0), VideoSimple(1), VideoGeoreferenciado(2), FotoGeoreferenciado(3), Otros(4) | Foto, Evidencia |
| `TipoAdjunto` | OtrosDocumentos(110), CarpetaInvestigacion(108), EcsYResoluciones(109), Querella(111), AmpliacionQuerella(112) | DocumentoCausa |
| `TipoUnidad` | Avanzada(1), Brigada(2), BrigadaInvestigacionCriminal(3), Centro(4), Comisaria(5), Cuartel(6), Educacion(7), GrupoReaccionTactica(8), JefaturaNacional(9), LaboratorioCriminalistica(10), PoliciaInternacional(11), Prefectura(12), Reten(13), Subcomisaria(14), SucomisariaCarreteras(15), Tenencia(16), TenenciaCarreteras(17), Desconocido(99) | UnidadPolicial |
| `CondicionDelPorton` | Abierto(0), Cerrado(1) | IncidentePredio |
| `EstadoDelPorton` | Bueno(0), Malo(1) | IncidentePredio |
| `AutoCargante` | Si(0), No(1), Grua(2) | SeguimientoVehiculo (int type, inconsistente con `bool` en Vehiculo) |
| `Vinculacion` | Hermana, Hermano, Hijo, Mama, MamaPareja, Papa, PapaPareja, Pareja, ParejaHermana, ParejaTia, Prima, Primo, Sujeto, Tia, TiaPareja, Tio, Socio, SociedadCon, Otros | Persona |
| `JerarquiaBanda` | NoDefinido, Lider, SegundoAlMando, TerceroAlMando, Miembro | Sin uso actual |
| `PenasAccesorias` | PagarMulta(122), PresidioMenor(164), Comiso(263) | Sin uso actual |

---

## Seeds notables (en `OnModelCreating`)

### Empresas (2)
1. `96573310-8` — "Forestal Arauco S.A." (Activo=true, AddUserId=1).
2. `77033805-0` — "Softe SpA" (Activo=true, AddUserId=1).

### Usuario (1)
- `UsuarioId=1` — "Usuario Maestro" (`master@softe.dev`, RUT `00000000-0`, Empresa `77033805-0`, Activo=true).

### Permisos (6 para Administrador)
Todos con `Perfil=Administrador(2)`, `Acceso/Create/Edit/Delete/Details=true`:
1. Incidentes
2. Denuncias
3. Causas
4. Hitos
5. Mantenedores
6. Usuarios

---

## Problemas detectados

### 1. FKs inconsistentes en Zonas

En migración EF: `Zonas` usa `AddUserNavigationUsuarioId` y `ChgUserNavigationUsuarioId` (nombres largos). En entidad: propiedades `AddUser` y `ChgUser` directas. Posible falta de asignación automática.

### 2. Denuncia con FK OR

`IncidenteId` y `IncidenteExternoId` ambos nullable. Lógica OR sin constraint en BD. Riesgo de denuncias sin incidente asociado.

### 3. Soft delete sin filtrado automático

Columna `Activo` presente pero las queries no filtran automáticamente. Queries pueden retornar registros borrados lógicamente.

### 4. Strings sin longitud

Muchos campos (`Observacion`, `Detalle`, `Descripcion`) como `nvarchar(max)` sin límite. Inconsistente.

### 5. Abogado sin tabla propia

`AbogadoId` en `Querella`, `AbogadoCausa` referencia `Usuario.UsuarioId` asumiendo `Perfil=Abogado*`, pero sin constraint de rol. Cualquier usuario podría asignarse como abogado.

### 6. AutoCargante inconsistente

- `Vehiculo.AutoCargante` → `bool`.
- `VehiculoNI.AutoCargante` → `bool`.
- `SeguimientoVehiculo.AutoCargante` → `int` (0=No, 1=Sí, 2=Grua).
- `Incendio.Hora` → `TimeSpan?` + `Hora2: int?` (redundancia).

### 7. Enums con valores duplicados

- `Especie.NoAplica = 801` duplica `Especie.PinoOregon = 801`.
- `EstadoDelIncidente` vs `EstadoIncidente` — dos enums similares (ambigüedad).
- `NombreHito` con valores 171, 405, 471 repetidos (duplicación histórica por limpieza incompleta).

### 8. Campos de auditoría sin FK explícita

`Incendio` no tiene `AddUser/ChgUser` declarados explícitamente en `OnModelCreating` — FKs creadas por convention.

### 9. Tabla Incendio no normalizada

50+ columnas con datos CONAF acumulados. Difícil de mantener; tendencia a data warehousing.

### 10. MAAT sin auditoría

`SurpMaat` y descendientes carecen de `AddUserId/AddDate/ChgUserId` completos. No hay trazabilidad por usuario.

### 11. PKs compuestas sin índices secundarios

`SurpMaatDetalleVinculo` tiene PK de 4 columnas sin índices adicionales. Queries por `MaatId` solo serán lentas.

### 12. Seed de Usuario con ID hardcoded

`UsuarioId=1` en seed; si la BD existe con datos, nuevo seed falla.

### 13. Region.Orden sin UNIQUE

Puede haber duplicados de `Orden`. Ordenamiento ambiguo.

### 14. Predio.PredioId no autoincremental

Espera código predial manual. Sin defensa contra duplicados.

### 15. Foto vs Evidencia — mismo enum `TiposEvidencia`

Ambas tablas usan el mismo enum pero semánticamente son distintas (foto de incidente vs evidencia física de causa). Ambigüedad conceptual.

### 16. Propiedad `partial class Personas` huérfana en DbContext

```csharp
public partial class Personas { public virtual ICollection<Persona> Personitas { get; set; } }
```
Restos de refactor incompleto.

---

## Consideraciones para la migración a PostgreSQL + PostGIS

- **`Latitud/Longitud`** (decimal, separadas) → `location GEOMETRY(POINT, 4326)`. Usar `ST_MakePoint(lng, lat)` al migrar. Filas con coordenadas nulas o fuera de rango Chile → `NULL` y reporte.
- **`TipoDeVehiculo`, `TipoIncidente`, `Especie`, `NombreHito`, etc.** → tablas de catálogo editables en lugar de enums hardcodeados (valores con gaps numéricos del legacy se preservan como `migrated_from_legacy_value`).
- **Soft delete selectivo** → mantener solo donde tenga valor de negocio (personas, vehículos, predios); append-only para hitos y evidencias.
- **Auditoría consolidada** → todas las tablas `Auditoria*` legacy se migran a `audit_logs` con `source='legacy_import'`.
- **Duplicados de enum** (`Especie.NoAplica=801` vs `PinoOregon=801`) → reportar y resolver manualmente al migrar.
- **`AutoCargante` inconsistente** → unificar a bool en SURP 2.0 con migración explícita.
- **`Permiso(Perfil, Controlador)` legacy** → **NO migrar** (código muerto). Rediseño completo en `role_permissions`.
- **`Usuario.Password` encriptado** → **NO migrar**, rehashear con argon2 + `must_reset_password=true`.

Ver `apps/api/.ai-docs/standards/DATA-MIGRATION.md` para el mapeo campo-a-campo y el orden de ejecución del ETL.
