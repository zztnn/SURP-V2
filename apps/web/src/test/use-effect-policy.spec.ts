import path from 'node:path';

import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

/**
 * Regresión del enforcement del USE-EFFECT-POLICY.md.
 *
 * Lintea snippets sintéticos contra la config real del proyecto y verifica:
 *   1. Que `useEffect`, `useLayoutEffect`, `useInsertionEffect`
 *      directos en componentes/páginas son flaggeados con el mensaje
 *      del policy.
 *   2. Que los mismos hooks en `src/hooks/**` y `src/providers/**` NO
 *      son flaggeados (la override del ESLint los permite).
 *
 * Si alguien refactoriza `eslint.config.mjs` y rompe el enforcement,
 * este test falla en CI antes de llegar a producción.
 *
 * Usa `lintText` apuntando a paths REALES del proyecto (los archivos
 * existen en disco) — eso satisface el `projectService` de typescript-eslint
 * que valida que el archivo esté en el `tsconfig`. El contenido se reemplaza
 * por el snippet sintético; el path solo se usa para resolver overrides.
 */

const cwd = path.resolve(__dirname, '..', '..');

// Paths reales del repo, usados solo para que el `projectService` de
// typescript-eslint resuelva la config. El contenido viene del snippet.
const PATH_COMPONENT = path.join(cwd, 'src/components/data-list-view.tsx');
const PATH_HOOK = path.join(cwd, 'src/hooks/use-mount-effect.ts');
const PATH_PROVIDER = path.join(cwd, 'src/providers/preferences-provider.tsx');

function makeLinter(): ESLint {
  return new ESLint({ cwd });
}

const COMPONENT_USE_EFFECT = `
import { useEffect } from 'react';
export function Bad(): null {
  useEffect((): void => { return undefined; }, []);
  return null;
}
`;

const COMPONENT_USE_LAYOUT_EFFECT = `
import { useLayoutEffect } from 'react';
export function Bad(): null {
  useLayoutEffect((): void => { return undefined; }, []);
  return null;
}
`;

const COMPONENT_USE_INSERTION_EFFECT = `
import { useInsertionEffect } from 'react';
export function Bad(): null {
  useInsertionEffect((): void => { return undefined; }, []);
  return null;
}
`;

const COMPONENT_REACT_NS_USE_EFFECT = `
import * as React from 'react';
export function Bad(): null {
  React.useEffect((): void => { return undefined; }, []);
  return null;
}
`;

const HOOK_USE_EFFECT = `
import { useEffect } from 'react';
export function useExample(): void {
  useEffect((): void => { return undefined; }, []);
}
`;

interface PolicyViolation {
  ruleId: string;
  messageContains: string;
}

function violations(messages: ESLint.LintResult['messages']): PolicyViolation[] {
  return messages
    .filter((m) => m.ruleId === 'no-restricted-syntax')
    .map((m) => ({
      ruleId: m.ruleId ?? '',
      messageContains: m.message,
    }));
}

describe('USE-EFFECT-POLICY ESLint enforcement', () => {
  it('flaggea useEffect directo en un componente', async () => {
    const linter = makeLinter();
    const [result] = await linter.lintText(COMPONENT_USE_EFFECT, {
      filePath: PATH_COMPONENT,
    });
    const v = violations(result?.messages ?? []);
    expect(v).toHaveLength(1);
    expect(v[0]?.messageContains).toMatch(/useEffect directo está prohibido/);
    expect(v[0]?.messageContains).toMatch(/USE-EFFECT-POLICY\.md/);
  });

  it('flaggea useLayoutEffect directo en un componente', async () => {
    const linter = makeLinter();
    const [result] = await linter.lintText(COMPONENT_USE_LAYOUT_EFFECT, {
      filePath: PATH_COMPONENT,
    });
    const v = violations(result?.messages ?? []);
    expect(v).toHaveLength(1);
    expect(v[0]?.messageContains).toMatch(/useLayoutEffect directo está prohibido/);
  });

  it('flaggea useInsertionEffect directo en un componente', async () => {
    const linter = makeLinter();
    const [result] = await linter.lintText(COMPONENT_USE_INSERTION_EFFECT, {
      filePath: PATH_COMPONENT,
    });
    const v = violations(result?.messages ?? []);
    expect(v).toHaveLength(1);
    expect(v[0]?.messageContains).toMatch(/useInsertionEffect/);
  });

  it('flaggea React.useEffect directo en un componente', async () => {
    const linter = makeLinter();
    const [result] = await linter.lintText(COMPONENT_REACT_NS_USE_EFFECT, {
      filePath: PATH_COMPONENT,
    });
    const v = violations(result?.messages ?? []);
    expect(v).toHaveLength(1);
    expect(v[0]?.messageContains).toMatch(/React\.useEffect directo está prohibido/);
  });

  it('NO flaggea useEffect dentro de src/hooks/**', async () => {
    const linter = makeLinter();
    const [result] = await linter.lintText(HOOK_USE_EFFECT, {
      filePath: PATH_HOOK,
    });
    const v = violations(result?.messages ?? []);
    expect(v).toHaveLength(0);
  });

  it('NO flaggea useEffect dentro de src/providers/**', async () => {
    const linter = makeLinter();
    const [result] = await linter.lintText(
      HOOK_USE_EFFECT.replace('useExample', 'PolicyFixtureProvider'),
      { filePath: PATH_PROVIDER },
    );
    const v = violations(result?.messages ?? []);
    expect(v).toHaveLength(0);
  });
});
