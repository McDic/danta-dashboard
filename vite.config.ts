import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Relative base so the build works on any host path (GitHub Pages project site, Cloudflare, etc.).
  base: './',
  test: {
    include: ['test/**/*.test.ts'],
  },
})
