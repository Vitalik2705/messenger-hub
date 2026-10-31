import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^[A-Z_]', ignoreRestSiblings: true }],
      // A const read before its line is a crash on first render that no other rule reports.
      // Calls from inside closures run later and are fine, hence functions/variables: false.
      'no-use-before-define': ['error', { functions: false, variables: false, classes: true }],
      // Context modules export their hook next to the provider, which is the usual shape.
      'react-refresh/only-export-components': ['error', {
        allowConstantExport: true,
        allowExportNames: ['useAuth', 'useThemeMode', 'useToast', 'usePresentation'],
      }],
    },
  },
])
