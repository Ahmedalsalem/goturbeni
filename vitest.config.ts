import path from "path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: [
      // The real `server-only` package throws unconditionally under plain
      // Node/vitest resolution (see test/mocks/server-only.ts for why).
      { find: "server-only", replacement: path.resolve(__dirname, "./test/mocks/server-only.ts") },
      { find: "@", replacement: path.resolve(__dirname, "./src") },
    ],
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
  },
})
