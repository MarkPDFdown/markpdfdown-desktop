/**
 * Bundle office preview libraries for browser usage.
 *
 * This script bundles pptx-preview and docx-preview into standalone IIFE files
 * that can be loaded via <script> tags in temporary HTML files.
 *
 * Usage: node scripts/bundle-office-libs.js
 */

import { build } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const outputDir = path.resolve(rootDir, 'src/core/infrastructure/adapters/split/bundles');

/**
 * Bundle a library into an IIFE format.
 * @param {string} name - Library name (e.g., 'pptx-preview')
 * @param {string} globalName - Global variable name (e.g., 'PptxPreview')
 * @param {string} exportName - Name of the main export (e.g., 'init')
 */
async function bundleLibrary(name, globalName, exportName) {
  console.log(`Bundling ${name}...`);

  // Create a temporary entry file that directly assigns the function to window
  // This avoids the ES module namespace wrapper issue
  const entryContent = `
import { ${exportName} } from '${name}';

// Directly assign to window for browser usage
if (typeof window !== 'undefined') {
  window.${globalName} = { ${exportName} };
}

// Also export for IIFE wrapper
export { ${exportName} };
`;
  const entryPath = path.resolve(rootDir, `.temp-entry-${name}.js`);
  await fs.writeFile(entryPath, entryContent);

  try {
    await build({
      configFile: false,
      root: rootDir,
      build: {
        lib: {
          entry: entryPath,
          name: globalName,
          formats: ['iife'],
          fileName: () => `${name}.bundle.js`,
        },
        outDir: outputDir,
        emptyOutDir: false,
        minify: 'esbuild',
        rollupOptions: {
          output: {
            inlineDynamicImports: true,
          },
        },
      },
      logLevel: 'warn',
    });

    console.log(`Successfully bundled ${name} to ${outputDir}/${name}.bundle.js`);
  } finally {
    // Cleanup temp entry file
    await fs.unlink(entryPath).catch(() => {});
  }
}

async function main() {
  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true });

  // Bundle both libraries with their main export functions
  await bundleLibrary('pptx-preview', 'PptxPreview', 'init');
  await bundleLibrary('docx-preview', 'docxPreview', 'renderAsync');

  console.log('\nAll bundles created successfully!');
}

main().catch((err) => {
  console.error('Bundle failed:', err);
  process.exit(1);
});
