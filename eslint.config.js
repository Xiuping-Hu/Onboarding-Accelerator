import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import prettier from 'eslint-config-prettier';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/.next/**',
      '**/dist/**',
      '**/next-env.d.ts',
      'coverage/**',
      'node_modules/**',
      'docs/harness/generated/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
  },
  {
    files: ['apps/web/src/{app,components}/**/*.{ts,tsx}'],
    plugins: {
      '@next/next': nextPlugin,
      react,
      'react-hooks': reactHooks,
    },
    languageOptions: {
      globals: globals.browser,
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
  {
    files: ['apps/web/src/components/common/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@onboarding/shared',
              message: 'Common components must not depend on product domain models.',
            },
          ],
          patterns: [
            {
              group: [
                '@/app/**',
                '@/features/**',
                '@/server/**',
                '**/app/**',
                '**/features/**',
                '**/server/**',
              ],
              message: 'Common components may only depend on lower-level, domain-neutral code.',
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      'apps/web/src/app/login/**/*.tsx',
      'apps/web/src/app/workspace/**/*.tsx',
      'apps/web/src/app/admin/**/*.tsx',
    ],
    ignores: ['apps/web/src/app/**/page.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/server/**', '**/server/**'],
              message: 'Page components must not depend on server modules.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/web/src/app/admin/**/*.tsx'],
    ignores: ['apps/web/src/app/**/page.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/app/workspace/**', '@/server/**', '**/app/workspace/**', '**/server/**'],
              message: 'Admin page components must not depend on server modules or workspace UI.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/web/src/server/**/*.ts', 'apps/web/src/app/**/route.ts', 'scripts/**/*.mjs'],
    languageOptions: {
      globals: globals.node,
    },
  },
  prettier,
);
