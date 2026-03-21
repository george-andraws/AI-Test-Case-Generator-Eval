import type { Config } from 'jest';

const tsJestGlobals = {
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.test.json',
    },
  },
};

const config: Config = {
  projects: [
    {
      displayName: 'node',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: [
        '<rootDir>/__tests__/api/**/*.test.ts',
        '<rootDir>/__tests__/lib/**/*.test.ts',
      ],
      moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
      clearMocks: true,
      ...tsJestGlobals,
    },
    {
      displayName: 'jsdom',
      preset: 'ts-jest',
      testEnvironment: 'jest-environment-jsdom',
      testMatch: ['<rootDir>/__tests__/components/**/*.test.tsx'],
      moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
      clearMocks: true,
      ...tsJestGlobals,
    },
  ],
};

export default config;
