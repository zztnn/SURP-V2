---
name: legal-armas-vigilantes
description: Sub-skill de /legal especializada en el régimen chileno de control de armas (Ley 17.798) y de seguridad privada (DL 3.607 + reglamentos + circular OS-10 de Carabineros). Cubre tenencia, porte, tráfico de armas, atribuciones y limitaciones de los vigilantes privados, guardias de seguridad, nocheros y porteros, detención por flagrancia (CPP art. 129), uso de la fuerza, responsabilidad penal y civil del guardia, responsabilidad de Arauco como mandante (culpa in eligendo, in vigilando), fiscalización OS-10. Trigger automático cuando el contexto mencione guardia, vigilante, arma, OS-10, empresa de seguridad, contratista de resguardo, detención por flagrancia, uso de la fuerza. Invocación manual con /legal-armas-vigilantes.
revision_date: 2026-04-23
---

# Sub-skill /legal-armas-vigilantes — Control de armas y seguridad privada

Esta sub-skill cubre el régimen aplicable a las **empresas externas de seguridad** que Arauco contrata para resguardar predios, sus trabajadores (vigilantes privados, guardias, nocheros), las armas que pueden o no portar, sus atribuciones legales, sus límites, y la responsabilidad que cae sobre Arauco como mandante. Sigue las reglas, formato y disclaimer de `/legal`.

## Contexto SURP

Arauco no opera con personal armado propio; **contrata empresas externas** para el resguardo de sus predios. Esto implica que la URP (Unidad de Resguardo Patrimonial):
- **No es directamente responsable** de la actuación operativa del guardia.
- **Sí tiene deberes de fiscalización** del cumplimiento normativo del contratista (culpa in eligendo, in vigilando).
- **Recibe y coordina** las novedades que reportan los guardias.
- **Coordina con OS-10** cuando hay irregularidades.

## Marco normativo

| Norma | Materia |
|---|---|
| **Ley 17.798 sobre control de armas** | Tenencia, porte, tráfico, fabricación, internación de armas |
| **DS 400/1978 Ministerio de Defensa** | Texto refundido y reglamento de la Ley 17.798 |
| **DL 3.607 (1981)** | Establece normas sobre funcionamiento de vigilantes privados |
| **DS 93/1985 Ministerio de Defensa** | Reglamento del DL 3.607 |
| **DS 1.773/1994** | Reglamenta funcionamiento de vigilantes privados (modificaciones) |
| **Decreto Supremo 867/1985** | Reglamento de seguridad privada (categorías de personal) |
| **Circulares OS-10 de Carabineros** | Instrucciones operativas para fiscalización |
| **Código Procesal Penal art. 129** | Detención por flagrancia (cualquier persona) |
| **Código Penal art. 10 N° 6** | Legítima defensa propia o de terceros |
| **Código Civil arts. 2314, 2320, 2322** | Responsabilidad del empresario por sus dependientes |

---

## Categorías de personal de seguridad privada (DL 3.607 + DS 93/1985)

| Categoría | Descripción | ¿Puede portar arma? |
|---|---|---|
| **Vigilante privado** | Pertenece a una **empresa de seguridad** autorizada. Resguarda lugares específicos. Capacitación formal. | **Sí**, con permiso especial autorizado por la autoridad fiscalizadora (Carabineros / Autoridad Fiscalizadora respectiva) |
| **Guardia de seguridad** | Personal de servicio de seguridad de la propia empresa o de empresa de seguridad autorizada. Funciones limitadas a recintos cerrados. | **No** porta arma de fuego como regla general. Excepciones tasadas. |
| **Nochero** | Funciones nocturnas en recintos cerrados | No |
| **Portero** | Funciones de control de acceso | No |
| **Rondín** | Vigilancia perimetral | No |

**Diferencia operativa relevante para Arauco:**
- Los **vigilantes privados** son los únicos autorizados a portar arma con permiso especial. Suelen ser personal de empresas grandes con OS-10 al día.
- Los **guardias** que vigilan predios forestales generalmente **no están autorizados a portar armas de fuego**. Solo pueden usar elementos disuasivos no letales (linterna, radio, eventualmente bastón si la empresa lo autoriza).
- **Cualquier guardia que porte arma sin autorización vigente comete delito de la Ley 17.798**.

---

## Ley 17.798 sobre control de armas — figuras principales

| Figura | Artículo | Pena |
|---|---|---|
| **Tenencia ilegal** de armas o municiones | Art. 9 | Presidio menor en su grado medio a máximo (541 días a 5 años) |
| **Porte ilegal** de arma de fuego | Art. 14 | Presidio menor en su grado máximo a presidio mayor en su grado mínimo (3 años y 1 día a 10 años) |
| **Armas sujetas a control** | Art. 2 | Define qué se considera arma controlada |
| **Armas prohibidas** (automáticas, hechizas, de mayor calibre que el permitido a particulares, modificadas) | Art. 14 D | Penas agravadas |
| **Tráfico ilegal de armas** | Art. 10 | Presidio mayor en su grado mínimo a medio |
| **Disparos injustificados** | Art. 14 D inc. final | Presidio menor en sus grados medio a máximo |
| **Abandono de arma** | Art. 14 A | Sanción específica |

**Distinción clave:**
- **Tenencia:** mantener el arma en domicilio o lugar de trabajo autorizado. Requiere inscripción.
- **Porte:** llevar el arma fuera del lugar autorizado. Requiere permiso especial (raro para particulares; típico para vigilantes con autorización).

**Aplicación al guardia que vigila predio Arauco:**
- Si vigila predio rural y la empresa tiene autorización vigente para portar arma + el guardia tiene credencial de vigilante privado autorizado: puede portar.
- Si lo anterior no se cumple: el guardia comete delito de porte ilegal (art. 14 Ley 17.798) **y** la empresa queda expuesta a sanciones administrativas y penales por su responsabilidad.
- **El SURP debería registrar el estatus de armado del guardia que reporta cada incidente** para validar a posteriori.

---

## Atribuciones del guardia / vigilante privado

### Detención por flagrancia (CPP art. 129)

> "Cualquier persona podrá detener a quien sorprendiere en delito flagrante, debiendo entregar inmediatamente al aprehendido a la policía, al ministerio público o a la autoridad judicial más próxima."

**Esto significa que un guardia privado puede detener** a quien sorprenda cometiendo un delito en flagrancia (CPP art. 130 define flagrancia: actualmente cometiendo, recién cometido, etc.). Pero:

1. **Debe entregar inmediatamente** al aprehendido a Carabineros, PDI o Ministerio Público. **No puede mantenerlo retenido**.
2. **No puede usar fuerza desproporcionada**. La detención debe limitarse a lo razonablemente necesario.
3. **No tiene atribuciones de interrogatorio**. Solo retiene físicamente y entrega.
4. **No puede registrar** (revisar) al detenido más allá de lo necesario para asegurar que no porte arma. La revisión exhaustiva es atribución policial.

### Uso de la fuerza

**Principios aplicables (jurisprudencia + doctrina):**
- **Necesidad:** solo cuando no haya otra forma de impedir el delito o asegurar la detención.
- **Proporcionalidad:** la fuerza usada debe ser proporcional a la amenaza enfrentada.
- **Subsidiariedad:** preferir medios disuasivos antes que físicos, físicos antes que letales.

**Legítima defensa (CP art. 10 N° 6):**
- Agresión ilegítima.
- Necesidad racional del medio empleado para impedirla o repelerla.
- Falta de provocación suficiente por parte del que se defiende.

Aplica a guardias y a cualquier persona. Si el guardia repele una agresión cumpliendo estos requisitos, **no es responsable penalmente**.

**Cumplimiento de un deber (CP art. 10 N° 10):**
- Aplicable cuando el guardia actúa en cumplimiento de las atribuciones que el ordenamiento le reconoce (detener flagrante, defender el predio).

---

## Responsabilidad penal del guardia

Si el guardia se excede:
- **Lesiones** (CP arts. 395-403): si causa daño físico desproporcionado.
- **Homicidio** (CP arts. 390-391): si causa la muerte sin que concurra eximente completa de legítima defensa.
- **Detención ilegal / secuestro** (CP arts. 141-148): si retiene al detenido más allá de lo razonable o no lo entrega a la autoridad.
- **Apremios ilegítimos**: si maltrata al detenido.
- **Porte o tenencia ilegal de armas** (Ley 17.798): si porta arma sin permiso vigente.

**El guardia es responsable personalmente** por sus acciones. La empresa de seguridad y Arauco **no responden penalmente por el hecho del guardia**, pero sí pueden tener responsabilidad civil y administrativa.

---

## Responsabilidad civil de la empresa de seguridad y de Arauco

### Empresa de seguridad

Como **empleadora directa** del guardia, responde civilmente por los hechos cometidos por su dependiente en ejercicio de sus funciones (CC art. 2320 inc. 4 — responsabilidad por hecho ajeno).

Para liberarse, debe acreditar que adoptó todas las medidas razonables de **selección, capacitación, supervisión y control** del personal (CC art. 2320 inc. final).

### Arauco como mandante

Arauco contrata a la empresa de seguridad como **proveedor de servicios**. La regla general:
- **Arauco no responde directamente** por el hecho del dependiente de su contratista, salvo que se acredite **culpa propia**.
- **Culpa in eligendo:** Arauco eligió un proveedor inadecuado (sin OS-10, sin acreditaciones, con antecedentes adversos).
- **Culpa in vigilando:** Arauco no fiscalizó adecuadamente el cumplimiento del contrato y de las normativas aplicables.

**Para mitigar este riesgo, la URP debe:**
1. Verificar al contratar que el proveedor tiene OS-10 vigente, autorización para personal armado (si aplica), seguros vigentes.
2. Auditar periódicamente el cumplimiento (capacitación de personal, renovaciones de credenciales, mantenimiento de armas, registro de incidentes).
3. Exigir reporte de incidentes graves dentro de plazo definido contractualmente.
4. Documentar las auditorías y acciones correctivas.

> **Aplicación SURP:** el módulo de vigilancia debe registrar el contratista, OS-10 vigente, plazo de vencimiento, certificaciones del personal, auditorías realizadas, hallazgos y acciones correctivas. Generar alertas cuando una credencial esté próxima a vencer.

---

## Fiscalización OS-10 Carabineros

**OS-10** (Departamento de Control de Armas y Explosivos de Carabineros, también denominado en algunas instrucciones como Departamento OS-10) es la unidad de Carabineros que:
- Autoriza y fiscaliza a las **empresas de seguridad privada**.
- Controla a los **vigilantes privados** (credenciales, capacitación, antecedentes).
- Inspecciona el **armamento** que portan las empresas y sus vigilantes.
- Sanciona infracciones administrativas (suspensión, cancelación de la autorización).

**Coordinación con la URP:**
- Reportes periódicos de OS-10 sobre el contratista (auditorías, no conformidades).
- Notificación inmediata si hay incidente con uso de arma o detención.
- Cooperación en investigaciones cuando haya hechos que involucren al personal de seguridad.

---

## Cuándo escalar a Carabineros y a Fiscalía

| Situación | Acción inmediata |
|---|---|
| Detención por flagrancia en el predio | Carabineros (113 / unidad más próxima) — entrega inmediata del detenido |
| Disparo (justificado o no) | Carabineros + Ministerio Público + suspensión preventiva del guardia hasta investigación |
| Lesiones a tercero por guardia | Carabineros + atención de salud + Ministerio Público + reporte interno + revisión OS-10 |
| Sospecha de porte ilegal de arma del propio guardia | Suspensión preventiva + reporte a OS-10 + denuncia |
| Toma de predio | Carabineros para constatación + procedimiento Ley 21.633 (ver `/legal-tomas`) |
| Robo, hurto, daños | Denuncia o querella según gravedad y monto (ver `/legal-procesal`) |

---

## Coordinación con `/legal-datos`

El **personal de las empresas de seguridad** que reporta al SURP es titular de datos personales (sus turnos, ubicación durante la jornada, reportes que firma). Las **personas que el guardia detiene o identifica** son titulares de datos sensibles (datos relativos a infracciones penales).

Reglas:
- La empresa de seguridad es **encargada del tratamiento** cuando accede al SURP. Requiere contrato con cláusulas de protección de datos.
- Los datos del personal de seguridad solo se usan para los fines del contrato (verificación de cumplimiento, reportes, coordinación). No reutilizar.
- Las **fotos y videos capturados por los guardias** que se almacenen en el SURP pasan al régimen de evidencia digital descrito en `/legal-tomas` y `/legal-datos`.

---

## Cómo asesorar al equipo de desarrollo del SURP en materia de armas y vigilantes

1. **Modelo del contratista de seguridad:**
   - Entidad `SecurityContractor` con: razón social, RUT, OS-10 vigente (con fecha de vencimiento), seguros (con vencimiento), contratos vigentes, predios o zonas asignadas.
   - Alertas automáticas a 90 días, 30 días y vencimiento de OS-10 / seguros.

2. **Modelo del personal de vigilancia:**
   - Entidad `SecurityGuard` vinculada al contratista con: identificación (RUT), tipo (vigilante privado armado / guardia / nochero / rondín), credencial OS-10 (cuando aplique), capacitaciones vigentes.
   - Logs de turnos: predio, fecha, hora inicio/fin.

3. **Reporte de incidentes por el guardia:**
   - Captura del incidente con identificación del guardia, predio, hora, descripción, evidencia (fotos, video).
   - Si hubo detención o uso de fuerza: campos adicionales obligatorios (forma de la detención, entrega a Carabineros, hora de entrega, individualización de unidad receptora).
   - Si hubo disparo: workflow especial con notificación inmediata a OS-10 y a Fiscalía.

4. **Auditorías OS-10:** registrar cada auditoría con fecha, alcance, hallazgos, acciones correctivas, responsable de seguimiento.

5. **Alertas críticas:**
   - Vencimiento próximo de OS-10 o credenciales individuales.
   - Discrepancias en logs de turnos vs. reportes (guardia que reporta sin estar de turno).
   - Incidentes con uso de fuerza no notificados dentro del plazo contractual.
   - Ausencia de auditoría dentro del plazo definido.

6. **Vinculación con causas penales:** cuando un guardia es testigo o denunciante en una causa, debe estar correctamente individualizado en el expediente con su rol procesal.

7. **Privacidad del personal:** los datos de los guardias se gestionan bajo Ley 21.719 con base de licitud "ejecución de contrato" (con el contratista) e "interés legítimo" (de Arauco para fiscalización). Aviso de privacidad incluido en el contrato con la empresa de seguridad.
