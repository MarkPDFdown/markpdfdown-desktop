import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    name: "renderer",
    environment: "jsdom",
    include: ["src/renderer/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.d.ts"],
    globals: true,
    setupFiles: ["./tests/setup.renderer.ts"],
    retry: 2, // Automatically retry failed tests up to 2 times to handle intermittent failures
    testTimeout: 10000, // Increase timeout for async tests (default is 5000ms)
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/*.d.ts",
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
