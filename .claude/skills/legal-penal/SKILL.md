---
name: legal-penal
description: Sub-skill de /legal especializada en derecho penal sustantivo chileno aplicado al catálogo de incidentes del SURP. Cubre tipos penales: hurto, robo, daños, amenazas, incendio, atentado personal, agresión, asociación ilícita, porte y tenencia ilegal de armas, infracción Ley de Bosques, receptación, usurpación, desacato, hurto frustrado, atentado incendiario, plantación ilegal, alteración de deslindes, hurto de energía eléctrica, tala ilegal, abigeato, Ley de Seguridad del Estado, Ley Antiterrorista, crimen organizado. Trigger automático cuando el contexto requiera tipificar un hecho, calcular pena, identificar agravantes o distinguir entre figuras. Invocación manual con /legal-penal.
revision_date: 2026-04-23
---

# Sub-skill /legal-penal — Tipos penales aplicables al dominio SURP

Esta sub-skill contiene el catálogo penal completo aplicable a los incidentes que registra el SURP. Sigue todas las reglas, formato y disclaimer definidos en `/legal`. Tu fuente principal es el **Código Penal chileno** (Ley s/n 1874, BCN: `https://www.bcn.cl/leychile/` buscar "Código Penal", idNorma 1984), complementado por leyes especiales que se citan en cada figura.

## Tabla maestra del catálogo SURP → norma penal

| Tipo SURP | Figura penal | Norma principal |
|---|---|---|
| Hurto | Hurto | CP arts. 432, 446-448 |
| Hurto frustrado | Hurto en grado frustrado | CP arts. 7 + 446 |
| Hurto de energía eléctrica | Hurto de energía | CP art. 137 + DFL 4/2007 Servicios Eléctricos |
| Robo | Robo (con violencia, intimidación o fuerza) | CP arts. 432, 433-443 |
| Tala ilegal / Robo de madera | Robo de madera agravado | CP art. 443 inc. final + Ley 21.013 + Ley 20.283 |
| Daños | Daños calificados o simples | CP arts. 484-488 |
| Alteración y destrucción de deslindes | Alteración de deslindes | CP art. 462 |
| Amenazas | Amenazas de delito | CP arts. 296-298 |
| Incendio | Incendio doloso o cuasidelito | CP arts. 474-481 |
| Atentado incendiario | Incendio agravado / Ley 12.927 si hay connotación | CP art. 476 N° 3 + Ley 12.927 art. 6 |
| Atentado Personal | Atentado a la autoridad / Lesiones | CP arts. 261-268 / 395-403 |
| Agresión | Lesiones | CP arts. 395-403 |
| Asociación Ilícita | Asociación ilícita / Organización criminal | CP arts. 292-295 + Ley 21.577 |
| Porte y Tenencia Ilegal de Armas | Tenencia o porte ilegal | Ley 17.798 arts. 9, 14 |
| Infracción Ley de Bosques | Infracción a Ley 20.283 / DS 4.363 | Ley 20.283 + DS 4.363/1931 |
| Plantación Ilegal | Cultivo no autorizado | Caso a caso (Ley 20.283 / Ley 20.000 si especies fiscalizadas) |
| Receptación | Receptación | CP art. 456 bis A |
| Usurpación | Usurpación de inmueble | CP arts. 457-462 (modificados Ley 21.633) — ver `/legal-tomas` |
| Desacato | Desacato a resolución judicial | CPC art. 240 |
| Abigeato | Abigeato (variante del hurto/robo de animales) | CP arts. 448 bis y 448 ter (introducidos por Ley 20.090) |
| (cualquiera con connotación de orden público) | Delitos contra seguridad del Estado | Ley 12.927 |
| (cualquiera con connotación terrorista) | Conducta terrorista | Ley 18.314 |

---

## Hurto (CP arts. 432, 446-448)

**Tipo objetivo (art. 432):** apropiación de cosa mueble ajena, sin violencia, sin intimidación y sin fuerza en las cosas, con ánimo de lucrarse y sin la voluntad de su dueño.

**Pena escalonada según valor (art. 446):**

| Valor de lo sustraído | Pena |
|---|---|
| Más de 40 UTM | Presidio menor en sus grados medio a máximo (541 días a 5 años) y multa de 11 a 15 UTM |
| Sobre 4 UTM y hasta 40 UTM | Presidio menor en su grado medio (541 días a 3 años) y multa de 6 a 10 UTM |
| Sobre media UTM y hasta 4 UTM | Presidio menor en su grado mínimo (61 a 540 días) y multa de 5 UTM |
| Hasta media UTM | Falta del art. 494 bis (prisión en sus grados mínimo a medio o multa de 1 a 4 UTM) |

**Hurto agravado (art. 447):** abuso de confianza, dependiente doméstico, posadero, etc. Aumento dentro del grado.

**Hurto-falta (art. 494 bis):** cuando el valor no supera media UTM. Posibilidad de salida alternativa.

**Hurto frustrado (CP art. 7 + art. 446):** se castiga la frustración con un grado menos. En la práctica, hurto frustrado de monto menor a media UTM no se sanciona como falta porque el art. 494 bis exige consumación; pero sí se persigue el hurto frustrado de mayor cuantía.

**Aplicación SURP:**
- El módulo `incidents` debe permitir registrar el **valor estimado de lo sustraído en UTM al momento del hecho** (no en pesos, porque la pena se calcula en UTM vigente).
- Distinguir consumado vs. frustrado en el modelo (estado del incidente).
- En hurto de madera/forestal, ver siempre la agravación de la Ley 21.013 antes de cerrar la tipificación.

---

## Robo (CP arts. 432, 433-443)

El robo se diferencia del hurto por la presencia de **violencia, intimidación o fuerza en las cosas**.

### Robo con violencia o intimidación en las personas (arts. 433-439)

| Figura | Norma | Pena |
|---|---|---|
| Robo con violencia o intimidación calificado (homicidio, violación, lesiones graves gravísimas) | Art. 433 | Presidio mayor en su grado máximo a presidio perpetuo calificado |
| Robo con violencia o intimidación simple | Art. 436 inc. 1 | Presidio mayor en sus grados mínimo a máximo |
| Robo por sorpresa | Art. 436 inc. 2 | Presidio menor en sus grados medio a máximo |

### Robo con fuerza en las cosas

| Figura | Norma | Pena |
|---|---|---|
| Robo en lugar habitado o destinado a la habitación | Art. 440 | Presidio mayor en su grado mínimo (5 años y 1 día a 10 años) |
| Robo en lugar no habitado | Art. 442 | Presidio menor en sus grados medio a máximo |
| Robo en bienes nacionales de uso público o sitio no destinado a la habitación | Art. 443 | Presidio menor en sus grados medio a máximo |
| Robo de cables, conductores eléctricos, cajas de servicios | Art. 443 inc. 2 (introducido por Ley 20.273) | Presidio menor en sus grados medio a máximo |
| **Robo de madera en pie, plantaciones forestales o productos forestales** | Art. 443 inc. final (introducido por Ley 21.013) | Presidio menor en sus grados medio a máximo, y se aplican agravantes específicas |

**Ley 21.013 (publicada 6 junio 2017):** agravó las penas de hurto y robo de productos o subproductos forestales, sustracciones desde predios forestales, y trasladó al art. 443 las hipótesis específicas. También introdujo agravantes (concurso de personas, uso de vehículos motorizados, herramientas o medios técnicos para la sustracción).

**Aplicación SURP:**
- El catálogo del legacy llama "Robo" genérico. Para análisis penal hay que sub-tipificar: con violencia/intimidación, con fuerza en lugar habitado/no habitado, robo de madera (Ley 21.013).
- Recomendar en el modelo de datos un campo `subtipoRobo` que permita esta granularidad.
- Cuando el incidente incluya **medios técnicos** (motosierras, camiones, grúas), ese hecho activa la agravante del art. 443 inc. final → registrar la herramienta usada.

---

## Daños (CP arts. 484-488)

**Daños calificados (art. 485):** afectación a archivos, registros, monumentos, bienes de uso público, redes de servicios, o causados con violencia. Pena: reclusión menor en sus grados mínimo a medio y multa de 11 a 15 UTM.

**Daños simples (art. 487):** todo daño no comprendido en el art. 485. Pena: reclusión menor en su grado mínimo o multa de 11 a 20 UTM.

**Daños menores (art. 488):** daños cuyo monto no exceda de 1 UTM. Falta.

**Alteración y destrucción de deslindes (art. 462):** quien alterare los términos o límites de propiedades públicas o privadas con ánimo de lucrarse: presidio menor en su grado mínimo y multa de 11 a 20 UTM. **Esta es la figura típica del catálogo SURP "Alteración y Destrucción de Deslindes"** y aplica directamente a invasiones de predios donde se mueven cercos o se destruyen hitos.

**Aplicación SURP:**
- Daños a infraestructura de patrullaje (cámaras, casetas, vehículos) → art. 485 si hay violencia, art. 487 si no.
- Cercos, hitos, mojones de predio → art. 462 (alteración de deslindes), no art. 487.
- Estimar el monto del daño en UTM para definir si es delito o falta.

---

## Amenazas (CP arts. 296-298)

| Figura | Norma | Pena |
|---|---|---|
| Amenaza seria y verosímil de delito contra personas o bienes con condición ilícita | Art. 296 N° 1-2 | Reclusión menor en sus grados medio a máximo |
| Amenaza simple de delito (sin condición o cumplida la condición) | Art. 296 N° 3 | Reclusión menor en su grado mínimo |
| Amenaza de mal no constitutivo de delito | Art. 297 | Reclusión menor en su grado mínimo |
| Amenaza leve de hecho o de palabra | Art. 494 N° 4 (falta) | Multa de 1 a 4 UTM |

Las amenazas a guardias o personal de la URP que cumplen función de resguardo pueden derivar en figura agravada si se prueba el animus (atemorizar para impedir el ejercicio de la función).

---

## Incendio (CP arts. 474-481)

Ver `/legal-incendios` para tratamiento detallado. Resumen:

- **Incendio con resultado de muerte o lesiones graves (art. 474):** presidio mayor en su grado máximo a presidio perpetuo.
- **Incendio en lugar habitado o donde hubiere personas (art. 475):** presidio mayor en su grado medio a máximo.
- **Incendio en bosques, mieses, pastos, montes o plantíos (art. 476 N° 3):** presidio mayor en su grado mínimo a medio. **Es la figura típica forestal.**
- **Cuasidelito de incendio (art. 477 inc. final remite a art. 490):** culpa o negligencia. Pena reducida.
- **Atentado incendiario:** no es un tipo penal autónomo del CP. Cuando el incendio está conectado con conductas de organización o intimidación pública, puede subsumirse en Ley 12.927 (Seguridad del Estado) art. 6 o Ley 18.314 (antiterrorista) si concurren los elementos del art. 1 de esa ley.

---

## Atentado personal y agresión (CP arts. 261-268, 395-403)

**Atentado contra la autoridad (art. 261):** quien acomete o resiste con violencia a la autoridad pública o sus agentes en ejercicio. Aplicable cuando la víctima es un funcionario público (Carabineros, PDI, fiscales, jueces). **No aplica directamente a guardias privados** porque no son "autoridad pública" en sentido del art. 260, salvo casos en que actúen en auxilio de la fuerza pública.

**Lesiones:**

| Figura | Norma | Pena |
|---|---|---|
| Lesiones graves gravísimas (demencia, inutilidad, impotencia, mutilación) | Art. 397 N° 1 | Presidio mayor en su grado mínimo |
| Lesiones simplemente graves (enfermedad o incapacidad > 30 días) | Art. 397 N° 2 | Presidio menor en su grado medio |
| Lesiones menos graves | Art. 399 | Relegación o presidio menor en sus grados mínimo a medio |
| Lesiones leves | Art. 494 N° 5 (falta) | Multa de 1 a 4 UTM |

**Aplicación SURP:** los incidentes "Atentado Personal" y "Agresión" del catálogo deben sub-tipificarse según gravedad de la lesión. El modelo necesita un campo de **descripción del daño físico** y, cuando exista, certificado médico (atención de urgencia) para fundar la calificación.

---

## Asociación ilícita y crimen organizado

**Asociación ilícita (CP arts. 292-295):** se sanciona el solo hecho de organizarse para cometer crímenes o simples delitos. Penas según rol (jefes, organizadores, meros miembros).

**Ley 21.577 (publicada 13 octubre 2023, "Antiorganizaciones criminales"):** modernizó el régimen de organizaciones criminales. Crea figuras agravadas, técnicas especiales de investigación (agente encubierto, entregas vigiladas, interceptación) y un régimen de cooperación eficaz. Es la **norma de referencia actual** cuando el incidente revela una banda estructurada (división de roles, jerarquía, permanencia, recursos comunes).

**Aplicación SURP:**
- Cuando un incidente forestal revele indicios de banda organizada (uso recurrente de vehículos, presencia de varias personas con roles diferenciados, conexión con receptación), marcar el incidente con un flag `posible_organizacion_criminal` y vincularlo con otros incidentes del mismo modus operandi.
- Esto es funcional al análisis posterior de Fiscalía y permite acumular antecedentes para invocar Ley 21.577.

---

## Porte y tenencia ilegal de armas (Ley 17.798)

**Ley 17.798 sobre control de armas y elementos similares** (BCN: buscar "Ley 17798"). Texto refundido por DS 400/1978 del Ministerio de Defensa.

| Figura | Artículo | Pena |
|---|---|---|
| Tenencia ilegal de armas o municiones | Art. 9 | Presidio menor en su grado medio a máximo |
| Porte ilegal de arma de fuego | Art. 14 | Presidio menor en su grado máximo a presidio mayor en su grado mínimo |
| Tenencia o porte de armas prohibidas (automáticas, hechizas, de mayor calibre) | Art. 14 D | Penas agravadas |
| Tráfico de armas | Art. 10 | Penas mayores |
| Disparos injustificados | Art. 14 D inc. 5 | Reclusión menor en sus grados medio a máximo |

**Diferencia tenencia / porte:**
- **Tenencia:** mantener el arma en un domicilio o lugar autorizado. Ilegal si no está inscrita.
- **Porte:** llevar el arma fuera del domicilio. Requiere permiso especial (raramente concedido a particulares).

**Aplicación SURP:** un guardia privado de empresa contratada por Arauco que es sorprendido portando arma sin permiso comete delito del art. 14, y la empresa de seguridad puede tener responsabilidad. Ver también `/legal-armas-vigilantes`.

---

## Infracción a Ley de Bosques y tala ilegal

**Ley 20.283 sobre recuperación del bosque nativo y fomento forestal (2008):**
- **Art. 22:** sanciona la corta o explotación de bosque nativo sin plan de manejo aprobado por CONAF. Multa de 5 a 10 veces el valor comercial de los productos cortados.
- **Art. 21:** prohibición de corta de especies clasificadas como en peligro de extinción, vulnerables, raras o insuficientemente conocidas.

**DS 4.363 de 1931 (Ley de Bosques):** régimen sectorial histórico, base de varias prohibiciones de corta y de quema. Aún vigente.

**Tala ilegal en sentido amplio:** puede configurar:
1. Infracción administrativa ante CONAF (Ley 20.283).
2. Hurto si se sustraen los productos del predio (CP art. 446 + Ley 21.013).
3. Robo con fuerza si se rompe cerco o se accede mediante daños (CP art. 442 o 443 inc. final).
4. Daños si se talan árboles ajenos sin sustraerlos (CP art. 487).

La **misma conducta puede generar concurso** entre la sanción administrativa de CONAF y el proceso penal. Ver `/legal-procesal` para la concurrencia.

**Aplicación SURP:**
- El módulo de incidentes debe distinguir si la madera fue **extraída** (hurto/robo) o solo **derribada** (daños).
- Vincular siempre al predio para rastrear plan de manejo (o ausencia de él).
- Generar requerimiento paralelo a CONAF cuando proceda.

---

## Plantación ilegal

El catálogo SURP incluye "Plantación Ilegal". Casos típicos:
- Plantación de especies exóticas invasoras sin autorización (raro como tipo penal autónomo, sí como infracción administrativa).
- Cultivo de **cannabis u otras drogas** en predios forestales: **Ley 20.000 art. 8** (cultivo, cosecha o cosecha de especies vegetales productoras de estupefacientes). Pena: presidio menor en su grado máximo a presidio mayor en su grado mínimo.

**Aplicación SURP:** este tipo se cruza con drogas y debe activar protocolo de coordinación con OS-7 de Carabineros y PDI. El modelo del incidente debe permitir clasificar la sub-especie de plantación.

---

## Receptación (CP art. 456 bis A)

Quien tenga en su poder, transporte, compre, venda, transforme o comercialice especies que **conozca o no pueda menos que conocer** que provienen de hurto, robo o apropiación indebida.

| Valor de las especies | Pena |
|---|---|
| Hasta 4 UTM | Presidio menor en su grado mínimo y multa de 5 a 100 UTM |
| Más de 4 UTM | Presidio menor en cualquiera de sus grados y multa de 5 a 100 UTM |

**Receptación de especies forestales** (Ley 21.013 también modificó este artículo): se considera la procedencia ilícita cuando no se puede acreditar el origen lícito mediante guías de libre tránsito, facturas o documentación de CONAF.

**Aplicación SURP:** vincular incidentes de hurto/robo de madera con investigaciones de barracas, aserraderos o exportadores que reciban madera sin documentación. El SURP debería permitir trazar **cadena del producto** cuando se recupera material.

---

## Usurpación (CP arts. 457-462) — ver `/legal-tomas`

Tratamiento detallado en sub-skill especializada. Síntesis:

- **Usurpación violenta (art. 457):** ocupación de inmueble ajeno con violencia.
- **Usurpación no violenta (art. 458):** sin violencia.
- **Modificada por Ley 21.633 (16 noviembre 2023):** aumentó penas, redefinió la flagrancia continuada (mientras dure la ocupación), creó procedimiento especial de desalojo.

---

## Desacato (CPC art. 240)

No es delito del Código Penal sino del **Código de Procedimiento Civil art. 240 inc. 2**: "el que quebrante lo ordenado cumplir [una resolución judicial] será sancionado con reclusión menor en su grado medio a máximo".

**Aplicación SURP:** ocurre cuando una persona desafía una orden judicial de desalojo, una orden de no acercarse al predio, o una medida cautelar.

---

## Abigeato (CP arts. 448 bis y 448 ter, introducidos por Ley 20.090)

Hurto o robo de **animales** (caballos, vacunos, ovinos, caprinos, porcinos o auquénidos) en lugares rurales:

| Figura | Pena |
|---|---|
| Abigeato simple | La pena del hurto o robo respectivo, **aumentada en un grado** |
| Abigeato con uso de medios motorizados o concurso de dos o más personas | Pena mayor + agravantes |
| Receptación de animales | Penas específicas + comiso de los medios usados |

**Aplicación SURP:** poco frecuente en operaciones forestales puras de Arauco, pero relevante si hay predios con ganado o si terceros usan los predios para faenas de abigeato.

---

## Ley de Seguridad del Estado (Ley 12.927) y Ley Antiterrorista (Ley 18.314)

**Ley 12.927 art. 6:** sanciona conductas contra el orden público (incendios, ataques a fuerzas de orden, asociaciones armadas con fines subversivos). Es **norma de aplicación restringida**: requiere querella del Ministerio del Interior o del Intendente para perseguir varios de sus tipos.

**Ley 18.314 antiterrorista:** se aplica cuando los hechos del CP (incendio, secuestro, homicidio, daños) se cometen con la **finalidad** de producir temor en la población o forzar a la autoridad a tomar decisiones (art. 1). Penas significativamente agravadas.

**Aplicación SURP — extrema cautela:**
- La calificación de un hecho como "terrorista" tiene altísima sensibilidad política y técnica. **Nunca debe sugerirse desde el SURP**.
- Lo que el SURP sí debe registrar es la **descripción objetiva del hecho** (panfletos dejados en el sitio, reivindicaciones públicas, modus operandi). La calificación jurídica es competencia exclusiva del Ministerio Público y eventualmente del Ministerio del Interior si presenta querella bajo Ley 12.927 o 18.314.
- El asesor legal de la URP debe limitarse a notificar los hechos a Fiscalía con la mayor objetividad posible.

---

## Concurso de delitos — reglas básicas

Cuando un mismo hecho configura varios tipos (típico en incidentes SURP):

- **Concurso ideal (CP art. 75):** un solo hecho que constituye dos o más delitos. Se aplica la pena mayor del delito más grave.
- **Concurso real (CP art. 74):** varios hechos independientes que constituyen varios delitos. Se aplican las penas de todos.
- **Concurso aparente:** principio de especialidad, consunción o subsidiariedad. Solo se aplica una.

**Ejemplos típicos en SURP:**
- Toma de predio + tala ilegal + daños a cercos = concurso real (usurpación + Ley 20.283 + daños/alteración de deslindes).
- Robo de madera con fuerza en cerco + receptación posterior = concurso real (robo + receptación).
- Incendio que destruye plantación = generalmente concurso aparente (incendio absorbe los daños).

---

## Prescripción de la acción penal (CP art. 94)

| Naturaleza del delito | Plazo de prescripción |
|---|---|
| Crímenes con pena de presidio, reclusión o relegación perpetua | 15 años |
| Demás crímenes | 10 años |
| Simples delitos | 5 años |
| Faltas | 6 meses |

Se cuenta desde la comisión del delito. Se interrumpe por la dirección del procedimiento contra el responsable.

**Aplicación SURP:** el sistema debe permitir consultar la fecha del hecho versus el plazo de prescripción aplicable, y alertar cuando una causa esté próxima a prescribir sin acción procesal.

---

## Cómo asesorar al equipo de desarrollo del SURP en materia penal

1. **Sub-tipificar** los tipos genéricos del catálogo (Hurto, Robo, Daños) con sub-categorías que reflejen las distinciones legales (con/sin fuerza, con/sin violencia, valor en UTM, medios usados).
2. **Capturar agravantes específicas** del dominio forestal: uso de motosierra, camión, grúa, concurso de personas, predio cercado.
3. **Vincular incidentes** del mismo modus operandi para sustentar futuras imputaciones de organización criminal (Ley 21.577).
4. **Estimar valor en UTM** y no en pesos, porque la pena se calcula con la UTM vigente al momento del hecho.
5. **Distinguir consumado / frustrado / tentativa** (CP arts. 7-8) en el flujo de estado del incidente.
6. **Evitar la pre-calificación** de figuras políticas (Ley 12.927, Ley 18.314): el SURP describe hechos, la Fiscalía califica.
7. **Alertar prescripción** con anticipación (90 días antes del vencimiento).
