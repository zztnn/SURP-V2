// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-plugin-prettier/recommended';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      '*.config.mjs',
      'src/database/generated/**',
      // Scripts de dev one-off — ejecutados con ts-node, no parte del build.
      // Pasan typecheck dedicado vía `ts-node --transpile-only`.
      'scripts/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.strictTypeChecked,
  prettier,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Reglas de STACK.md (errores, no warnings)
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: 'error',
      'no-eval': 'error',
      'max-lines': ['error', { max: 1000, skipBlankLines: true, skipComments: true }],
      // TypeScript estricto — no any
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // NestJS modules son clases vacías con decoradores — patrón estándar.
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
  {
    // Cross-module imports prohibidos: un módulo de dominio NO puede
    // importar directamente código de otro módulo. Si necesita comunicarse,
    // ambos exportan vía su index.ts y el otro lo importa desde el path
    // del módulo (`modules/cases` en lugar de `modules/cases/use-cases/...`).
    files: ['src/modules/**/*.ts'],
    ignores: ['src/modules/**/*.spec.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../../*/use-cases/*', '../../*/domain/*', '../../*/infrastructure/*', '../../*/ports/*'],
              message:
                'Import cross-module a internals prohibido. Importar desde el index.ts público del otro módulo.',
            },
          ],
        },
      ],
    },
  },
  {
    // Tests permiten archivos más largos y son más laxos con tipos.
    files: ['**/*.spec.ts', '**/*.test.ts'],
    rules: {
      'max-lines': ['error', { max: 1500, skipBlankLines: true, skipComments: true }],
      '@typescript-eslint/no-explicit-any': 'off',
      // jest.Mocked<T> + expect(mock.method) confunden al rule de unbound-method
      // porque mock.method es jest.fn(); el aviso no aporta en tests.
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  {
    // Catálogos declarativos (`*.catalog.ts`): datos planos sin lógica.
    // Pueden crecer mucho — el catálogo de permisos hoy son 171 entradas
    // × 7 líneas tras prettier ≈ 1.4k líneas. Si rompiéramos en archivos
    // por módulo perderíamos la fuente única; preferimos elevar el límite.
    files: ['src/**/*.catalog.ts'],
    rules: {
      'max-lines': ['error', { max: 2000, skipBlankLines: true, skipComments: true }],
    },
  },
);
