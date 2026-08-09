import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

/**
 * Beyond the Next.js defaults, these rules encode architectural decisions that
 * are easy to violate accidentally and expensive to unwind later: module
 * boundaries, a framework-free domain layer, and permission-based authorization.
 */
const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      'drizzle/migrations/**',
      'next-env.d.ts',
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/modules/*/data/*', '!@/modules/*/data/index'],
              message:
                'Cross-module data-layer imports are forbidden. Use the module public API (modules/<name>/index.ts).',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "BinaryExpression[operator='==='] > MemberExpression[property.name='roleName']",
          message: 'Authorize by permission key, never by role name.',
        },
      ],
    },
  },
  {
    // Module barrels stay import-safe from Node: UI lives behind `<module>/ui`.
    files: ['src/modules/*/index.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['./ui', './ui/**'],
              message:
                'Do not re-export UI from a module barrel. Export it from `src/modules/<module>/ui.ts` so application and domain imports stay free of React and `server-only`.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['tests/**/*.{ts,tsx}'],
    rules: {
      // Tests render primitives in isolation; there are no Next.js pages behind
      // the hrefs they use as fixtures.
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
  {
    files: ['src/modules/*/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'next', 'next/*'],
              message: 'Domain layer must stay framework-free.',
            },
            {
              group: ['**/data/**', '@/shared/db/**'],
              message: 'Domain layer must not access persistence.',
            },
          ],
        },
      ],
    },
  },
];

export default config;
