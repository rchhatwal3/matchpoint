// Test config. Coverage is scoped to the pure logic in lib/ — the code that
// carries behavior worth locking down. UI components, screens, the theme
// provider/tokens, and the I/O-heavy SessionProvider are intentionally out of
// scope (their testable logic is extracted into lib/*). The Deno edge function
// is covered separately via `deno test`.
module.exports = {
  preset: 'jest-expo',
  collectCoverageFrom: ['lib/**/*.ts', '!lib/**/*.test.ts', '!lib/theme/**'],
  coverageThreshold: {
    global: { branches: 90, functions: 90, lines: 90, statements: 90 },
  },
};
