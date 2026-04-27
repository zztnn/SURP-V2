# useEffect Policy — No Direct useEffect

> **Rule: Never call `useEffect` directly in components.**
> For one-time mount sync with external systems, use `useMountEffect()`.
>
> Based on: ["Why we banned React's useEffect" — Alvin Sng (Factory)](https://x.com/alvinsng/status/2033969062834045089)

---

## Why

Direct `useEffect` is the root cause of the most common React bugs:

- **Brittleness:** Dependency arrays hide coupling. An unrelated refactor can silently change effect behavior.
- **Infinite loops:** `state update -> render -> effect -> state update` loops, especially when dependency lists get "fixed" incrementally.
- **Dependency hell:** Effect chains (A sets state that triggers B) are time-based control flow. Hard to trace, easy to regress.
- **Debugging pain:** "Why did this run?" or "Why did this not run?" with no clear entrypoint like a handler.

This matters even more when agents write code. `useEffect` is often added "just in case," but that is the seed of the next race condition or infinite loop. Banning the hook forces logic to be declarative and predictable.

---

## The Only Allowed Effect Hook: `useMountEffect`

```typescript
// src/hooks/use-mount-effect.ts
import { useEffect } from 'react';

export function useMountEffect(effect: () => void | (() => void)): void {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(effect, []);
}
```

Use `useMountEffect` **only** for one-time external system synchronization:

- DOM integration (focus, scroll position)
- Third-party widget lifecycles
- Browser API subscriptions (resize, intersection, media queries)
- Event listener setup/teardown on mount/unmount

---

## Five Rules That Replace useEffect

### Rule 1: Derive State, Do Not Sync It

Most effects that set state from other state are unnecessary and add extra renders.

```typescript
// BAD: Two render cycles — first stale, then filtered
function ProductList() {
  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);

  useEffect(() => {
    setFilteredProducts(products.filter((p) => p.inStock));
  }, [products]);
}

// GOOD: Compute inline in one render
function ProductList() {
  const [products, setProducts] = useState([]);
  const filteredProducts = products.filter((p) => p.inStock);
}
```

**Smell test:**

- You are about to write `useEffect(() => setX(deriveFromY(y)), [y])`
- You have state that only mirrors other state or props

### Rule 2: Use Data-Fetching Libraries

Effect-based fetching creates race conditions and duplicated caching logic.

```typescript
// BAD: Race condition risk
function ProductPage({ productId }) {
  const [product, setProduct] = useState(null);

  useEffect(() => {
    fetchProduct(productId).then(setProduct);
  }, [productId]);
}

// GOOD: TanStack Query handles cancellation/caching/staleness
function ProductPage({ productId }) {
  const { data: product } = useQuery({
    queryKey: ['product', productId],
    queryFn: () => fetchProduct(productId),
  });
}
```

**Smell test:**

- Your effect does `fetch(...)` then `setState(...)`
- You are re-implementing caching, retries, cancellation, or stale handling

> **Project note:** We use TanStack Query v5 for all server state. See `DESIGN-PATTERNS.md` section on API patterns.

### Rule 3: Event Handlers, Not Effects

If a user clicks a button, do the work in the handler.

```typescript
// BAD: Effect as an action relay
function LikeButton() {
  const [liked, setLiked] = useState(false);

  useEffect(() => {
    if (liked) {
      postLike();
      setLiked(false);
    }
  }, [liked]);

  return <button onClick={() => setLiked(true)}>Like</button>;
}

// GOOD: Direct event-driven action
function LikeButton() {
  return <button onClick={() => postLike()}>Like</button>;
}
```

**Smell test:**

- State is used as a flag so an effect can do the real action
- You are building "set flag -> effect runs -> reset flag" mechanics

### Rule 4: `useMountEffect` for One-Time External Sync

```typescript
// BAD: Guard inside effect
function VideoPlayer({ isLoading }) {
  useEffect(() => {
    if (!isLoading) playVideo();
  }, [isLoading]);
}

// GOOD: Mount only when preconditions are met
function VideoPlayerWrapper({ isLoading }) {
  if (isLoading) return <LoadingScreen />;
  return <VideoPlayer />;
}

function VideoPlayer() {
  useMountEffect(() => playVideo());
}
```

**Smell test:**

- You are synchronizing with an external system
- The behavior is naturally "setup on mount, cleanup on unmount"

### Rule 5: Reset with `key`, Not Dependency Choreography

```typescript
// BAD: Effect attempts to emulate remount behavior
function VideoPlayer({ videoId }) {
  useEffect(() => {
    loadVideo(videoId);
  }, [videoId]);
}

// GOOD: key forces clean remount
function VideoPlayerWrapper({ videoId }) {
  return <VideoPlayer key={videoId} videoId={videoId} />;
}

function VideoPlayer({ videoId }) {
  useMountEffect(() => loadVideo(videoId));
}
```

**Smell test:**

- Your effect's only job is to reset local state when an ID/prop changes
- You want the component to behave like a brand-new instance for each entity

---

## Failure Modes Comparison

| Hook               | Failure mode                                                                        |
| ------------------ | ----------------------------------------------------------------------------------- |
| `useMountEffect`   | Binary and loud — it ran once, or not at all                                        |
| Direct `useEffect` | Gradual degradation — flaky behavior, performance issues, loops before hard failure |

---

## Current State (SURP 2.0)

**El proyecto empieza en verde.** A diferencia del ERP de origen (~94 useEffects en 31 archivos), SURP 2.0 ya nace con:

- **Cero violaciones** en `src/app/**` y `src/components/**` — todos los effects están encapsulados en hooks blessed.
- **`useMountEffect`** disponible en `src/hooks/use-mount-effect.ts`, usado en 5+ componentes.
- **17 hooks blessed** en `src/hooks/` que encapsulan los patrones legítimos:
  - **Browser API observers (Rule 4):** `useResizeObserver`, `useResponsiveColumns`, `useStickyCompact`, `useSidebarResponsive`, `usePageHeaderObserver`.
  - **Browser event subscriptions (Rule 4):** `useWindowKeydown`, `useCustomEventListener`, `usePathnameChange`, `useFullscreenChange`.
  - **DOM sync (Rule 4):** `useStorageSync`, `useCSSCustomProperty`, `useCaretSync` (único `useLayoutEffect`).
  - **Focus / scroll (excepción permitida):** `useScrollIntoView`, `useSearchFocusClamp`.
  - **Lifecycle wrappers (excepciones permitidas):** `useEffectOnChange`, `useEffectWhenReady`.
  - **Otros:** `useDebounce` (timer — excepción permitida), `useLatestRef`, `useMountEffect`.
- **Server state** completamente en TanStack Query v5 — cero fetching basado en effects.

Como punto de entrada nuevo, el costo es mantener el estado actual: **toda nueva pieza de lógica con `useEffect` se justifica contra una de las 5 reglas o las excepciones documentadas más abajo, y vive en `src/hooks/` o `src/providers/`.**

---

## Enforcement

### 1. ESLint (automático)

`apps/web/eslint.config.mjs` aplica `no-restricted-syntax` a **todo** el código fuera de `src/hooks/**` y `src/providers/**`. Bloquea:

- `useEffect` y `React.useEffect`
- `useLayoutEffect` y `React.useLayoutEffect` (solo permitido en hooks para sync de caret/scroll post-mutación)
- `useInsertionEffect` y `React.useInsertionEffect` (reservado a librerías CSS-in-JS)

**No bloqueado:** `useEffectEvent` (React 19, complementario — es la forma canónica de mantener callbacks estables dentro de hooks).

### 2. Code review (humano)

Ver `apps/web/.ai-docs/checklists/PR-REVIEW.md`. Un PR no se aprueba si:

- Introduce un nuevo hook custom con `useEffect` que no encaje en Rule 4 ni en una excepción documentada aquí.
- Mantiene estado-espejo de otro estado/prop (Rule 1 — debería ser inline).
- Usa un effect como relay para acciones de usuario (Rule 3 — debería ser event handler).
- Reset de instancia con effect en vez de `key` (Rule 5).

### 3. Agentes / Claude Code

`CLAUDE.md` (raíz) regla #16 obliga a leer este policy antes de tocar effects. Los agentes nunca escriben `useEffect` directo en componentes — solo consumen los hooks blessed o, si necesitan uno nuevo, lo crean en `src/hooks/` y documentan la Regla del policy que implementa en el header del archivo.

---

## Permitted Exceptions

Las excepciones se permiten **solo dentro de `src/hooks/**`o`src/providers/**`**.
Desde un componente o página siempre se consume el hook, no se escribe `useEffect`
inline. Cada excepción tiene un caso de uso real en SURP 2.0; si tu pattern no
encaja en ninguna de estas, levanta la pregunta en code review antes de añadir
una nueva.

### Debounce / throttle con timer

```tsx
// src/hooks/use-debounce.ts
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(value);
    }, delay);
    return () => {
      clearTimeout(t);
    };
  }, [value, delay]);
  return debounced;
}
```

**Por qué:** la Regla 1 (derive) exige que el valor se compute inline, pero
debounce inherentemente involucra **tiempo** — no se puede derivar del input
sin un timer. El effect aquí es la única forma de schedule + cleanup correcto.
Cubre también `useThrottle` y similares.

### DOM attribute sync desde un store (provider)

```tsx
// src/providers/preferences-provider.tsx
useEffect(() => {
  document.documentElement.dataset['theme'] = preset;
}, [preset]);
```

**Por qué:** un store global (Zustand) cambia y el `<html>` necesita reflejarlo.
No se puede derivar inline — el `<html>` está fuera del árbol React. Patrón
acotado a `src/providers/**`. Ideal: extraer a `useDomAttributeSync(name, value)`
para mantener los providers declarativos.

### Focus Management After State Transition

```tsx
useEffect(() => {
  if (step === 'scanned') {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => {
      clearTimeout(timer);
    };
  }
  return undefined;
}, [step]);
```

**Why:** Focus is a browser DOM side-effect, not derivable from state. The timeout
ensures the target element is mounted and visible after a render cycle.

### Query-Driven State Machine Transitions

```tsx
useEffect(() => {
  if (scanResult && step === 'idle') {
    setStep('scanned');
  }
}, [scanResult, step]);
```

**Why:** TanStack Query data arrival triggers a workflow transition. This cannot be
handled in an event handler because the scan is triggered by a query `enabled` flag,
not a click.

### Keyboard Listeners (when not using FloatingActionBar)

```tsx
useEffect(() => {
  if (!isVisible) return;
  function handleKeyDown(e: KeyboardEvent): void { ... }
  window.addEventListener("keydown", handleKeyDown);
  return () => { window.removeEventListener("keydown", handleKeyDown); };
}, [isVisible, ...]);
```

**Why:** Global keyboard shortcuts require `window.addEventListener`, a browser API.

---

## Reference

- [React docs: You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)
- [Original article by Alvin Sng (@alvinsng) — Factory](https://x.com/alvinsng/status/2033969062834045089)
