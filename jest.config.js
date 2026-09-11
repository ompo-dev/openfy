module.exports = {
  preset: 'jest-expo',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/'],
  testMatch: ['**/__tests__/**/*.unit.test.ts?(x)'],
  transformIgnorePatterns: [
    'node_modules/(?!((?:\\.pnpm/[^/]+/node_modules/)?(?:jest-)?@react-native|(?:\\.pnpm/[^/]+/node_modules/)?(?:jest-)?react-native|(?:\\.pnpm/[^/]+/node_modules/)?@expo|(?:\\.pnpm/[^/]+/node_modules/)?@expo-module|(?:\\.pnpm/[^/]+/node_modules/)?expo|(?:\\.pnpm/[^/]+/node_modules/)?@react-navigation|(?:\\.pnpm/[^/]+/node_modules/)?@unimodules|(?:\\.pnpm/[^/]+/node_modules/)?expo-modules-core|(?:\\.pnpm/[^/]+/node_modules/)?@testing-library|(?:\\.pnpm/[^/]+/node_modules/)?@shopify/react-native-skia))',
  ],
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.(png|jpg|jpeg|gif|svg)$': 'jest-transform-stub',
  },
};
