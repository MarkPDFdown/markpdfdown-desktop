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
      include: [
        "src/core/**/*.ts",
        "src/main/**/*.ts",
        "src/preload/**/*.ts",
        "src/shared/**/*.ts",
      ],
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/coverage/**",
        "**/release/**",
        "**/*.d.ts",
        "**/migrations/**",
        "**/__tests__/**",
        "**/tests/**",
        "**/*.test.ts",
        "**/*.test.tsx",
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
