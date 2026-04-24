---
name: legal-datos
description: Sub-skill de /legal especializada en la Ley 21.719 sobre protección de datos personales (publicada 13 diciembre 2024, vigencia plena 1 diciembre 2026), aplicada al diseño y operación del SURP. Cubre principios, bases de licitud, datos sensibles (incluyendo datos relativos a infracciones penales y datos biométricos), derechos ARCOPOL del titular, encargado de tratamiento, evaluación de impacto, notificación de brechas, transferencias internacionales, régimen sancionatorio de la Agencia de Protección de Datos Personales. Trigger automático cuando el contexto mencione datos personales, RUT, datos sensibles, consentimiento, ARCOPOL, brecha, evaluación de impacto, encargado de tratamiento, biométrico, geolocalización de personas. Invocación manual con /legal-datos.
revision_date: 2026-04-23
---

# Sub-skill /legal-datos — Protección de datos personales (Ley 21.719) en el SURP

Esta sub-skill cubre la **Ley 21.719** que reemplaza la antigua Ley 19.628 y moderniza el régimen chileno de protección de datos personales. Sigue las reglas, formato y disclaimer de `/legal`.

## Datos clave de la Ley 21.719

| Aspecto | Detalle |
|---|---|
| **Publicación** | 13 de diciembre de 2024 |
| **Vigencia plena** | 1 de diciembre de 2026 (24 meses tras publicación) |
| **Reemplaza** | Ley 19.628 sobre Protección de la Vida Privada (1999) |
| **Inspiración** | Reglamento General de Protección de Datos europeo (RGPD / GDPR) |
| **Crea** | Agencia de Protección de Datos Personales (autoridad de control) |
| **Sanción máxima** | Hasta 20.000 UTM por infracción gravísima (aprox. USD 14 millones) |

**BCN:** buscar "Ley 21719" en https://www.bcn.cl/leychile/

**Importancia para el SURP:** la URP procesa de forma masiva datos personales de imputados, testigos, denunciantes, trabajadores propios y de terceros, contratistas, además de fotos, videos y geolocalizaciones. La Ley 21.719 impacta el diseño del modelo de datos, los flujos de consentimiento, la minimización, los derechos del titular, la retención y los logs de auditoría.

---

## Principios rectores (art. 3 Ley 21.719)

| Principio | Aplicación al SURP |
|---|---|
| **Licitud** | Todo tratamiento debe tener una base de licitud (ver siguiente sección). |
| **Lealtad y transparencia** | Informar al titular sobre el tratamiento (cuando sea posible y proporcionado). |
| **Finalidad** | Datos recolectados para la URP solo se usan para la URP. No reutilizar para fines comerciales o ajenos. |
| **Proporcionalidad** | Solo recolectar lo estrictamente necesario para el fin. |
| **Calidad** | Datos exactos, completos, actualizados. Mecanismos de corrección. |
| **Responsabilidad (accountability)** | Arauco como **responsable del tratamiento** debe poder demostrar el cumplimiento. |
| **Seguridad** | Medidas técnicas y organizativas adecuadas al riesgo. |
| **Confidencialidad** | Acceso restringido a personas autorizadas, con trazabilidad. |
| **Minimización del tratamiento de datos sensibles** | Tratamiento especialmente restringido. |

---

## Bases de licitud (art. 12 Ley 21.719)

Ningún tratamiento es legal sin al menos una de estas bases:

| Base | Aplicación SURP |
|---|---|
| **Consentimiento** del titular (art. 12 letra a) | Poco usado en URP, porque no se va a pedir consentimiento al imputado. Sí podría usarse para consentir tratamiento de datos del **denunciante** o **testigo** voluntario. |
| **Cumplimiento de obligación legal** (letra b) | Base para registrar denuncias (CPP art. 175 letra e obliga al jefe de empresa a denunciar) y para responder a requerimientos de Fiscalía o tribunales. |
| **Interés legítimo** del responsable o de un tercero (letra f) | **Base principal** para el tratamiento de datos de imputados y otros vinculados a hechos contra el patrimonio de Arauco. Requiere ponderación (ver siguiente). |
| **Ejecución de contrato** | Aplicable a datos de trabajadores propios y contratistas. |
| **Interés vital** | Casos excepcionales de protección de la vida de alguien. |
| **Interés público** | No aplica a Arauco salvo en escenarios muy acotados. |

**Ponderación del interés legítimo (test de balanceo):**
1. **Interés legítimo identificado** (proteger patrimonio, prevenir y perseguir delitos contra los predios).
2. **Necesidad** del tratamiento para ese interés (¿se podría lograr el fin con menos datos?).
3. **No prevalencia de los derechos del titular** (¿el daño al titular es desproporcionado vs. el interés perseguido?).
4. **Documentación** del análisis (Arauco debe poder demostrar que hizo el balanceo).

> **Aplicación SURP:** el responsable de cumplimiento debe documentar formalmente el análisis de interés legítimo para los principales tratamientos del SURP. Recomendable un registro escrito por categoría de tratamiento (incidentes, denuncias, causas, vigilancia, evidencia visual).

---

## Datos personales sensibles (art. 2 letra g)

La Ley 21.719 considera **sensibles** —entre otros— los datos que revelen:
- Origen racial o étnico.
- Filiación política, opiniones políticas, convicciones religiosas o filosóficas.
- Afiliación sindical.
- Datos de **salud, vida sexual u orientación sexual**.
- **Datos biométricos** que permitan identificar unívocamente a una persona física (huella, iris, reconocimiento facial).
- **Datos genéticos**.
- Datos de **niños, niñas y adolescentes** (régimen reforzado, art. 16).
- **Datos relativos a la situación socioeconómica** del titular.

**Y particularmente para el SURP, art. 16:**
- **Datos relativos a infracciones, condenas penales y procedimientos judiciales.**

> **Tratamiento de datos relativos a procesos penales (art. 16):** solo puede realizarse bajo control de la autoridad pública o cuando lo autorice la ley con garantías adecuadas. **Para Arauco, la base de licitud es el cumplimiento de la obligación legal de denuncia + el interés legítimo de defensa de su patrimonio**, pero con **garantías reforzadas** (ver siguiente).

**Reglas reforzadas para datos sensibles:**
- Tratamiento prohibido como regla general.
- Permitido solo con: consentimiento explícito + finalidad determinada, o por obligación legal expresa, o por interés vital del titular o de tercero, o por interés público sustancial declarado por ley.
- Medidas de seguridad **adicionales**.
- Acceso restringido al mínimo indispensable.
- Logs de auditoría obligatorios.

> **Aplicación SURP:** los datos de imputados, testigos, denunciantes son sensibles por art. 16. Las fotografías de personas son **datos biométricos** si el sistema los usa para identificación automatizada (reconocimiento facial). Si son fotos solo descriptivas archivadas como evidencia, técnicamente no son biométricas hasta que se procesen para identificación. **Diseñar el módulo evitando que las fotos se conviertan en biométricas inadvertidamente** (no aplicar reconocimiento facial sin análisis previo de impacto).

---

## Derechos del titular — ARCOPOL+ (arts. 4-11)

| Derecho | Significado | Aplicación SURP |
|---|---|---|
| **A**cceso | Saber qué datos suyos se tratan | Procedimiento para responder solicitudes |
| **R**ectificación | Corregir datos inexactos | Mecanismo de corrección con auditoría |
| **C**ancelación / supresión | Eliminar datos cuando ya no son necesarios | Política de retención y borrado automático |
| **O**posición | Oponerse al tratamiento basado en interés legítimo | Atender oposición; si el interés legítimo prevalece, fundamentar |
| **P**ortabilidad | Recibir los datos en formato estructurado | Aplicable principalmente a datos de trabajadores |
| **O**lvido / supresión digital | Variante de la cancelación | Considerar en evidencia digital antigua |
| **L**imitación | Restringir el tratamiento sin borrarlo | Estado "congelado" del registro |
| **No decisión automatizada** | Derecho a no ser objeto de decisiones basadas únicamente en tratamiento automatizado con efectos jurídicos | Aplica si el SURP usa scoring automático para alertar |

**Plazo de respuesta:** la Ley 21.719 establece plazo (en el orden de **30 días hábiles**, prorrogables justificadamente). Verificar texto vigente al momento de configurar el procedimiento.

**Excepciones:** los derechos **ceden** cuando el tratamiento es necesario para investigación de delitos, defensa judicial, cumplimiento de obligación legal. Es decir, un imputado **no puede** invocar el derecho de cancelación para obligar a Arauco a borrar la evidencia de un hecho mientras la causa esté abierta.

> **Aplicación SURP:** el sistema debe tener:
> - Endpoint o flujo para recibir solicitudes ARCOPOL+ (idealmente vía portal web o correo formal).
> - Workflow de evaluación que considere las excepciones aplicables.
> - Plazos automáticos que disparen alertas si se acerca el vencimiento sin respuesta.
> - Logging de la solicitud, la evaluación, la decisión y la respuesta.

---

## Encargado de tratamiento (procesador) — art. 24

Cuando Arauco contrata a terceros que procesan datos personales por su cuenta (proveedores cloud, empresas de seguridad externa, abogados externos), esos terceros son **encargados del tratamiento**.

**Requisitos:**
1. **Contrato escrito** entre responsable (Arauco) y encargado, con cláusulas mínimas (objeto, duración, finalidad, tipo de datos, obligaciones).
2. El encargado **solo trata los datos según instrucciones documentadas** del responsable.
3. Confidencialidad obligatoria del personal del encargado.
4. Medidas técnicas y organizativas equivalentes.
5. Sub-encargos (sub-procesadores) **requieren autorización** del responsable.
6. Devolución o supresión de datos al término del servicio.

**Aplicación SURP — encargados típicos:**
- **Microsoft Azure** (Blob Storage, Database for PostgreSQL, Container Apps): encargado de tratamiento bajo el contrato cloud. Verificar Adendum de Protección de Datos.
- **Empresas de seguridad externa contratadas por Arauco** (los guardias mencionados en `/legal-armas-vigilantes`): si reciben acceso a datos del SURP, son encargadas. Si solo reportan incidentes que la URP carga, son fuente de datos pero no encargadas.
- **Abogados externos**: cuando reciben datos del expediente para representar a Arauco, son encargados (con régimen específico por secreto profesional).
- **Proveedores de servicios de mapas/geolocalización**: encargados.

---

## Evaluación de impacto (DPIA) — art. 28

Obligatoria cuando el tratamiento, por su naturaleza, alcance, contexto o fines, **probablemente entrañe un alto riesgo** para los derechos de las personas.

**Casos típicos donde aplica:**
- Tratamiento sistemático y a gran escala de datos sensibles (datos relativos a infracciones penales — el caso del SURP).
- Vigilancia sistemática a gran escala (vigilancia de predios con cámaras + reconocimiento facial).
- Decisiones automatizadas con efectos significativos (scoring de riesgo de incidentes asociado a personas).

**Contenido de la DPIA:**
1. Descripción sistemática del tratamiento.
2. Evaluación de necesidad y proporcionalidad.
3. Evaluación de los riesgos para los derechos del titular.
4. Medidas para mitigar esos riesgos.

> **Aplicación SURP:** el SURP en su conjunto califica para DPIA por tratar datos sensibles de art. 16 a gran escala. Conviene encargar una DPIA formal antes de la entrada en vigencia plena de la ley (diciembre 2026).

---

## Notificación de brechas — art. 26

Ante una **brecha de seguridad de datos personales** (acceso no autorizado, pérdida, alteración, comunicación o destrucción accidental o ilícita), Arauco debe:

1. **Documentar** la brecha (qué pasó, datos afectados, número aproximado de titulares, consecuencias probables, medidas tomadas).
2. **Notificar a la Agencia de Protección de Datos Personales** sin demora indebida (la ley establece plazo, en el orden de **72 horas** desde el conocimiento, según texto a confirmar al momento de aplicar).
3. **Notificar a los titulares afectados** cuando la brecha pueda generar **alto riesgo** para sus derechos (con lenguaje claro y medidas que el titular puede tomar).

> **Aplicación SURP:** el SURP debe tener:
> - Procedimiento documentado de detección y respuesta a brechas.
> - Workflow de notificación con plazos automáticos.
> - Registro centralizado de brechas (incluso menores, para análisis y reporte).
> - Comunicación clara con seguridad informática de Arauco corporativo.

---

## Transferencia internacional de datos (arts. 36-39)

El SURP almacena datos en **Azure**. Si las regiones de Azure están fuera de Chile, hay transferencia internacional.

**Bases para la transferencia internacional:**
- **Adecuación**: país receptor con nivel adecuado de protección (lista que mantenga la Agencia).
- **Garantías adecuadas**: cláusulas contractuales tipo, normas corporativas vinculantes.
- **Consentimiento explícito** del titular (poco práctico para datos de imputados).
- **Excepciones específicas** (interés público, defensa de derechos en juicio).

> **Aplicación SURP:** verificar la **región de despliegue de Azure**. Si es Brasil, EE.UU. o Europa, se requiere base de licitud para transferencia internacional + cláusulas en el contrato con Microsoft. **Recomendable preferir Brazil South** o evaluar Azure Chile cuando esté disponible.

---

## Régimen sancionatorio (arts. 50-54)

| Categoría | Multa máxima |
|---|---|
| **Leves** | Hasta 5.000 UTM |
| **Graves** | Hasta 10.000 UTM |
| **Gravísimas** | Hasta 20.000 UTM |

Adicionalmente: amonestación, suspensión temporal del tratamiento, prohibición permanente.

**Tratándose de tratamiento de datos sensibles**, las multas se aplican en el rango superior.

---

## Roles dentro del SURP relevantes para Ley 21.719

| Rol | Función bajo Ley 21.719 |
|---|---|
| **Responsable del tratamiento** | Forestal Arauco (persona jurídica) |
| **Delegado de Protección de Datos (DPO)** | Designación recomendada para la URP. Punto de contacto con titulares y Agencia. |
| **Encargados del tratamiento** | Azure, contratistas externos, abogados externos |
| **Personal autorizado** | Solo personal de la URP con función específica accede a categorías sensibles |
| **Titulares** | Personas naturales cuyos datos están en el SURP (imputados, testigos, denunciantes, trabajadores, vecinos, etc.) |

---

## Cómo asesorar al equipo de desarrollo del SURP en materia de protección de datos

1. **Privacy by design (privacidad desde el diseño):** en cada nuevo módulo, evaluar antes de construirlo qué datos personales toca, cuál es la base de licitud, si hay datos sensibles, si requiere DPIA. **No agregar campos por inercia.**

2. **Clasificación de datos en el modelo:**
   - Marcar las columnas que contienen datos personales.
   - Marcar las que contienen **datos sensibles** (art. 16 — datos de procesos penales, biométricos, salud).
   - Definir nivel de acceso por rol para cada categoría.

3. **Logs de auditoría obligatorios** para todo acceso, modificación o exportación de datos sensibles. Inmutables. Registrar usuario, IP, timestamp, acción, registro afectado.

4. **Política de retención por categoría de dato:**
   - Datos de causa cerrada por sentencia: conservar mínimo el plazo de prescripción de la acción civil indemnizatoria + plazo razonable adicional.
   - Datos de causa archivada provisionalmente: conservar mientras pueda reabrirse + plazo razonable.
   - Datos de denuncia desestimada: conservar plazo más corto.
   - Datos biométricos derivados (si los hay): retener solo el tiempo estrictamente necesario.
   - Vencido el plazo: anonimización (preferida) o supresión (irreversible).

5. **Consentimiento y avisos de privacidad:**
   - Para trabajadores propios y contratistas: aviso de privacidad incluido en el contrato laboral o de servicios.
   - Para denunciantes voluntarios externos: aviso al momento de levantar la denuncia.
   - Para imputados: no se requiere consentimiento (base = obligación legal + interés legítimo) pero el aviso al titular es buena práctica cuando no comprometa la investigación.

6. **Endpoint ARCOPOL+:** flujo formal (no informal) para recibir y procesar solicitudes de derechos del titular, con plazos automáticos.

7. **Procedimiento de brechas:** detección, contención, evaluación, notificación a Agencia, notificación a titulares cuando aplique. Documentado y probado.

8. **DPIA inicial:** encargar una evaluación de impacto formal del SURP en su conjunto. Repetir cada vez que se introduzca un módulo de alto riesgo (reconocimiento facial, scoring automático, integración con bases externas).

9. **Contrato con Azure:** revisar Adendum de Protección de Datos. Verificar región de despliegue. Documentar la base de transferencia internacional.

10. **Capacitación periódica** del personal de la URP y del equipo técnico del SURP en materia de protección de datos.

11. **Designar DPO** o equivalente funcional dentro de Arauco para la URP, con canal directo con el área legal corporativa y con la Agencia.
