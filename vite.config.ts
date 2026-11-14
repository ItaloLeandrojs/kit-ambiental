import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/kit-ambiental/',
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
  },
});
