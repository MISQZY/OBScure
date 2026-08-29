import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: [
      'out/**',
      'dist/**',
      'dist-electron/**',
      'build/**',
      'resources/**',
      'node_modules/**',
      'docs/**',
      '.claude/**',
      // Plain browser scripts served straight to OBS/the Scene Builder
      // preview — not part of the TS project, no point type-aware linting.
      'overlays/**',
      '*.tsbuildinfo'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'off'
    }
  },
  {
    // Plain script tags served straight from src/renderer/public/ — run in
    // the page before any bundling, so plain browser globals, not the vite
    // build's module graph.
    files: ['src/renderer/public/**/*.js'],
    languageOptions: {
      globals: globals.browser
    }
  },
  {
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts'],
    languageOptions: {
      globals: globals.node
    }
  },
  {
    files: ['src/shared/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser }
    }
  },
  {
    files: ['**/*.{ts,tsx,js,mjs}'],
    rules: {
      // Plenty of existing code uses a leading underscore for an
      // intentionally-unused arg/destructure — don't flag those.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }
      ],
      '@typescript-eslint/no-explicit-any': 'warn'
    }
  },
  {
    files: ['*.{js,mjs,cjs}', 'electron.vite.config.ts'],
    languageOptions: {
      globals: globals.node
    }
  }
)
