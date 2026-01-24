import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    name: "main-server",
    environment: "node",
    include: [
      "src/main/**/*.test.ts",
      "src/core/**/*.test.ts",
      "src/preload/**/*.test.ts",
    ],
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.d.ts"],
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/*.d.ts",
        "**/migrations/**",
        "**/__tests__/**",
        "**/tests/**",
        "**/*.test.ts",
        "**/*.config.ts",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
