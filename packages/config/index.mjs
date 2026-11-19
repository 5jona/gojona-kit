import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

/**
 * Creates a standardized Vite configuration for offline Android WebView
 * and embedded WebUI bundles using relative `./` asset paths.
 *
 * @param {object} [options]
 * @param {string} [options.outDir='dist']
 * @param {number} [options.port=5173]
 * @param {Array} [options.plugins=[]]
 * @param {object} [options.build={}]
 * @param {object} [options.server={}]
 * @param {object} [options.resolve={}]
 */
export function createWebUiViteConfig(options = {}) {
  const {
    outDir = 'dist',
    port = 5173,
    plugins = [],
    build = {},
    server = {},
    resolve = {},
  } = options;

  return defineConfig({
    base: './',
    plugins: [react(), tailwindcss(), ...plugins],
    resolve,
    build: {
      outDir,
      emptyOutDir: true,
      target: 'es2022',
      assetsDir: 'assets',
      ...build,
    },
    server: {
      host: '127.0.0.1',
      port,
      strictPort: false,
      ...server,
    },
  });
}

export const createPochitaViteConfig = createWebUiViteConfig;

