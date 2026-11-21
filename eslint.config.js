import js from '@eslint/js'
import nextPlugin from '@next/eslint-plugin-next'
import jsxA11y from 'eslint-plugin-jsx-a11y-x'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// One config for the whole workspace. Rule sets follow WORKFLOW-STANDARD § 9:
// accessibility, type-checked promise rules and exhaustive hook dependencies as
// errors, from the first commit rather than added later.
export default defineConfig([
  globalIgnores([
    '**/dist',
    '**/.next',
    '**/coverage',
    '**/node_modules',
    '**/next-env.d.ts',
    '**/storybook-static',
  ]),

  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
    },
  },

  {
    files: ['**/*.tsx'],
    extends: [reactHooks.configs.flat.recommended],
    // A missing dependency is a stale closure, so it fails rather than warns.
    rules: { 'react-hooks/exhaustive-deps': 'error' },
  },

  {
    files: ['**/*.tsx'],
    ignores: ['**/*.test.tsx'],
    ...jsxA11y.configs.recommended,
  },

  {
    files: ['apps/docs/**/*.{ts,tsx}'],
    plugins: { '@next/next': nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
    settings: { next: { rootDir: 'apps/docs' } },
  },

  {
    files: ['**/*.{js,mjs}', '**/*.config.ts'],
    languageOptions: { globals: globals.node },
  },

  {
    files: ['**/*.{js,mjs}'],
    extends: [js.configs.recommended],
  },
])
