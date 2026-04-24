---
name: legal-procesal
description: Sub-skill de /legal especializada en derecho procesal penal chileno y procedimiento administrativo CONAF. Cubre denuncia, querella, plazos procesales, medidas cautelares personales y reales, formalización, salidas alternativas (acuerdo reparatorio, suspensión condicional), juicio oral, acción civil derivada del delito, prescripción, procedimientos administrativos sancionatorios sectoriales. Trigger automático cuando el contexto requiera definir plazos, decidir entre denuncia y querella, modelar flujos de causas o validar transiciones de estado procesal. Invocación manual con /legal-procesal.
revision_date: 2026-04-23
---

# Sub-skill /legal-procesal — Procedimiento penal chileno aplicado al SURP

Esta sub-skill cubre el procedimiento penal chileno y los procedimientos administrativos sectoriales relevantes para la URP. Sigue las reglas, formato y disclaimer de `/legal`. Tu fuente principal es el **Código Procesal Penal** (Ley 19.696, BCN: buscar "Código Procesal Penal", idNorma 176595) y normas conexas.

## Marco normativo

| Norma | Materia |
|---|---|
| **Código Procesal Penal (Ley 19.696)** | Procedimiento penal completo |
| **Código Penal (CP)** | Tipos penales y prescripción (art. 94) |
| **Código Civil (CC) arts. 2314 y siguientes** | Responsabilidad extracontractual / acción indemnizatoria |
| **Ley 18.575** | Bases generales de la administración del Estado (procedimiento administrativo sancionatorio) |
| **Ley 19.880** | Procedimiento administrativo (supletorio) |
| **Ley 20.283 art. 22 y siguientes** | Procedimiento sancionatorio CONAF |

---

## Inicio del procedimiento — Denuncia, querella o de oficio

El procedimiento penal puede iniciarse de tres formas (CPP arts. 172-178):

### Denuncia (CPP arts. 173-178)

**Quién puede denunciar:** cualquier persona puede denunciar un delito.

**Quién está obligado a denunciar (CPP art. 175):**
- Funcionarios de Carabineros, PDI, Gendarmería: respecto de todos los delitos.
- Empleados públicos: delitos cometidos en ejercicio de sus funciones o de los que tomen conocimiento.
- **Jefes de empresas o establecimientos:** los delitos cometidos en el establecimiento, o que afecten bienes de la empresa, **del personal** o de los que provengan del ejercicio de sus funciones (CPP art. 175 letra e).

> **Aplicación SURP:** los jefes de zona, área o predio de Arauco están **obligados** a denunciar los delitos que afecten el patrimonio de la empresa. El SURP debería registrar quién es el jefe responsable de cada predio/zona y emitir alertas cuando un incidente no haya generado denuncia formal dentro de plazo.

**Plazo para denunciar (CPP art. 176):** dentro de **24 horas** siguientes al momento en que tomaron conocimiento del hecho. La omisión se sanciona con multa (CPP art. 177 + Código Penal art. 494).

**Ante quién se denuncia (CPP art. 173):**
- Ministerio Público (Fiscalía).
- Carabineros, PDI o Gendarmería (que la pondrán en conocimiento del Ministerio Público).
- Tribunales con competencia criminal.

**Forma:** verbal o escrita. Si es verbal, se levanta acta. La denuncia debe contener identificación del denunciante, narración circunstanciada del hecho, designación de partícipes (si se conocen) y testigos.

**Diferencia clave:** el denunciante **no es interviniente** en el proceso. No tiene derecho a intervenir ni a recurrir. Solo aporta el conocimiento del hecho.

### Querella (CPP arts. 111-121)

**Quién puede querellarse:**
- La víctima, su representante legal o herederos.
- Cualquier persona capaz, en delitos terroristas, contra probidad pública, intereses sociales relevantes (CPP art. 111 inc. 2-3).
- Órganos del Estado en delitos que afecten intereses que se les encomiende cautelar.

**Plazo:** la querella puede presentarse **en cualquier momento mientras el fiscal no haya cerrado la investigación** (CPP art. 112).

**Requisitos de admisibilidad (CPP art. 113):** designación del tribunal, individualización del querellante y del querellado, relación circunstanciada del hecho, expresión de las diligencias solicitadas, firma.

**Quién es el querellante:** sí es **interviniente** (CPP art. 12). Tiene derecho a:
- Solicitar diligencias.
- Intervenir en audiencias.
- Recurrir.
- Adherir o forzar la acusación si el fiscal no la presenta (CPP art. 258 — forzamiento de la acusación).

> **Aplicación SURP:** Arauco como víctima (en delitos contra su patrimonio) puede y suele querellarse. La decisión querella vs. denuncia depende de la gravedad, monto, recurrencia y necesidad de impulso procesal. El SURP debería permitir registrar **ambas** y trazar el rol procesal de Arauco en cada causa (denunciante simple, querellante, parte civil).

### Inicio de oficio

El Ministerio Público puede iniciar de oficio cuando toma conocimiento del hecho por cualquier medio (incluso prensa).

---

## Etapas del procedimiento penal ordinario

```
1. Investigación desformalizada (Fiscalía)
2. Formalización (audiencia ante juez de garantía) — CPP art. 229
3. Investigación formalizada (plazo máx. 2 años — CPP art. 234)
4. Cierre de investigación (CPP art. 247-248)
5. Acusación o sobreseimiento (CPP arts. 248, 250)
6. Audiencia de preparación del juicio oral (CPP arts. 260-280)
7. Juicio oral (CPP arts. 281-351)
8. Sentencia (CPP arts. 339-351)
9. Recursos (apelación CPP art. 364 / nulidad CPP arts. 372-387)
```

### Investigación desformalizada

Se inicia con la denuncia o querella. La fiscalía dispone diligencias por sí o a través de policías (CPP arts. 79-83). El imputado **aún no está formalizado**.

### Formalización (CPP art. 229)

> "Comunicación que el fiscal efectúa al imputado, en presencia del juez de garantía, de que desarrolla actualmente una investigación en su contra respecto de uno o más delitos determinados."

Es requisito previo para:
- Solicitar medidas cautelares personales (prisión preventiva, otras).
- Solicitar prueba anticipada.
- Decretar la suspensión condicional del procedimiento.

Tras la formalización, el plazo máximo de investigación es de **2 años** (CPP art. 234).

### Cierre de la investigación (CPP arts. 247-248)

Plazo de 10 días tras el cierre para que el fiscal decida:
- **Acusar** (CPP art. 248 letra b)
- **Sobreseimiento definitivo o temporal** (CPP arts. 250-252)
- **No perseverar** (CPP art. 248 letra c) → archiva la investigación

### Salidas alternativas

**Acuerdo reparatorio (CPP art. 241):**
- Procede en delitos que afecten bienes jurídicos disponibles de carácter patrimonial, lesiones menos graves o delitos culposos.
- Imputado y víctima acuerdan reparación. El juez aprueba si no hay interés público prevalente.
- Extingue la responsabilidad penal.

> **Aplicación SURP:** en hurtos forestales de baja cuantía y sin reincidencia, el acuerdo reparatorio es habitual. Arauco como víctima debe valorar si conviene aceptar (cobro rápido) vs. perseverar (sentencia con efecto disuasivo y antecedentes para reincidencia futura).

**Suspensión condicional del procedimiento (CPP art. 237):**
- Procede si la pena probable no excede de 3 años de privación de libertad y el imputado no tiene condena anterior por crimen o simple delito.
- Se imponen condiciones (firma, no acercarse, reparar, etc.) por 1 a 3 años.
- Cumplidas las condiciones, se sobresee definitivamente.

**Procedimiento simplificado (CPP arts. 388-399):** para faltas y simples delitos con pena no superior a 540 días. Procedimiento abreviado, sin juicio oral.

**Procedimiento monitorio (CPP arts. 392):** para faltas con pena de multa.

---

## Medidas cautelares

### Cautelares personales (CPP arts. 122-156)

Solo procedentes contra el **imputado formalizado**.

| Medida | Norma | Aplicación |
|---|---|---|
| Citación | CPP art. 124 | Faltas y delitos de acción privada |
| Detención | CPP arts. 125-138 | En flagrancia (cualquier persona puede) o por orden judicial |
| Prisión preventiva | CPP arts. 139-153 | Solo cuando otras medidas son insuficientes para garantizar comparecencia, seguridad de la sociedad o de la víctima |
| Otras medidas cautelares (CPP art. 155) | Arresto domiciliario, sujeción a vigilancia, prohibición de acercarse a la víctima, prohibición de salir del país, retención de licencia | Sustitutivas o combinadas |

**Detención por flagrancia (CPP art. 129):** cualquier persona —incluido un guardia privado— puede detener al sorprendido in fraganti, debiendo entregarlo inmediatamente a Carabineros, PDI o juez. Ver `/legal-armas-vigilantes` para detalles sobre atribuciones de guardias.

### Cautelares reales (CPP arts. 157-158)

Para asegurar la responsabilidad pecuniaria del imputado:
- Embargo de bienes.
- Medidas precautorias del Código de Procedimiento Civil aplicables supletoriamente.

---

## Acción civil derivada del delito (CPP arts. 59-68)

La **víctima puede ejercer la acción civil** dentro del proceso penal (CPP art. 59), ante el juez de garantía o el tribunal oral en lo penal, con base en los arts. 2314 y siguientes del Código Civil.

**Forma:** demanda civil deducida por el querellante en el escrito de adhesión a la acusación o por escrito separado, hasta 15 días antes de la audiencia de preparación del juicio oral (CPP art. 60).

**Alternativa:** ejercer la acción civil en sede civil después de la sentencia penal firme (CC art. 2332 — prescripción de 4 años desde la perpetración del acto).

**Aplicación SURP:** Arauco puede demandar el resarcimiento del valor de la madera sustraída, daños a infraestructura, costos de reposición de cercos, lucro cesante. Conviene evaluar caso a caso si demandar en sede penal (más rápido, mismo juez) o civil (más espacio probatorio).

---

## Plazos clave

| Acto | Plazo | Norma |
|---|---|---|
| Denuncia obligatoria desde conocimiento | 24 horas | CPP art. 176 |
| Detención policial sin orden judicial | Hasta poner al detenido a disposición del juez en plazo razonable; máximo 24 hrs | CPP art. 131 |
| Audiencia de control de detención | Dentro de 24 hrs siguientes a la detención | CPP art. 131 |
| Investigación formalizada (plazo máximo) | 2 años | CPP art. 234 |
| Cierre de investigación (decisión post-cierre) | 10 días | CPP art. 248 |
| Plazo para deducir acción civil | Hasta 15 días antes de audiencia de preparación | CPP art. 60 |
| Reclamación administrativa CONAF (Ley 20.283) | 30 días desde notificación | Ley 20.283 art. 24 |

### Prescripción de la acción penal (CP art. 94)

| Tipo | Plazo |
|---|---|
| Crímenes con pena perpetua | 15 años |
| Demás crímenes | 10 años |
| Simples delitos | 5 años |
| Faltas | 6 meses |

Se cuenta desde el día en que se cometió el delito (CP art. 95). Se **suspende** desde que el procedimiento se dirige contra el imputado (CP art. 96) — aunque la jurisprudencia ha discutido el momento exacto (denuncia, querella, formalización).

---

## Procedimiento administrativo sancionatorio CONAF (Ley 20.283)

Aplicable a infracciones de bosque nativo, planes de manejo, corta no autorizada.

```
1. Constatación de la infracción por funcionario fiscalizador CONAF
2. Acta de denuncia / fiscalización
3. Notificación al infractor
4. Plazo de descargos (15 días hábiles — Ley 19.880 supletoria)
5. Resolución del Director Regional CONAF
6. Recurso de reposición (5 días) y/o jerárquico (5 días) — Ley 19.880
7. Reclamación judicial ante juez de letras civil (Ley 20.283 art. 24, 30 días)
```

**Concurrencia con el proceso penal:** la sanción administrativa de CONAF y la responsabilidad penal por hurto/robo/daños **pueden coexistir**. No hay non bis in idem porque protegen bienes jurídicos distintos (regulación forestal vs. patrimonio). Sí debe evitarse imponer dos veces la misma multa por el mismo hecho.

**Aplicación SURP:** cuando un incidente involucra corta sin autorización, el SURP debe permitir generar **dos requerimientos paralelos**: denuncia/querella penal + denuncia administrativa a CONAF.

---

## Procedimiento de desalojo Ley 21.633 — ver `/legal-tomas`

La Ley 21.633 introdujo un procedimiento especial de desalojo para usurpaciones flagrantes. Se trata en sub-skill propia.

---

## Cómo asesorar al equipo de desarrollo del SURP en materia procesal

1. **Modelo de causa:** la entidad `Case` debe registrar al menos:
   - Tipo de inicio (denuncia, querella, oficio).
   - Rol procesal de Arauco (denunciante, querellante, parte civil).
   - Etapa actual (investigación desformalizada, formalizada, acusación, juicio, sentencia, ejecución).
   - Fecha de cada hito (denuncia, formalización, cierre, acusación, sentencia).
   - Identificación de fiscal, juzgado de garantía, tribunal oral en lo penal, abogado patrocinante de Arauco.
   - Imputados (con RUT obligatorio) y testigos.

2. **Hitos / milestones:** modelar como append-only. Una vez registrada una formalización, no se borra ni se edita —se agrega corrección.

3. **Alertas de plazo:**
   - Plazo máximo de investigación formalizada (2 años) → alertar a 90 días del vencimiento.
   - Plazo de acción civil (hasta 15 días antes de preparación) → alertar.
   - Prescripción de la acción penal → alertar a 6 meses del vencimiento.
   - Denuncia obligatoria de jefe de predio (24 horas desde conocimiento) → alertar inmediato si transcurren 12 horas sin registro de denuncia.

4. **Estados de la causa:** definir máquina de estados que respete la estructura del CPP. No permitir saltar de "investigación desformalizada" a "sentencia" sin pasar por las etapas intermedias.

5. **Vinculación causa-incidente:** una causa puede agrupar varios incidentes (concurso real). Un incidente puede generar varias causas (separación). La relación es N a N.

6. **Acción civil:** registrar monto demandado, monto otorgado en sentencia, monto efectivamente cobrado.

7. **Trazabilidad de la sanción administrativa CONAF:** cuando aplique, registrar como entidad separada vinculada al mismo incidente.
