# Módulos de dominio — convenciones

Cada subcarpeta es un **bounded context** o **entidad principal** dentro
de un BC. Sigue Pattern A (CRUD fino) o Pattern B (Clean Architecture)
según el doc en `apps/api/.ai-docs/standards/MODULE-ANATOMY.md`.

## Reglas

1. **Una carpeta por BC/entidad principal.** Ejemplo:
   - `modules/cases/` (BC completo)
   - `modules/incidents/`
   - `modules/persons/` (raíz parties + natural_persons + legal_entities)
   - `modules/catalog/zones/`, `modules/catalog/incident-types/` (cada
     mantenedor independiente)

2. **No imports cross-module hacia internals.** Un módulo solo importa
   del `index.ts` público de otro. Esta regla está **enforcada por ESLint**:

   ```
   ❌ import { OpenCaseUseCase } from '../cases/use-cases/open-case.use-case';
   ✅ import { OpenCaseUseCase } from '../cases';
   ```

3. **Cada Pattern B tiene `index.ts` que decide qué se expone.** Si no se
   exporta, no es accesible desde fuera del módulo. Esto da encapsulamiento
   real (NestJS mismo no enforce — la regla de ESLint sí).

4. **`USE-CASES.md` por BC** una vez tenga ≥3 use cases, listando cada
   uno con descripción de una línea + invariantes resueltas. Es referencia
   para negocio y migración legacy.

5. **El módulo plantilla `_example/` muestra el shape de Pattern B**
   completo (domain + ports + infrastructure + use-cases + dto + module).
   No se monta en `AppModule` (el `_` lo excluye).

6. **Numeración**. No la hay. Las carpetas se nombran por BC/entidad,
   alphabetic. El orden de bootstrap se decide en `app.module.ts` por
   cómo se importen.

## Convención de archivos

| Layer         | Pattern                                                               | Ejemplo                                    |
| ------------- | --------------------------------------------------------------------- | ------------------------------------------ |
| Domain        | `domain/<entity>.ts`                                                  | `domain/case.ts`                           |
| Port          | `ports/<entity>.repository.port.ts`                                   | `ports/case.repository.port.ts`            |
| Infra         | `infrastructure/kysely-<entity>.repository.ts` + `<entity>.mapper.ts` | `infrastructure/kysely-case.repository.ts` |
| Use case      | `use-cases/<verb>-<entity>.use-case.ts`                               | `use-cases/open-case.use-case.ts`          |
| DTO           | `dto/<verb>-<entity>.dto.ts`                                          | `dto/open-case.dto.ts`                     |
| Controller    | `<bc>.controller.ts`                                                  | `cases.controller.ts`                      |
| Module        | `<bc>.module.ts`                                                      | `cases.module.ts`                          |
| Test domain   | `domain/<entity>.spec.ts`                                             | `domain/case.spec.ts`                      |
| Test use case | `use-cases/<verb>-<entity>.use-case.spec.ts`                          |                                            |

## Ver también

- `_example/README.md` — plantilla de Pattern B paso a paso.
- `apps/api/.ai-docs/standards/MODULE-ANATOMY.md` — spec completo Pattern A vs B.
- `apps/api/.ai-docs/skills/CHOOSE-MODULE-PATTERN.md` — regla rápida.
- `STACK.md §5.bis` — ADR-B-020 (use cases como fuente de verdad).
