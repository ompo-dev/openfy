module.exports = {
  preset: 'jest-expo',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['react-native-gesture-handler/jestSetup', '<rootDir>/jest.setup.js'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/'],
  testMatch: ['**/__tests__/**/*.unit.test.ts?(x)'],
  transformIgnorePatterns: [
    'node_modules/(?!((?:\\.pnpm/[^/]+/node_modules/)?(?:jest-)?@react-native|(?:\\.pnpm/[^/]+/node_modules/)?(?:jest-)?react-native|(?:\\.pnpm/[^/]+/node_modules/)?@expo|(?:\\.pnpm/[^/]+/node_modules/)?@expo-module|(?:\\.pnpm/[^/]+/node_modules/)?expo|(?:\\.pnpm/[^/]+/node_modules/)?@react-navigation|(?:\\.pnpm/[^/]+/node_modules/)?@unimodules|(?:\\.pnpm/[^/]+/node_modules/)?expo-modules-core|(?:\\.pnpm/[^/]+/node_modules/)?@testing-library|(?:\\.pnpm/[^/]+/node_modules/)?@shopify/react-native-skia))',
  ],
  moduleNameMapper: {
    '^@/components/atoms/AppText$': '<rootDir>/components/gym/AppText.tsx',
    '^@/components/atoms/GlassSurface$': '<rootDir>/components/native/GlassSurface',
    '^@/constants/theme$': '<rootDir>/components/gym/theme.ts',
    '^@/hooks/use-colors$': '<rootDir>/components/gym/useColors.ts',
    '^@/core/log$': '<rootDir>/utils/appLogger.ts',
    '^@/core/appModals$': '<rootDir>/components/gym/appModals.ts',
    '^@/i18n$': '<rootDir>/components/gym/i18n.ts',
    '^@/(.*)$': '<rootDir>/vendor/gym-notes/src/$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.(png|jpg|jpeg|gif|svg)$': '<rootDir>/jest.asset-mock.js',
  },
};
