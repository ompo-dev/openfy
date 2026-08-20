const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: ['**/__mocks__/**', '**/scripts/**'],
    rules: {
      // React Compiler diagnostics do not understand React Native Animated and
      // Reanimated shared values yet; retain the established lint rules without
      // treating those framework patterns as build-breaking errors.
      'react-hooks/immutability': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/static-components': 'off',
      'import/export': 'off',
    },
  },
];
