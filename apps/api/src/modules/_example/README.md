# Módulo plantilla — Pattern B (Clean Architecture)

> **Esta carpeta es una plantilla de referencia, NO se monta en `AppModule`.**
> El prefijo `_` la excluye de la convención normal y deja claro que es ejemplo.
>
> Cuando crees un módulo nuevo de dominio (ej. `cases`, `incidents`), copia
> esta estructura y reemplaza `Example` con el nombre real.

## Layout

```
modules/_example/
├── domain/
│   └── example.ts                     ← entidad de dominio + invariantes
├── ports/
│   └── example.repository.port.ts     ← interface + Symbol token
├── infrastructure/
│   └── kysely-example.repository.ts   ← implementación Kysely de la port
├── use-cases/
│   └── get-example-by-code.use-case.ts ← UN use case por verbo de dominio
├── dto/
│   └── get-example-by-code.dto.ts     ← contrato de input HTTP
├── example.controller.ts              ← controller delgado: parsea + invoca use case
├── example.module.ts                  ← wiring NestJS
├── README.md                          ← este archivo + USE-CASES.md cuando crece
└── use-cases/get-example-by-code.use-case.spec.ts ← test unitario obligatorio
```

## Reglas

1. **Use case por verbo de dominio.** `OpenCaseUseCase`, `CloseCaseWithRulingUseCase`,
   no `CreateCaseUseCase` genérico.
2. **`execute(input, ctx)`** — único método público. `ctx: RequestContext`.
3. **Lógica de negocio** vive en `domain/` o en el cuerpo del use case.
   Nunca en services genéricos, controllers, repositories ni processors.
4. **Repos como ports** — el use case inyecta el `Symbol` token, no la
   clase concreta. Esto permite mockear en tests sin tocar Kysely.
5. **Mapper en infrastructure/** traduce row Kysely (snake_case, GeoJSON
   plain) ↔ entidad de dominio (camelCase, value objects). Es el único
   lugar que sabe de ambos idiomas.
6. **Controller delgado:** un endpoint por verbo. `POST /cases/:id/close`,
   no `PATCH /cases/:id` con flags.
7. **Test unitario** obligatorio del use case con port mockeada. Cada
   invariante tiene un test.
8. **No imports cross-module:** `modules/cases/**` no puede importar de
   `modules/incidents/**` directamente. Si necesitan comunicarse, exportan
   un servicio público en su `index.ts` y el otro lo importa desde el
   módulo. Enforcado por ESLint en Fase 5.

## Cuándo NO usar Pattern B

Si el módulo es un mantenedor CRUD trivial (ej. `catalog/zones`,
`catalog/incident-types`) usa Pattern A — ver
`apps/api/.ai-docs/standards/MODULE-ANATOMY.md`.

Regla rápida: si las invariantes del dominio caben en `class CRUDService`
con `findAll`/`findById`/`create`/`update`/`softDelete`, es Pattern A.
Si hay verbos como `close`, `reopen`, `escalate`, `block`, `link`, es B.
