# Flujos de Negocio del SURP Legacy

> Documentación de los flujos end-to-end que vive el SURP legacy. Pensado para que stakeholders y el equipo de rediseño entiendan cómo se usa el sistema, no solo qué tablas tiene. Complementa `controllers.md` (qué endpoint atiende cada paso) y `entities.md` (qué datos toca).

---

## Autenticación

### Login

**Actor:** Todos los perfiles (`Administrador`, `UnidadPatrimonial`, `Abogado`, `Incendios`, etc.) **excepto** `UsuarioApi`.

**Precondiciones:**
- Usuario registrado en tabla `Usuario`.
- `Usuario.Activo = true`.

**Pasos:**
1. Usuario accede a `GET /Account/Login` (`AccountController.Login`).
2. Visualiza formulario con Email y Password.
3. Envía `POST /Account/Login` con credenciales.
4. Sistema valida:
   - Correo existe en `Usuario` (búsqueda por `CorreoElectronico`).
   - Si no existe → "¡El correo electrónico no está registrado!"
   - Si `Activo=false` → "¡La cuenta está desactivada…" y registra `AuditoriaUsuario.EstadoLogin=CuentaDesactivada`.
   - Si `Perfil=UsuarioApi` → rechaza login.
   - Desencripta contraseña con `CryptographyHelper.Decrypt()` usando clave GUID fija (`a392ef91-db60-4a3c-918d-7bb30187e21a`).
   - Si no coincide → registra `AuditoriaUsuario.EstadoLogin=ContrasenaIncorrecta`.
5. Si valida:
   - Crea `ClaimsIdentity` con: `Name`, `Role` (Perfil), `Email`, `SerialNumber` (RUT), `Actor` (UsuarioId), `PrimarySid` (EmpresaId), `MobilePhone`.
   - `HttpContext.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme)`.
   - Registra `AuditoriaUsuario.EstadoLogin=LoginCorrecto` + IP.
   - Redirige a `Home/Index` o `returnUrl`.

**Entidades:**
- CREATE: `AuditoriaUsuario`.
- READ: `Usuario`.

**Validaciones:**
- Correo requerido y existente.
- Contraseña coincide tras desencriptar.
- Cuenta activa.
- Perfil no es `UsuarioApi`.

**Efectos colaterales:**
- Auditoría de intentos (éxito y fallo) en `AuditoriaUsuario` con IP.
- **Bug detectado:** si usuario es `null`, podría fallar al registrar auditoría si la validación null se hace tarde.

### Logout

**Pasos:**
1. `GET /Account/Logout` → `HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme)`.
2. Cookie invalidada.
3. Redirige a `Account/Login`.

### Recuperación de password

No encontrado flujo explícito en el legacy. No hay `ForgotPassword`, `ResetPassword`, o similar. En SURP 2.0 hay que implementar flujo completo.

### Bloqueo de cuenta

No hay bloqueo automático por intentos fallidos en el legacy — se registra el fallo en `AuditoriaUsuario` pero no hay contador ni `locked_until`. En SURP 2.0 hay que implementarlo.

---

## Incidentes

### Crear incidente

**Actor:** `UnidadPatrimonial` o `UnidadPatrimonialAdministrador` (guardias de empresa contratista, o personal de Arauco).

**Precondiciones:**
- Al menos un predio existente.
- Zona y Área activas.

**Pasos:**
1. `GET /Incidentes/Create` (`IncidentesController.Create`) — carga catálogos de zonas, áreas, predios, tipos de incidente.
2. Completa:
   - `TipoIncidente` (enum: Robo, Hurto, Incendio, TalaIlegal, etc.).
   - `FechaTomaConocimiento` (requerido).
   - `Relato` (descripción).
   - Selección de predio (genera `IncidentePredio`).
   - Datos de portón (existencia, condición, estado).
3. `POST /Incidentes/Create` valida tipo y fecha requeridos.
4. Sistema:
   - Crea `Incidente` con `AddUserId`, `AddDate`, `Activo=true`.
   - Genera `Numero` correlativo y `Codigo` (ej. "INC-2024-00123").
   - Crea `IncidentePredio`.
   - `Semaforo` posiblemente null o default.
   - Redirige a `Edit` para enriquecer (fotos, bienes, denuncia).

**Entidades:**
- CREATE: `Incidente`, `IncidentePredio`.
- READ: `Predio`, `Area`, `Zona`.

**Estado:** antes no existe → después `Activo=true`, sin denuncia.

**Validaciones:**
- `TipoIncidente` requerido ("Debe seleccionar el tipo de delito…").
- `FechaTomaConocimiento` requerida.
- Al menos un predio asociado.

**Efectos colaterales:**
- Fotos en Azure Blob Storage (contenedor `surpreportes`).
- `Codigo` único del incidente usado en reportes.

### Editar incidente

**Pasos:**
1. `GET /Incidentes/Edit/{id}` carga con predios, bienes, fotos, denuncias.
2. Desde Edit puede:
   - Agregar **bien afectado** (`IncidenteBienAfectadosController.Create`).
   - Adjuntar evidencia (`FotosController.Create`).
   - Levantar denuncia (`DenunciasController.Create`).
   - Vincular vehículo / persona (indirecto vía denuncia).
3. `POST /Incidentes/Edit` → `_context.Update(incidente)` + `SaveChangesAsync()` actualiza `ChgUserId`, `ChgDate`.

### Cerrar / archivar incidente

**Pasos:**
1. En Edit, cambiar `Activo=false` o `Semaforo`.
2. `POST Delete` (`DeleteConfirmed`):
   - Intenta remover.
   - Si FK bloquea → marca `Activo=false` ("si trae error que cambie el estado a falso" según comentario del código).

**Problema:** lógica de cierre débil — no hay enum de estado claro ("Abierto/EnProceso/Cerrado"), solo `Activo` bool + `Semaforo`. Inconsistencia con el modelo mental de workflow.

### Vincular predio al incidente

**Pasos:**
1. En Create/Edit selector `Zona → Área → Predio`.
2. Crea `IncidentePredio(IncidenteId, PredioId, ExistePorton, CondicionPorton, EstadoPorton)`.
3. `DELETE /Incidentes/DeletePredio/{incidenteId}/{predioId}` — soft delete si FK bloquea, hard delete si no.

### Adjuntar evidencia (fotos / documentos)

**Pasos:**
1. `GET /Fotos/Create?incidenteid={id}`.
2. Sube `IFormFile` con `Nombre`, `Observacion`, `TiposEvidencia` (Fotografía, DocumentoEscrito, etc.).
3. Archivo a Azure Blob (`surpreportes`).
4. Crea `Foto(IncidenteId, Url, AzureNombre, TiposEvidencia, Activo=true)`.
5. Análogo para `Evidencia` en contenedor `surpevidencias`.

### Asignar vehículo / persona al incidente

Indirecto vía denuncia:
1. Crear denuncia desde incidente.
2. En Edit de denuncia vincular `DenunciaImputado`, `DenunciaTestigo`, `DenunciaVehiculo`.
3. Acciones en `PersonasController.Create` y `VehiculosController.Create`.

---

## Denuncias

### Levantar denuncia desde incidente

**Actor:** `Abogado`, `AbogadoTerreno`, `UnidadPatrimonial`.

**Precondiciones:** incidente existente (`IncidenteId` no nulo) o `IncidenteExterno`.

**Pasos:**
1. `GET /Denuncias/Create?idincidente={IncidenteId}`.
2. Carga incidente + selectores:
   - `Institucion` (enum: Carabineros, PDI, Fiscalia, SinDenuncia).
   - `UnidadPolicial` (dinámico según institución).
   - `Fiscalia` (si institución es Fiscalía).
3. Completa:
   - `NumeroDeDenuncia` (ej. "Oficio 2024-1234").
   - `Fecha`.
   - `SeguimientoPenal` (si pasa a etapa penal).
4. `POST /Denuncias/Create`:
   - Si `Institucion != SinDenuncia` requiere `UnidadPolicialId` o `FiscaliaId`.
   - Si `SeguimientoPenal=true` asigna `FechaSeguimientoPenal=DateTime.Now`.
5. Crea `Denuncia(IncidenteId, Institucion, NumeroDeDenuncia, Fecha, Activo=true)`.
6. Redirige a Edit.

**Estado:** antes no existe → después `DenunciaId` asignado, sin imputados aún.

**Validaciones:** número, institución y fecha requeridos; institución requiere unidad o fiscalía.

### Registrar número de parte policial

En Edit de denuncia, campo `NumeroDeDenuncia` (ej. "2024-CAR-0045"). Debería ser único por institución pero no hay constraint en BD.

### Asociar imputados, testigos, víctimas

**Imputados:**
1. En Edit → "Agregar Imputado" → `GET /Personas/Index?iddenuncia={DenunciaId}&from=imputado`.
2. DataTable de personas no vinculadas.
3. Selección → `POST /DenunciaImputados/Create` → crea `DenunciaImputado(DenunciaId, PersonaId, Activo=true)`.

**Testigos:** similar con `from=testigo` → `DenunciaTestigo`.

**Víctimas:** no existe entidad explícita `DenunciaVictima`. Se maneja (si acaso) con `Persona` marcada como víctima. Gap funcional — tal vez por eso no se usan formalmente en el legacy.

---

## Causas judiciales

### Crear causa desde denuncia

**Actor:** `Abogado`, `AbogadoAdministrador`.

**Precondiciones:** denuncia existe; hay al menos un imputado o bien afectado registrado.

**Pasos:**
1. `GET /Causas/Create?iddenuncia={DenunciaId}&from=denuncia`.
2. Carga denuncia + incidente.
3. Completa:
   - `Ruc` (ej. "2024000123").
   - `Rit` (ej. "2024-00123").
   - `TipoDelito` (pre-llenado desde incidente).
   - `Fiscal`, `Fiscalia`, `Tribunal`.
   - `FechaCausa`.
   - `EstadoCausa` (enum: `Vigentedesformalizada`, `Vigenteformalizada`, etc.).
   - `Observacion`.
4. `POST /Causas/Create` crea `Causa(DenunciaId, Ruc, Rit, TipoDelito, EstadoCausa, Activo=true)`.
5. Redirige a Edit.

**Estado:** antes no existe → después `CausaId` asignado.

### Asignar abogado

**Actor:** `AbogadoAdministrador`.

**Pasos:**
1. En Edit Causa → `GET /AbogadoCausas/Create?causaid={CausaId}`.
2. Selector de abogados (usuarios con perfil `Abogado`, `AbogadoTerreno`, `AbogadoAdministrador`).
3. Crea `AbogadoCausa(CausaId, AbogadoId=UsuarioId, Activo=true)`.
4. Permite múltiples abogados por causa.

**Nota:** no hay validación "no duplicados" explícita en el código — la PK compuesta `(AbogadoId, CausaId)` evita duplicados a nivel BD, pero la UI no previene el intento.

### Registrar hitos de causa

**Pasos:**
1. En Edit Causa → `GET /Hitos/Create?causaid={CausaId}`.
2. Completa:
   - `TipoHito` (Judicial, Fiscalia, Administrativo).
   - `NombreHito` (Audiencia, Querella, Fallo, Requerimiento, etc. — 70+ valores).
   - `Fecha`.
   - `Detalle`.
3. Crea `Hito(CausaId, TipoHito, NombreHito, Fecha, Detalle, Activo=true)`.
4. Aparece en calendario de `Home/Abogados` (FullCalendar):
   - Judicial: azul.
   - Fiscalía: naranja.
   - Administrativo: verde.

### Cerrar causa

**Pasos:**
1. En Edit: `EstadoCausa=Terminada`, `FormaTermino` (Absolución, Condena, etc.), `FechaTermino`.
2. `Activo=true` (append-only; no se borra, se mantiene como histórico).

### Registrar sentencia / resolución

**Pasos:**
1. En Edit Causa → `GET /Resoluciones/Create?causaid={CausaId}`.
2. Completa:
   - `PersonaId` (sancionada).
   - `Fecha`.
   - `Resoluciones` (Condenado, Absuelto, etc.).
   - `AcuerdoReparaciones`, `Beneficios`.
   - `NroDias` (pena en días).
   - `Detalles`.
3. Crea `Resolucion(CausaId, PersonaId, Fecha, Resoluciones, …)`.
4. Si es condena, se puede marcar `Persona.Bloqueado=true` (posiblemente manual, no visto automatizado).

---

## Personas y Vehículos

### Crear persona

**Actor:** `UnidadPatrimonial` o `Abogado`.

**Pasos:**
1. `GET /Personas/Create` o `GET /Personas/Create?iddenuncia={id}`.
2. Completa:
   - `Rut` (regex `\d{1,8}-[K|k|0-9]`).
   - `Nombres`, `ApellidoPaterno`, `ApellidoMaterno` (solo letras, max 128).
   - `CorreoElectronico`, `Telefono1`, `Telefono2` (opcionales).
   - `Direccion` (max 256).
   - `DonacionMadera` (checkbox).
   - `Alias`, `Banda`, `Empresa` (si jurídica).
3. Crea `Persona(Rut, Nombres, ApellidoPaterno, ApellidoMaterno, Bloqueado=true, Activo=true)`.

**Importante:** **por defecto `Bloqueado=true`**. Requiere desbloqueo explícito con archivo.

**Validaciones:**
- RUT regex.
- Nombres solo letras.
- Teléfono formato (9 dígitos).
- Email regex.

### Marcar persona como bloqueada / desbloquear

**Bloqueo:** por default al crear.

**Desbloqueo:**
1. En Edit Persona sube `ArchivoDesbloqueo` (`IFormFile`).
2. `RazonDesbloqueo` documenta el motivo.
3. Archivo a Azure Blob (`surpunlock`).
4. `Persona.Bloqueado=false`.

### Crear vehículo

**Pasos:**
1. `GET /Vehiculos/Create` o desde denuncia.
2. Completa:
   - `Patente` (4 formatos regex: `[A-Z]{2}[0-9]{4}`, `[BCDFGH…]{4}[0-9]{2}`, etc.).
   - `TipoDeVehiculo` (Auto, Camión, Moto, etc.).
   - `Marca`, `Color`, `Modelo`.
   - `Chasis` (enum).
   - `AutoCargante`.
   - `FechaInscripcion`.
   - `PersonaId` (propietario opcional).
3. Crea `Vehiculo(Patente, TipoDeVehiculo, Marca, Color, Bloqueado=true, Activo=true)`.

**Importante:** igual que persona, `Bloqueado=true` por default.

**Validaciones:** patente regex, tipo requerido, marca y color requeridos.

### Desbloquear vehículo

Mismo patrón que persona: subir archivo a contenedor `surpunlock`, marcar `Bloqueado=false`.

---

## Consultas API externa

### `GET /entidad/{rut}` — verificación de persona por RUT

**Controller:** `PersonaController` (SURP.API).

**Autenticación:** headers `usr` (correo) y `pwd` (password). Valida contra tabla `Usuario` desencriptando con clave GUID fija.

**Lógica:**
```csharp
int bloqueado = await _context.Personas
  .Where(x => x.Rut == rut && x.Bloqueado)
  .CountAsync();
return Ok(bloqueado > 0);
```

**Retorna:**
- `200 OK` con `true/false`.
- `401 Unauthorized` si credenciales inválidas.

**Auditoría:** `AuditoriaPersonaApi(UsuarioId, Rut, TiempoRespuesta, Ip, Resultado)` vía `IFireForgetRepositoryHandler` (async no bloqueante).

### `GET /vehiculo/{patente}` — verificación de vehículo por patente

Idéntica estructura. Audita en `AuditoriaApi(UsuarioId, Patente, TiempoRespuesta, Ip, Resultado)`.

### `GET /araucaria/incidentes` — listado Araucaria

**Probablemente:** integración con sistema externo Araucaria. Devuelve lista completa ordenada por fecha sin paginación ni filtros de autorización finos. Es una de las vulnerabilidades más serias del legacy — expone toda la data de incidentes a cualquier cliente API autenticado.

---

## MAAT — Medios incautados / consulta de antecedentes

### Crear solicitud MAAT

**Actor:** Abogado (en la práctica, todos los usuarios de Arauco acceden — el controller no tiene `[Authorize]`).

**Pasos:**
1. `GET /Maat/Create`.
2. Completa `Solicitante`, `Negocio` (motivo).
3. Crea `SurpMaat(Solicitante, Negocio, FechaSolicitud=DateTime.Now, AddUserId)`.
4. Redirige a Edit.

### Asociar detalles, incidentes, vínculos

1. En Edit agrega `SurpMaatDetalle` (persona, bien, vínculo).
2. `SurpMaatDetalleIncidente` vincula a incidente.
3. `SurpMaatDetalleVinculo` vincula entre personas.

### Control de acceso

- `MaatController` **sin `[Authorize]`** — cualquier sesión autenticada (o no) accede.
- Exportación Excel con 90+ columnas incluyendo datos sensibles (RUTs, avalúos, protestos, deudas).

---

## Reportes y estadísticas

### Dashboard por perfil (`HomeController.Index`)

- `UnidadPatrimonial*` → vista `UnidadPatrimonial`: total incidentes/denuncias/causas últimos 5, filtros por zona/área/predio.
- `Abogado` / `AbogadoTerreno` → vista `Abogados`: calendario FullCalendar con hitos pendientes de sus causas.
- `AbogadoAdministrador` → vista `AbogadosJefe`: calendario con todos los hitos.
- `Consultas` → redirige a `Consultas/Bloqueos`.

### Estadísticas de incidentes (`Home/EstadisticasIncidentes`)

- Gráficos por zona (incidentes, denuncias, causas).
- Series mensuales.
- Filtros por zona, área, período.

---

## Mantenedores (catálogos CRUD)

| Catálogo | Administrador | Jerarquía | Uso |
|---------|--------------|-----------|-----|
| Regiones | Admin | — | Base geográfica |
| Provincias | Admin | Region → Provincia | Filtros externos |
| Comunas | Admin | Provincia → Comuna | Ubicación de predios/incidentes externos |
| Zonas | Admin | — (top-level interno) | Territorio forestal (Arauco, Constitución, etc.) |
| Áreas | Admin | Zona → Área | Subdivisión dentro de zona |
| Predios | Admin | Área → Predio | Terreno específico |
| Tipos de incidente | — (enum hardcodeado) | — | Clasificación |
| Instituciones | — (enum) | — | Carabineros, PDI, Fiscalía, SinDenuncia |
| Unidades policiales | Admin | Institución → Unidad | Unidad que recibe denuncia |
| Fiscalías | Admin | — | Fiscalía que investiga |
| Tribunales | Admin | — | Tribunal competente |
| Abogados | AbogadoAdministrador / Admin | — | Asignación a causas |
| Usuarios | Admin | — | Cuentas del sistema (11 perfiles) |
| Bienes afectados | Admin | — | Catálogo de tipos (madera aserrada, leña, etc.) |
| Empresas externas | Admin | — | Incidentes externos |

---

## Ciclo de vida completo: incidente grave (robo de madera → sentencia)

Se detecta robo de madera en un predio de Arauco. Interviene Carabineros, se identifica presunto autor, se formaliza causa, se condena.

### Día 1 — Reporte
1. 10:15 Guardia detecta robo en "Predio Los Robles" (Zona Arauco, Área Central).
2. `POST /Incidentes/Create`: Tipo=Robo, Fecha=23-04-2024 10:00, Relato, Predio.
3. Crea `Incidente(Codigo="INC-2024-00456")`.
4. Adjunta 5 fotos → `Foto(…, TiposEvidencia=Fotografia)` en `surpreportes`.
5. Bien afectado: `IncidenteBienAfectado(BienAfectadoId=Madera, Avaluo=5.000.000)`.

### Día 2 — Denuncia policial
1. Parte policial Carabineros "2024-CAR-0125".
2. Abogado: `POST /Denuncias/Create?idincidente=456` con `Institucion=Carabineros`, `UnidadPolicial=Carabineros Constitución`, `NumeroDeDenuncia=2024-CAR-0125`, `SeguimientoPenal=true`.
3. Crea `Denuncia(DenunciaId=789)`.
4. Imputado: `DenunciaImputado(DenunciaId=789, PersonaId=101)` — Juan Pérez, RUT 13.123.123-K.
5. Testigo: `DenunciaTestigo(…, PersonaId=102)` — guardia.
6. Vehículo: `DenunciaVehiculo(…, VehiculoId=45)` — pickup con madera.

### Día 7 — Fiscalía investiga
1. Fiscal de Constitución recibe antecedentes.
2. Hitos: `Hito(TipoHito=Fiscalia, NombreHito=SolicitaDiligenciasInvestigacion, 30-04-2024)`, `AccedeDiligencias` (10-05-2024).

### Día 30 — Formalización
1. `Hito(NombreHito=SolicitudFormalizacion, 20-05-2024)`.
2. Tribunal formaliza.
3. Abogado crea causa: `POST /Causas/Create` con `Ruc=2024CAR0000789`, `Rit=2024-00456`, `TipoDelito=Robo`, `EstadoCausa=Vigenteformalizada`.
4. Crea `Causa(CausaId=200, DenunciaId=789)`.
5. Asigna abogado: `AbogadoCausa(CausaId=200, AbogadoId=35)` — García.

### Meses 3-6 — Tramitación
- `Hito(Judicial, FijaAudiencia, 15-07)`, `Audiencia (10-08)`, `Requerimiento (15-08)`, `Alegatos (01-09)`, `Fallo (20-09)`.

### Día 180 — Sentencia
1. Sentencia: 3 años de presidio.
2. `POST /Resoluciones/Create`: PersonaId=101, `Resoluciones=Condenado`, `NroDias=1095`, `AcuerdoReparaciones=Pago indemnización`, `Detalles`.
3. Causa: `EstadoCausa=Terminada`, `FormaTermino=Condena`, `FechaTermino=20-09-2024`.

### Día 181 — Bloqueo en API
1. Sistema o admin marca `Persona.Bloqueado=true` con `RazonBloqueo`.
2. Guardia de Empresa X consulta: `GET /entidad/13.123.123-K` → `true` (bloqueado).
3. Vehículo: `GET /vehiculo/AB1234CD` → `true`.

### Entidades tocadas

| Entidad | Operación | Estado |
|---------|-----------|--------|
| Incidente | CREATE | Activo, sin denuncia |
| Foto | CREATE ×5 | Evidencias en Azure |
| IncidenteBienAfectado | CREATE | Madera $5M |
| Denuncia | CREATE | Carabineros, con parte |
| DenunciaImputado, DenunciaTestigo, DenunciaVehiculo | CREATE | Vínculos |
| Causa | CREATE → UPDATE | Desformalizada → formalizada |
| AbogadoCausa | CREATE | García asignado |
| Hito | CREATE ×8 | Timeline judicial |
| Resolucion | CREATE | Condena + indemnización |
| Persona | UPDATE | Bloqueado=true |
| Vehiculo | UPDATE | Bloqueado=true |
| AuditoriaPersonaApi / AuditoriaApi | CREATE | Consultas externas |

---

## Problemas detectados en los flujos

### Validaciones débiles / faltantes

- **Login** (`AccountController.cs:61-70`): se busca usuario por correo; validación de null se hace tras intentar crear auditoría. Si el usuario no existe, `userInfo.UsuarioId` puede generar NullReferenceException.
- **Denuncia sin institución:** el modelo permite `Institucion=SinDenuncia` sin `UnidadPolicialId/FiscaliaId`. La validación existe en el código (`DenunciasController.cs:374-388`) pero es inconsistente.
- **Incidente sin predio:** si el usuario no selecciona predio, el incidente se crea sin `IncidentePredio`. No hay constraint en BD.
- **Sin bloqueo de cuenta** tras intentos fallidos — solo registro en auditoría.
- **Sin recuperación de password** — no existe el flujo.

### Control de acceso débil

- **Denuncia Index** (`DenunciasController.cs:169-184`): para abogados, filtra denuncias de sus causas **o** que ellos crearon (`i.AddUserId == Usuario.UsuarioId`). Un abogado puede ver denuncias que creó pero de causas que no son suyas.
- **API autenticación:** credenciales en headers sin HTTPS enforcement, sin rate limiting, sin API keys reales.
- **MAAT sin `[Authorize]`.**
- Perfiles `Visor`, `Incendios`, `Seguimiento`, `Consultas` **no filtran por empresa** — ven todo.
- `IncidentesController`: filtro por `EmpresaId` **comentado** (PITFALL-B-020).

### Flujos incompletos / ramas muertas

- `Persona.OtraVinculacion` (bool) y `Persona.Vinculacion` (enum): sin UI que los llene o lógica que los use.
- `IncidentePredio.CondicionPorton` / `EstadoPorton`: se llena en create pero no aparece en reportes.
- `Persona.ArchivoPersona`: tabla de archivos sin UI clara.
- `Denuncia.SeguimientoPenal`: campo activo pero uso en vistas poco claro.
- `Querella` / `CausaQuerella`: entidades sin lógica propia — flujo de querella subregistrado.

### Encriptación / seguridad

- **Clave de password hardcodeada** `a392ef91-db60-4a3c-918d-7bb30187e21a`. Si el repo se expone, todas las contraseñas productivas son recuperables.
- **Auditoría API sin cifrado:** RUTs, patentes, IPs en texto plano. Fuga de datos si la BD se compromete.

### Datos inconsistentes

- **`Denuncia.FechaSeguimientoPenal`** se reasigna al actualizar `SeguimientoPenal` de false a true (`DenunciasController.cs:815-818`). Si se reactiva varias veces, la fecha se pierde.
- **`Causa.TipoDelito` vs `Incidente.TipoIncidente`** pueden divergir — el usuario puede crear una causa con tipo distinto al incidente de origen.
- **`Persona.Bloqueado=true` por default**: impide exposición accidental en API, pero si el usuario olvida desbloquear, queda como "bloqueada" sin serlo realmente.

### Errores de lógica

- **Delete incidente** (`IncidentesController.cs:1056-1070`): si FK bloquea, marca `Activo=false`. El ID sigue vivo; puede reaparecer.
- **Clase "Personas"** (`SACLContext.cs:1333-1336`): clase interna huérfana `public partial class Personas { public virtual ICollection<Persona> Personitas { get; set; } }`. Parece resto de refactor incompleto.

### Performance / escalabilidad

- **`DenunciasController.GetTable()`**: 20+ includes, luego filtra en memoria. Para 100k denuncias es lento.
- **`CausasController.Index()`**: 15+ includes, filtrado post-query parcial.
- **`PersonasController.GetTable()`**: `.Except()` en memoria trayendo todas las personas.

### Autorizaciones faltantes

- `ConsultasController` (`/Consultas/Bloqueos`) accede sin matriz clara de permisos (perfil `Consultas` supuestamente; a confirmar).
- `FotosIncidenteExternos` y `Fotos` tienen políticas diferentes — fotos externas sin auditoría.

### Integraciones externas

- **MAAT** (servicio externo de antecedentes): API key no documentada, sin timeout explícito visible. Si el servicio cae, SURP puede colgar.
- **Azure Blob Storage:** 4 contenedores (`surpreportes`, `surpcert`, `surpunlock`, `surpguias`). Sin fallback local si Azure falla.
- **Araucaria:** endpoint externo probablemente read-only, sincronización poco clara.

---

## Resumen ejecutivo

El SURP es un **workflow judicial forestal** en 4 etapas:

1. **Detección** — Guardia registra incidente (fotos, ubicación, bienes).
2. **Investigación** — Abogado levanta denuncia → vincula institución + personas.
3. **Procedimiento** — Fiscal formaliza → Tribunal convoca → hitos judiciales.
4. **Sentencia** — Tribunal condena → persona/vehículo bloqueado para consultas API.

**Fortalezas:** auditoría de logins, trazabilidad Add/Chg, integración con instituciones, API de consulta externa.

**Debilidades:** validaciones débiles, control de acceso inconsistente, clave hardcodeada, performance con muchos includes, funcionalidad muerta, MAAT sin autorización, API sin rate limit.

**Riesgos críticos:**
1. Credenciales de API en headers sin SSL enforcement.
2. `/araucaria/incidentes` expone lista completa.
3. Clave de password hardcodeada.
4. `MaatController` sin `[Authorize]`.
5. Abogados ven denuncias que crearon aunque no estén asignados a la causa.
