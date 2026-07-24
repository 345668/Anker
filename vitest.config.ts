import { defineConfig } from "vitest/config"
import path from "node:path"

// Unit tests only for now — pure lib logic, node environment, no DB. Keep the
// `@/…` path alias tsconfig uses so test imports match app imports.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
    globals: false,
  },
})
