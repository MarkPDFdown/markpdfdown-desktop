import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { copyFileSync, mkdirSync, existsSync } from 'fs'

// Plugin to copy office bundles to dist
function copyOfficeBundles() {
  return {
    name: 'copy-office-bundles',
    closeBundle() {
      const srcDir = resolve(__dirname, 'src/core/infrastructure/adapters/split/bundles')
      const destDir = resolve(__dirname, 'dist/main/bundles')

      // Create destination directory if not exists
      if (!existsSync(destDir)) {
        mkdirSync(destDir, { recursive: true })
      }

      // Copy bundle files
      const bundles = ['pptx-preview.bundle.js', 'docx-preview.bundle.js']
      for (const bundle of bundles) {
        const srcPath = resolve(srcDir, bundle)
        const destPath = resolve(destDir, bundle)
        if (existsSync(srcPath)) {
          copyFileSync(srcPath, destPath)
          console.log(`Copied ${bundle} to dist/main/bundles/`)
        }
      }
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), copyOfficeBundles()],
    build: {
      outDir: 'dist/main'
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/preload',
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: '[name].js'
        }
      }
    }
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer')
      }
    },
    server: {
      port: 5173
    },
    build: {
      outDir: 'dist/renderer',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        }
      },
      emptyOutDir: true,
      assetsDir: 'assets'
    }
  }
}) 