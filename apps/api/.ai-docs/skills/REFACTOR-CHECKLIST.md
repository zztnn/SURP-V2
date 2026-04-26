# Refactor Checklist — Backend SURP 2.0

> Antes y durante cualquier refactoring significativo.

---

## Antes de empezar

- [ ] ¿Por qué refactorizo? (deuda técnica, módulo demasiado grande, cambio de pattern A→B)
- [ ] ¿El módulo tiene tests que verifican el comportamiento actual?
- [ ] ¿Hay otros módulos que importan de aquí? (revisar `imports` en `*.module.ts`)
- [ ] ¿Hay impacto en el schema de BD? (si sí: nueva migración SQL)

---

## Durante el refactoring

- [ ] `pnpm typecheck` pasa en cada paso intermedio (no solo al final)
- [ ] Tests existentes siguen pasando
- [ ] Sin cambios de comportamiento observable (refactor, no feature)
- [ ] Sin regressions en permisos/guards

---

## Pattern A → Pattern B (escalación)

Cuando un módulo A crece y necesita Clean Architecture:

1. Crear carpeta `domain/` con la clase de dominio pura.
2. Crear carpeta `ports/` con la interface del repository.
3. Mover la lógica de negocio del service a use-cases.
4. Crear `infrastructure/` con la implementación Kysely del port (archivo `kysely-{entity}.repository.ts`).
5. Crear `infrastructure/{entity}.mapper.ts` para row ↔ dominio.
6. Actualizar el `module.ts` con el wiring de DI.
7. Eliminar el `service.ts` monolítico original.

---

## Después

- [ ] `pnpm typecheck` + `pnpm lint` + `pnpm test` + `pnpm build` pasan
- [ ] Ningún `any` introducido en el proceso
- [ ] Documentar en el PR por qué se hizo el refactoring
