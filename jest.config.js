/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      // Override module and moduleResolution here intentionally:
      // the project's main tsconfig.json targets ESNext/bundler for Next.js,
      // but Jest runs in Node and requires CommonJS output. These overrides
      // keep test execution working without modifying the production tsconfig.
      tsconfig: {
        module: 'commonjs',
        moduleResolution: 'node',
      },
    }],
  },
}

module.exports = config
