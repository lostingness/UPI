// Vitest config — mirrors the tsconfig "@/*" path alias so tests can import
// server modules (e.g. components/server-data) that use "@/..." imports.
// No other behaviour changed: `npm test` still runs `vitest run`.
import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: [{ find: "@", replacement: root }],
  },
});
