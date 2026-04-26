# LEGAL-INVARIANTS-INCIDENTS.md — Invariantes legales del dominio de incidentes

> **Uso:** referencia canónica de invariantes legales para los módulos `incidents`, `complaints`, `cases`, `persons`, `vehicles` y `surveillance`. Toda definición de entidad, DTO o use case en esos módulos debe ser consistente con este documento. Contradicciones entre el código y este documento se resuelven a favor del documento (y si el documento está equivocado, se corrige aquí antes de tocar el código).
>
> **Fuente:** validación realizada el **2026-04-24** mediante lectura de las skills `/legal`, `/legal-procesal`, `/legal-penal`, `/legal-armas-vigilantes`, `/legal-datos`. Los _open questions_ listados al final **no bloquean el MVP** pero deben resolverse con el abogado URP antes de cerrar cada módulo.
>
> **Disclaimer legal:** este documento NO es asesoría legal. Cita normas y doctrina tal como aparecen en las skills internas del proyecto; cualquier decisión operativa debe ser refrendada por el abogado de la URP.

---

## 1. Nomenclatura de roles procesales

### 1.1 Regla

El legacy distingue `Denunciado` (señalado en denuncia) e `Imputado` (señalado en causa formalizada). La distinción es **procesalmente correcta** pero genera duplicación de entidades. SURP 2.0 unifica:

- Identidad física de la persona → `parties` (tabla única de RUTs, ver `project_unified_rut_registry.md`).
- Rol procesal de la persona respecto a un incidente/causa → campo `procedural_role` en la tabla pivote.

### 1.2 Enum canónico `procedural_role`

| Valor                  | Momento                                                 | Transición desde                   |
| ---------------------- | ------------------------------------------------------- | ---------------------------------- |
| `denounced`            | Señalado en una denuncia (aún no hay causa formalizada) | estado inicial                     |
| `complained_against`   | Señalado en una querella                                | `denounced` o inicial              |
| `suspect`              | Investigado por Fiscalía sin formalización              | `denounced` / `complained_against` |
| `formalized_defendant` | Formalizado (CPP art. 229)                              | `suspect`                          |
| `accused`              | Con acusación presentada (CPP art. 248 letra b)         | `formalized_defendant`             |
| `convicted`            | Sentencia condenatoria firme                            | `accused`                          |
| `acquitted`            | Sentencia absolutoria firme                             | `accused`                          |
| `witness`              | Testigo                                                 | independiente                      |
| `victim`               | Víctima                                                 | independiente                      |
| `informant`            | Denunciante                                             | independiente                      |

### 1.3 Base legal

- CPP art. 7 (calidad de imputado, adquirida desde primera actuación del procedimiento dirigida en su contra).
- CPP art. 229 (formalización).
- CPP art. 12 (intervinientes).

### 1.4 Invariante de implementación

Un `party_id` puede tener **múltiples roles** respecto a distintos incidentes/causas, pero **solo uno activo** en cada `case_id`. El histórico de transiciones es append-only en `case_party_role_history` (fecha, rol anterior, rol nuevo, autor, motivo, hito que lo motivó).

---

## 2. Querella contra quien resulte responsable

### 2.1 Regla

Arauco presenta muchas querellas **sin individualizar al querellado** (arts. 113 y 114 CPP). El schema debe permitir querellas contra incertus.

### 2.2 Esquema

En `case_parties`:

- `party_id BIGINT NULL` — se completa cuando se identifica.
- `unidentified_description TEXT NULL` — descripción física / modus operandi / apodo.
- `identification_pending BOOLEAN NOT NULL DEFAULT false` — se marca true cuando la querella es contra incertus.
- Regla CHECK: `identification_pending = true` ⇒ `party_id IS NULL AND unidentified_description IS NOT NULL`.

### 2.3 Base legal citada en skills

- CPP art. 113 (requisitos de admisibilidad de la querella).
- CPP art. 114 (inadmisibilidad) — **la skill no desarrolla el supuesto contra incertus**. Tratado como práctica forense aceptada; validar con abogado URP.

### 2.4 Hito append-only

Cada identificación posterior (cuando se logra nombrar al querellado) se registra como `case_milestones(type='unidentified_defendant_identified', data={before_description, after_party_id, identified_by_user_id})`.

---

## 3. Plazos procesales para el motor de reglas

Estos plazos alimentan el módulo `rules` (motor de sugerencias admin-configurable). **No son reglas duras del código** — se cargan como seed editable en `suggestion_rules.criteria` y el abogado URP puede ajustarlos.

| Concepto                                  | Plazo                        | Norma                      | Alerta recomendada            |
| ----------------------------------------- | ---------------------------- | -------------------------- | ----------------------------- |
| Prescripción — crímenes con pena perpetua | 15 años                      | CP art. 94                 | 90 días antes del vencimiento |
| Prescripción — demás crímenes             | 10 años                      | CP art. 94                 | 90 días antes del vencimiento |
| Prescripción — simples delitos            | 5 años                       | CP art. 94                 | 90 días antes del vencimiento |
| Prescripción — faltas                     | 6 meses                      | CP art. 94                 | 15 días antes del vencimiento |
| Investigación formalizada (máx.)          | 2 años                       | CPP art. 234               | 60 días antes                 |
| Decisión post-cierre de investigación     | 10 días                      | CPP art. 248               | 3 días antes                  |
| Denuncia obligatoria (jefe de empresa)    | 24 horas desde conocimiento  | CPP art. 175 letra e + 176 | al conocerse el hecho         |
| Detención policial sin orden judicial     | máx. 24 horas                | CPP art. 131               | — (no es alerta SURP)         |
| Acción civil deducida en sede penal       | hasta 15 días antes de APJO  | CPP art. 60                | 30 días antes de APJO         |
| Prescripción acción civil indemnizatoria  | 4 años desde la perpetración | CC art. 2332               | 90 días antes                 |
| Reclamación administrativa CONAF          | 30 días                      | Ley 20.283 art. 24         | 5 días antes                  |

### 3.1 Cómputo y suspensión de la prescripción

- Cómputo: desde la comisión del delito (CP art. 95).
- Suspensión: desde que el procedimiento se dirige contra el imputado (CP art. 96).
- **Discrepancia terminológica** entre las skills `/legal-penal` ("interrupción") y `/legal-procesal` ("suspensión"). Efecto práctico distinto. Tratado como **open question #13** — usar "suspensión" según texto legal hasta resolver.

### 3.2 Open questions sobre plazos

Los siguientes plazos **no están cubiertos por las skills** y se dejan como configurables:

- Plazo para formalizar tras primera actuación (CPP art. 186). → open question #2.
- Plazo para que la víctima se constituya en querellante (CPP art. 261). → open question #3.
- Plazo del procedimiento abreviado (CPP arts. 406-415). → open question #4.

---

## 4. Denuncia vs querella — datos obligatorios y representación

### 4.1 Denuncia (CPP arts. 173-178)

Campos obligatorios en `complaints`:

- `denouncer_party_id` — identificación del denunciante.
- `facts TEXT NOT NULL` — narración circunstanciada del hecho.
- `filed_at` — fecha y hora.
- `institution_id` — receptor (Carabineros / PDI / Fiscalía / Tribunal).
- `filed_by_legal_obligation BOOLEAN DEFAULT false` — marcar true cuando Arauco denuncia cumpliendo el art. 175 letra e (jefe de empresa).

Campos opcionales:

- `suspects` (array de `party_id` o descripción).
- `witnesses` (array de `party_id`).

**No requiere abogado patrocinante.** La denuncia puede ser verbal o escrita.

### 4.2 Querella (CPP art. 113)

Campos obligatorios en `cases` al momento de constituirse querella:

- `court_id` — tribunal competente (designación).
- `plaintiff_party_id` — querellante (Arauco S.A.).
- `represented_by_person_id` — representante legal de Arauco (persona natural con poder).
- `patron_attorney_id` — abogado patrocinante (Ley 18.120).
- `defendants` (via `case_parties`, pueden ser NULL si contra incertus, ver sección 2).
- `facts TEXT NOT NULL` — relación circunstanciada del hecho.
- `requested_diligences TEXT NOT NULL` — diligencias solicitadas.
- `filed_at`.
- `signature_hash` — hash de la firma digital o foliada del escrito.

### 4.3 Persona jurídica querellante (Arauco S.A.)

La skill no desarrolla la representación orgánica. Por práctica y CPC art. 8:

- `represented_by_person_id` apunta a la persona natural con poder notarial vigente.
- `patron_attorney_id` apunta al abogado (debe estar habilitado y con poder).
- Un `legal_powers_of_attorney` (tabla aparte) registra poderes vigentes con fecha de emisión y revocación.

Tratado como **open question #7** en detalle.

---

## 5. Estados y hitos de causas penales

### 5.1 Estados (máquina de estados `case_state`)

**Estados intermedios (no terminales):**

| Estado                       | Norma                | Transiciones salientes                                                                                                |
| ---------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `unformalized_investigation` | CPP arts. 79-83      | → `formalized_investigation`, `provisional_archiving`, `no_perseverance`, `temporary_dismissal`, salidas alternativas |
| `formalized_investigation`   | CPP arts. 229, 234   | → `closed_investigation`, salidas alternativas                                                                        |
| `closed_investigation`       | CPP arts. 247-248    | → `accused`, `no_perseverance`, `definitive_dismissal`                                                                |
| `accused`                    | CPP art. 248 letra b | → `in_hearing_preparation`                                                                                            |
| `in_hearing_preparation`     | CPP arts. 260-280    | → `in_oral_trial`, `in_abbreviated_procedure`, `in_simplified_procedure`                                              |
| `in_oral_trial`              | CPP arts. 281-351    | → `sentence_condemnatory`, `sentence_acquitting`                                                                      |
| `in_abbreviated_procedure`   | CPP arts. 406-415    | → `sentence_condemnatory`, `sentence_acquitting`                                                                      |
| `in_simplified_procedure`    | CPP arts. 388-399    | → `sentence_condemnatory`, `sentence_acquitting`                                                                      |

**Estados terminales:**

| Estado                                             | Norma             | Reversible                                             |
| -------------------------------------------------- | ----------------- | ------------------------------------------------------ |
| `sentence_condemnatory`                            | CPP arts. 339-351 | No (firme tras recursos)                               |
| `sentence_acquitting`                              | CPP arts. 339-351 | No                                                     |
| `definitive_dismissal` (sobreseimiento definitivo) | CPP arts. 250-252 | No                                                     |
| `conditional_suspension_completed`                 | CPP art. 237      | No (cumplidas condiciones → sobreseimiento definitivo) |
| `reparatory_agreement_approved`                    | CPP art. 241      | No (extingue responsabilidad penal)                    |

**Estados suspensivos (reversibles):**

| Estado                                          | Norma                                                      | Reapertura                  |
| ----------------------------------------------- | ---------------------------------------------------------- | --------------------------- |
| `temporary_dismissal` (sobreseimiento temporal) | CPP arts. 250-252                                          | Al desaparecer el obstáculo |
| `provisional_archiving` (archivo provisional)   | CPP art. 167 _(no citado por la skill — open question #8)_ | Con nuevos antecedentes     |
| `no_perseverance` (decisión de no perseverar)   | CPP art. 248 letra c                                       | Con antecedentes nuevos     |

### 5.2 Hitos obligatorios (append-only en `case_milestones`)

El legacy ya modela `Hito` — se traslada a `case_milestones` con tipo normalizado. Los hitos mínimos obligatorios son:

1. `formalization` — formalización (CPP art. 229).
2. `investigation_closed` — cierre de investigación (CPP art. 247).
3. `prosecution_decision` — acusación / no perseverar / sobreseimiento (CPP art. 248).
4. `preparation_hearing` — audiencia de preparación (APJO).
5. `oral_trial` — juicio oral.
6. `sentence_read` — lectura de sentencia.
7. `sentence_final` — sentencia firme.
8. `appeal_filed`, `appeal_resolved` — recursos.

Hitos adicionales relacionados con acción civil (CPP art. 60 y CC art. 2332):

- `civil_action_filed`, `civil_amount_claimed`, `civil_amount_awarded`, `civil_amount_collected`.

### 5.3 Salidas alternativas — resolución, no estado

Las salidas alternativas se modelan como **resoluciones** que causan transición a estado terminal o suspensivo, con sus campos específicos:

- `conditional_suspension` (CPP art. 237) → estado `conditional_suspension_active` mientras corren condiciones, luego `conditional_suspension_completed` (terminal) o retorno a `formalized_investigation` si incumple.
- `reparatory_agreement` (CPP art. 241) → estado `reparatory_agreement_approved` (terminal).
- `opportunity_principle` (CPP art. 170) → tratamiento definitivo como estado abierto — **open question #9**.

---

## 6. Salidas alternativas — campos del schema

### 6.1 Suspensión condicional (CPP art. 237)

**Requisitos:**

- Pena probable ≤ **3 años** privación de libertad.
- Imputado **sin condena anterior** por crimen o simple delito.
- Condiciones por **1 a 3 años**.

**Campos:**

```
conditional_suspensions (
  case_id,
  expected_penalty_months INT NOT NULL CHECK (expected_penalty_months <= 36),
  defendant_prior_convictions_count INT NOT NULL CHECK (defendant_prior_convictions_count = 0),
  conditions TEXT[] NOT NULL,
  condition_period_months INT NOT NULL CHECK (condition_period_months BETWEEN 12 AND 36),
  conditions_start_date DATE NOT NULL,
  conditions_end_date DATE GENERATED,
  compliance_status ENUM('active','completed','breached'),
  approved_by_judge_at TIMESTAMPTZ NOT NULL
)
```

### 6.2 Acuerdo reparatorio (CPP art. 241)

**Requisitos:**

- Afecta **bienes jurídicos disponibles de carácter patrimonial**, **lesiones menos graves** o **delitos culposos**.
- No hay interés público prevalente.

**Procedencia para robo de madera:** **sí**, la skill `/legal-procesal` afirma literalmente _"en hurtos forestales de baja cuantía y sin reincidencia, el acuerdo reparatorio es habitual"_. El juez pondera interés público (reincidencia, Ley 21.577 crimen organizado puede frustrarlo).

**Campos:**

```
reparatory_agreements (
  case_id,
  affected_juridical_good ENUM('patrimonial_disposable','minor_injuries','culpable'),
  reparation_amount NUMERIC(14,2) NOT NULL,
  reparation_currency CHAR(3) DEFAULT 'CLP',
  reparation_paid_at TIMESTAMPTZ,
  public_interest_objection BOOLEAN DEFAULT false,
  public_interest_objection_reason TEXT,
  approved_by_judge_at TIMESTAMPTZ
)
```

### 6.3 Principio de oportunidad (CPP art. 170)

La skill no desarrolla umbrales. **Open question #9** — dejar enum abierto `case_disposition_type` que incluya `opportunity_principle` y confirmar con abogado URP umbrales de pena mínima y criterio de "no comprometer gravemente el interés público".

---

## 7. Coordinación Carabineros / PDI / Fiscalía y RUC

### 7.1 Regla

Legalmente el CPP art. 173 permite denunciar ante cualquiera de: **Ministerio Público, Carabineros, PDI, Gendarmería, tribunales con competencia criminal**. No hay preferencia legal.

Las políticas operativas (umbrales de cuándo presentar querella, cuándo escalar a PDI vs Carabineros) son **protocolo URP** — se registran en el módulo `rules` (motor de sugerencias admin-configurable), nunca hardcodeadas. La skill `/legal` explícitamente deja esto fuera y pide integrarlo al proyecto (tratado como **open question #18**).

### 7.2 RUC (Rol Único de Causa)

- Lo asigna la **Fiscalía** — schema: `cases.ruc VARCHAR NULL`.
- Momento exacto de asignación (¿al recibir denuncia o al formalizar?) — **open question #10**. Por ahora nullable; se actualiza cuando la Fiscalía lo comunique.

### 7.3 RIT (Rol Interno del Tribunal)

- Lo asigna el **Tribunal** cuando hay judicialización — schema: `cases.rit VARCHAR NULL`.

---

## 8. Tipificación penal del dominio forestal

### 8.1 Catálogo de tipos candidatos

| Tipo candidato                                                                 | Norma                               | Pena                                     | Cuándo aplica                                                                    |
| ------------------------------------------------------------------------------ | ----------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------- |
| **Hurto simple**                                                               | CP arts. 432, 446                   | Escalonada por UTM                       | Sustracción sin fuerza ni violencia                                              |
| **Hurto de madera**                                                            | CP art. 446 + Ley 21.013            | Agravada                                 | Productos forestales de predios forestales                                       |
| **Robo con fuerza en lugar no habitado**                                       | CP art. 442                         | Presidio menor medio-máximo              | Acceso con fuerza en las cosas                                                   |
| **Robo en bienes nacionales de uso público o sitio no destinado a habitación** | CP art. 443                         | Presidio menor medio-máximo              | Predios no habitados                                                             |
| **Robo de madera en pie / plantaciones / productos forestales**                | CP art. 443 inc. final (Ley 21.013) | Presidio menor medio-máximo + agravantes | Figura típica forestal                                                           |
| **Usurpación**                                                                 | CP arts. 457-462 (mod. Ley 21.633)  | Ver `/legal-tomas`                       | Ocupación del predio                                                             |
| **Alteración de deslindes**                                                    | CP art. 462                         | Presidio menor mínimo + multa 11-20 UTM  | Mover cercos / hitos                                                             |
| **Daños**                                                                      | CP arts. 484-488                    | Varía                                    | Tala sin sustraer (árboles derribados y abandonados)                             |
| **Receptación**                                                                | CP art. 456 bis A                   | Hasta 4 UTM+                             | Recibir / transportar / comercializar madera ilícita                             |
| **Infracción Ley 20.283**                                                      | Ley 20.283 art. 22                  | Multa 5-10× valor comercial              | Corta sin plan de manejo — **sanción administrativa CONAF**, paralela a lo penal |

### 8.2 Criterio madera extraída vs derribada

La skill lo dice explícito: _"el módulo de incidentes debe distinguir si la madera fue **extraída** (hurto/robo) o solo **derribada** (daños)"_. Se implementa como:

- `incidents.timber_fate ENUM('extracted','felled_only','partially_extracted','unknown')`.
- La tipificación sugerida por el motor de reglas depende de este campo.

### 8.3 Agravantes específicas

Catálogo cerrado en `incidents.aggravating_factors JSONB`:

| Código                     | Descripción                | Norma                                                                        |
| -------------------------- | -------------------------- | ---------------------------------------------------------------------------- |
| `motorized_vehicle_used`   | Uso de vehículo motorizado | CP art. 443 inc. final (Ley 21.013)                                          |
| `chainsaw_used`            | Motosierra                 | CP art. 443 inc. final (Ley 21.013)                                          |
| `crane_used`               | Grúa / cargador frontal    | CP art. 443 inc. final (Ley 21.013)                                          |
| `multiple_offenders`       | 2+ partícipes              | CP art. 443 inc. final (Ley 21.013)                                          |
| `fence_breach`             | Violación de cerco         | CP art. 442                                                                  |
| `animal_rustling`          | Abigeato agravado          | CP art. 448 ter                                                              |
| `possible_organized_crime` | Indicios Ley 21.577        | Ley 21.577 — **no es agravante automática**; flag que alimenta investigación |

**Open questions #11 y #12** — agravante penal específica por bosque nativo (no existe en CP, solo sanción administrativa Ley 20.283) y reglas de reincidencia genérica (CP art. 12) no cubiertas por las skills.

---

## 9. Atribuciones de las empresas de seguridad (DL 3.607, OS-10, Ley 17.798)

### 9.1 Regla general

Arauco opera con **empresas de seguridad externas** (Green America, Maxcon, Tralkan). La skill `/legal-armas-vigilantes` establece:

- Guardias tienen **atribuciones limitadas**: control de acceso en recintos cerrados, detención en flagrancia (CPP art. 129), entrega inmediata a fuerza pública.
- **No pueden interrogar.**
- **No pueden registrar** más allá de asegurar ausencia de armas.
- **Guardia/nochero/portero/rondín** regularmente **no están autorizados a portar armas**. Solo vigilantes privados acreditados con permiso individual (Ley 17.798).

### 9.2 Eliminación del modo "chilean_id" del scanner móvil

La decisión de **eliminar el modo `chilean_id`** del scanner (ADR-F-014 revisado) se funda en:

- DL 3.607 no otorga facultad de exigir identificación.
- CPP art. 85 (control de identidad) es facultad **policial**, no del guardia _(la skill no cita el art. 85 explícitamente — open question #14)_.
- Ley 21.719 art. 16 prohíbe tratamiento de datos sensibles sin base de licitud suficiente.

Los RUTs se ingresan a mano con validación módulo 11. El módulo 11 se ejecuta localmente en el backend — no hay llamada externa al Servicio de Registro Civil.

### 9.3 Uso de fuerza

- Legítima defensa completa — CP art. 10 N° 6.
- Cumplimiento del deber — CP art. 10 N° 10.
- Principios de **necesidad + proporcionalidad + subsidiariedad**.
- Fuerza letal solo bajo requisitos estrictos del art. 10 N° 6.

### 9.4 Modelado

En `surveillance`:

- `patrol_incident_reports.force_used BOOLEAN`.
- `force_type ENUM('none','physical','warning_shot','weapon_drawn','lethal')`.
- `force_justification ENUM('legitimate_defense','duty','refusal_to_cooperate','none')`.
- `weapons_carried_declared BOOLEAN` (registro — no se auto-permite).
- **Open question #15** — régimen del vigilante interno (hipotético empleado Arauco) vs contratado bajo DL 3.607. Asumir tratamiento equivalente hasta resolver.

---

## 10. Protección de datos personales (Ley 21.719)

### 10.1 Base de licitud por propósito

Ranking de bases de licitud para SURP 2.0, según skill `/legal-datos`:

| Propósito                                              | Base principal                         | Base secundaria               |
| ------------------------------------------------------ | -------------------------------------- | ----------------------------- |
| Denuncia obligatoria jefe de empresa (CPP 175 letra e) | **Obligación legal** (art. 12 letra b) | —                             |
| Respuesta a requerimiento de Fiscalía / Tribunal       | **Obligación legal** (art. 12 letra b) | —                             |
| Tratamiento de datos de imputados y vinculados         | **Interés legítimo** (art. 12 letra f) | Requiere LIA documentado      |
| Datos de trabajadores y contratistas                   | **Ejecución de contrato**              | —                             |
| Denunciante/testigo voluntario                         | **Consentimiento**                     | Poco aplicable en la práctica |

### 10.2 Test de balanceo (LIA) obligatorio

Cuando la base es interés legítimo, se exige **Legitimate Interest Assessment documentado**:

```
legitimate_interest_assessments (
  id,
  processing_purpose_code,
  interest_identification TEXT NOT NULL,
  necessity_analysis TEXT NOT NULL,
  balancing_test TEXT NOT NULL,
  conclusion TEXT NOT NULL,
  dpo_signed_by BIGINT NOT NULL REFERENCES users(id),
  signed_at TIMESTAMPTZ NOT NULL,
  version INT NOT NULL,
  superseded_by_id BIGINT NULL
)
```

### 10.3 Datos relativos a procesos penales = sensibles

Ley 21.719 art. 16: datos relativos a infracciones, condenas penales y procedimientos judiciales son **sensibles**. Implicancias:

- Acceso por **mínimo indispensable**.
- Logs de auditoría **inmutables** (ya cubierto por regla #15 de CLAUDE.md).
- **Cifrado reforzado** sobre TDE de Azure — column-level para fotos/biométricos.
- **Biométricos (reconocimiento facial):** prohibido por defecto. Flag `biometric_use BOOLEAN DEFAULT false` en `storage_objects`; activarlo requiere DPIA documentado.

### 10.4 Retención y anonimización

La skill no fija plazos duros. Configurables en `retention_policies`:

| Categoría                              | Plazo mínimo recomendado                                  | Acción al vencer |
| -------------------------------------- | --------------------------------------------------------- | ---------------- |
| Causa cerrada por sentencia firme      | Prescripción acción civil (4 años, CC art. 2332) + margen | `anonymize`      |
| Causa archivada provisionalmente       | Mientras pueda reabrirse + margen                         | `anonymize`      |
| Denuncia desestimada sin causa abierta | Plazo corto (open question #17)                           | `anonymize`      |
| Datos biométricos derivados            | Estrictamente lo necesario                                | `delete`         |

**Preferencia:** anonimización sobre supresión irreversible.

**Prevalencia del interés legítimo:** mientras la causa esté abierta, un imputado no puede invocar derecho de cancelación para borrar evidencia.

### 10.5 Derechos ARCOPOL+ (art. 4-11 Ley 21.719)

Tabla `data_subject_requests`:

```
data_subject_requests (
  id,
  subject_party_id BIGINT NOT NULL,
  request_type ENUM(
    'acceso','rectificacion','cancelacion','oposicion',
    'portabilidad','olvido','limitacion','no_decision_automatizada'
  ),
  received_at TIMESTAMPTZ NOT NULL,
  deadline_at TIMESTAMPTZ NOT NULL,  -- 30 días hábiles — open question #16
  status ENUM('pending','granted','partially_granted','rejected'),
  decision TEXT,
  legal_basis_for_rejection TEXT,
  responded_at TIMESTAMPTZ,
  responded_by BIGINT REFERENCES users(id)
)
```

Flag `processing_restricted BOOLEAN` en `parties` (derecho de limitación — "estado congelado del registro"). Timestamps `anonymization_requested_at` y `anonymization_deferred_until` (prevalencia del interés legítimo).

### 10.6 Transferencia internacional

Azure en región fuera de Chile = transferencia internacional (arts. 36-39 Ley 21.719). Bases:

- Adecuación (lista de la Agencia).
- Garantías adecuadas (cláusulas tipo, BCR).
- Consentimiento explícito.
- Excepciones específicas.

Operativa: verificar región de despliegue Azure. Skill recomienda Brazil South o Azure Chile cuando esté disponible. Se documenta en `data_processing_register`. No impacta schema de negocio.

---

## 11. Open questions consolidadas

Estas 18 preguntas **no bloquean el MVP**. Se listan para validación con abogado URP antes de cerrar cada módulo y, cuando tengan respuesta, actualizar las skills correspondientes.

| #   | Pregunta                                                                           | Skill a actualizar             |
| --- | ---------------------------------------------------------------------------------- | ------------------------------ |
| 1   | Art. 114 CPP — admisibilidad de querella contra incertus                           | /legal-procesal                |
| 2   | Plazo para formalizar tras primera actuación (CPP art. 186)                        | /legal-procesal                |
| 3   | Plazo para constituirse en querellante (CPP art. 261)                              | /legal-procesal                |
| 4   | Plazo del procedimiento abreviado (CPP 406-415)                                    | /legal-procesal                |
| 5   | Contenido exacto del art. 174 CPP (denuncia)                                       | /legal-procesal                |
| 6   | Ley 18.120 — patrocinio obligatorio en querella                                    | /legal-procesal                |
| 7   | Representación orgánica de persona jurídica querellante (CPC art. 8)               | /legal-procesal                |
| 8   | Archivo provisional (CPP art. 167) — estado terminal o suspensivo                  | /legal-procesal                |
| 9   | Principio de oportunidad (CPP 170) y umbrales                                      | /legal-procesal                |
| 10  | Momento de asignación del RUC por Fiscalía                                         | /legal-procesal                |
| 11  | Agravante penal por bosque nativo (vs solo administrativa Ley 20.283)              | /legal-penal                   |
| 12  | Reglas de reincidencia genérica (CP art. 12)                                       | /legal-penal                   |
| 13  | Discrepancia terminológica suspensión vs interrupción de prescripción (CP art. 96) | /legal-penal + /legal-procesal |
| 14  | CPP art. 85 (control de identidad) — atribución policial vs guardia privado        | /legal-armas-vigilantes        |
| 15  | Régimen del vigilante interno vs contratado bajo DL 3.607                          | /legal-armas-vigilantes        |
| 16  | Plazo exacto de respuesta a ARCOPOL bajo texto vigente Ley 21.719                  | /legal-datos                   |
| 17  | Plazos numéricos duros de retención por categoría                                  | /legal-datos                   |
| 18  | Protocolos internos URP (umbrales querella, escalamiento, asignación abogados)     | /legal                         |

---

## 12. Histórico de validaciones

| Fecha      | Skills consultadas                                                           | Alcance                                                                                      | Resultado      |
| ---------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------- |
| 2026-04-24 | /legal, /legal-procesal, /legal-penal, /legal-armas-vigilantes, /legal-datos | Módulos incidents, complaints, cases, persons, vehicles, surveillance — Paso 3 del discovery | Este documento |
