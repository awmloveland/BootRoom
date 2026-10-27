/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    // Next resolves 'server-only' itself; Jest gets the same no-op module.
    '^server-only$': '<rootDir>/node_modules/next/dist/compiled/server-only/empty.js',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.test.json',
    }],
  },
  // Only files ending in .test.ts(x) are treated as test files — lets
  // shared fixtures/helpers live under __tests__/helpers without being run.
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)', '**/?(*.)+(spec|test).[jt]s?(x)'],
}

module.exports = config
