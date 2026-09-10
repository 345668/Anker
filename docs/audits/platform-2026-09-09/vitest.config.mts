import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
 resolve: { alias: { "@": path.resolve(process.cwd()) } },
 test: { environment: "jsdom", include: ["docs/audits/platform-2026-09-09/observed-defects.test.ts"], globals: false }
});
