// Aquí configuro ESLint con reglas enfocadas en detectar errores reales de ejecución sin imponer formato rígido.
// Se ejecuta con `npm run lint` y de forma automática en la integración continua.
import globals from 'globals';

const ERROR_RULES = Object.freeze({
  'constructor-super': 'error',
  'for-direction': 'error',
  'getter-return': 'error',
  'no-async-promise-executor': 'error',
  'no-class-assign': 'error',
  'no-compare-neg-zero': 'error',
  'no-cond-assign': ['error', 'except-parens'],
  'no-const-assign': 'error',
  'no-constant-binary-expression': 'error',
  'no-debugger': 'error',
  'no-dupe-args': 'error',
  'no-dupe-class-members': 'error',
  'no-dupe-else-if': 'error',
  'no-dupe-keys': 'error',
  'no-duplicate-case': 'error',
  'no-empty-character-class': 'error',
  'no-ex-assign': 'error',
  'no-func-assign': 'error',
  'no-import-assign': 'error',
  'no-invalid-regexp': 'error',
  'no-loss-of-precision': 'error',
  'no-new-native-nonconstructor': 'error',
  'no-obj-calls': 'error',
  'no-redeclare': 'error',
  'no-self-assign': 'error',
  'no-setter-return': 'error',
  'no-sparse-arrays': 'error',
  'no-this-before-super': 'error',
  'no-undef': 'error',
  'no-unexpected-multiline': 'error',
  'no-unreachable': 'error',
  'no-unsafe-finally': 'error',
  'no-unsafe-negation': 'error',
  'no-unsafe-optional-chaining': 'error',
  'no-unused-private-class-members': 'error',
  'use-isnan': 'error',
  'valid-typeof': 'error'
});

export default [
  { ignores: ['dist/**', 'node_modules/**', 'public/**', 'evidence/**', 'source-assets/**', 'docs/**'] },
  {
    // Aplicación (navegador, módulos de Vite).
    files: ['src/**/*.js', 'vite.config.js', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.browser, ...globals.node } },
    rules: ERROR_RULES
  },
  {
    // Pruebas y guiones (Node; los guiones de navegador evalúan funciones dentro de la página).
    files: ['tests/**/*.mjs', 'scripts/**/*.mjs', 'scripts/**/*.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.node, ...globals.browser } },
    rules: ERROR_RULES
  }
];
