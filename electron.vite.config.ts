import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "dist/main",
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/main/index.ts"),
          // Imported by scripts/package-load-check.cjs to render a sample in the packaged app.
          "pdf-page-renderer": resolve(
            __dirname,
            "src/core/infrastructure/adapters/split/PDFPageRenderer.ts",
          ),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "dist/preload",
      rollupOptions: {
        output: {
          format: "cjs",
          entryFileNames: "[name].js",
        },
      },
    },
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: {
        "@": resolve(__dirname, "src/renderer"),
      },
    },
    server: {
      port: 15173,
    },
    build: {
      outDir: "dist/renderer",
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/renderer/index.html"),
        },
      },
      emptyOutDir: true,
      assetsDir: "assets",
    },
  },
});
