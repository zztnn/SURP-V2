import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import nextCoreWebVitalsRaw from 'eslint-config-next/core-web-vitals';
import security from 'eslint-plugin-security';
import react from 'eslint-plugin-react';

// typescript-eslint strictTypeChecked registra su propio plugin `@typescript-eslint`.
// eslint-config-next también lo registra — en flat config v10 no se puede duplicar.
// Stripeamos el registro de Next para evitar el conflicto.
const nextCoreWebVitals = nextCoreWebVitalsRaw.map((cfg) => {
  if (cfg.plugins && '@typescript-eslint' in cfg.plugins) {
    const { '@typescript-eslint': _removed, ...rest } = cfg.plugins;
    return { ...cfg, plugins: rest };
  }
  return cfg;
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const tsFiles = ['**/*.ts', '**/*.tsx'];

const eslintConfig = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'dist/**',
      'coverage/**',
      'next-env.d.ts',
      '*.config.mjs',
      '*.config.js',
      '*.config.ts',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked.map((c) => ({ ...c, files: tsFiles })),
  ...tseslint.configs.stylisticTypeChecked.map((c) => ({ ...c, files: tsFiles })),
  ...nextCoreWebVitals,
  eslintConfigPrettier,
  {
    files: tsFiles,
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    plugins: {
      security,
      react,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
          allowDirectConstAssertionInArrowFunctions: true,
          allowConciseArrowFunctionExpressionsStartingWithVoid: true,
        },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true },
      ],
      '@typescript-eslint/prefer-nullish-coalescing': [
        'error',
        { ignorePrimitives: { string: true } },
      ],
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],

      'security/detect-object-injection': 'off',
      'security/detect-eval-with-expression': 'error',
      'security/detect-unsafe-regex': 'error',

      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'type'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
          pathGroups: [{ pattern: '@/**', group: 'internal', position: 'before' }],
          pathGroupsExcludedImportTypes: ['type'],
        },
      ],
      'import/no-duplicates': 'error',

      'react/no-danger': 'error',
      'react/jsx-no-target-blank': 'error',
      'react/self-closing-comp': 'error',

      // Effects directos están prohibidos en componentes/páginas — usar
      // useMountEffect o un hook custom de src/hooks/. El override de abajo
      // habilita las excepciones permitidas en src/hooks/** y src/providers/**.
      // Ver `apps/web/.ai-docs/standards/USE-EFFECT-POLICY.md`.
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='useEffect']",
          message:
            'useEffect directo está prohibido. Usar useMountEffect desde @/hooks/use-mount-effect, o crear un hook custom en src/hooks/. Ver USE-EFFECT-POLICY.md.',
        },
        {
          selector: "CallExpression[callee.object.name='React'][callee.property.name='useEffect']",
          message: 'React.useEffect directo está prohibido. Usar useMountEffect. Ver USE-EFFECT-POLICY.md.',
        },
        {
          selector: "CallExpression[callee.name='useLayoutEffect']",
          message:
            'useLayoutEffect directo está prohibido. Solo permitido dentro de src/hooks/** para sync de caret/scroll post-mutación. Ver USE-EFFECT-POLICY.md.',
        },
        {
          selector: "CallExpression[callee.object.name='React'][callee.property.name='useLayoutEffect']",
          message: 'React.useLayoutEffect directo está prohibido. Ver USE-EFFECT-POLICY.md.',
        },
        {
          selector: "CallExpression[callee.name='useInsertionEffect']",
          message:
            'useInsertionEffect está reservado para librerías CSS-in-JS, no para código de aplicación. Ver USE-EFFECT-POLICY.md.',
        },
        {
          selector: "CallExpression[callee.object.name='React'][callee.property.name='useInsertionEffect']",
          message: 'React.useInsertionEffect está reservado para librerías CSS-in-JS. Ver USE-EFFECT-POLICY.md.',
        },
      ],
      'react-hooks/incompatible-library': 'off',

      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      'no-alert': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      curly: 'error',
      'max-lines': ['error', { max: 1000, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ['src/hooks/**/*.ts', 'src/hooks/**/*.tsx', 'src/providers/**/*.tsx'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    files: ['src/app/api/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['src/app/layout.tsx'],
    rules: {
      'react/no-danger': 'off',
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.spec.tsx', '**/*.test.ts', '**/*.test.tsx'],
    rules: {
      'max-lines': ['error', { max: 1500, skipBlankLines: true, skipComments: true }],
    },
  },
];

export default eslintConfig;
