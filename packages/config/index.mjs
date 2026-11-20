import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Generates the synchronous theme/color-scheme bootstrap snippet injected into `<head>`.
 *
 * @param {'standalone' | 'native-glass'} [surface='standalone']
 */
export function createThemeBootstrapScript(surface = 'standalone') {
  const surfaceInit =
    surface === 'native-glass' ? "document.documentElement.dataset.surface='native-glass';" : '';
  return `try{${surfaceInit}var s=localStorage.getItem('pochita:color-scheme');if(s==='light'||s==='dark'){var m=document.querySelector('meta[name="color-scheme"]');if(m)m.content=s;}var t=localStorage.getItem('pochita:theme');document.documentElement.dataset.theme=(t==='coloros-glass'||t==='modern-saas-dark')?t:'coloros-glass';}catch(e){}`;
}

const COLOR_SCHEME_META_RE = /<meta\s+[^>]*name=["']color-scheme["'][^>]*>/i;
const HEAD_OPEN_RE = /<head[^>]*>/i;

/**
 * Vite plugin that injects the theme/scheme bootstrap script immediately after
 * `<meta name="color-scheme">` (before stylesheets and module scripts) so first
 * paint never flashes.
 *
 * @param {'standalone' | 'native-glass'} [surface='standalone']
 */
export function pochitaThemeBootstrapPlugin(surface = 'standalone') {
  const scriptContent = createThemeBootstrapScript(surface);
  return {
    name: 'pochita:theme-bootstrap',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        if (html.includes('pochita:color-scheme')) {
          return html;
        }
        if (COLOR_SCHEME_META_RE.test(html)) {
          return html.replace(
            COLOR_SCHEME_META_RE,
            (match) => `${match}\n  <script>${scriptContent}</script>`,
          );
        }
        if (HEAD_OPEN_RE.test(html)) {
          return html.replace(
            HEAD_OPEN_RE,
            (match) =>
              `${match}\n  <meta name="color-scheme" content="light dark" />\n  <script>${scriptContent}</script>`,
          );
        }
        return {
          html,
          tags: [
            {
              tag: 'script',
              children: scriptContent,
              injectTo: 'head-prepend',
            },
          ],
        };
      },
    },
  };
}

/**
 * Creates a standardized Vite configuration for offline Android WebView
 * and embedded WebUI bundles using relative `./` asset paths.
 *
 * @param {object} [options]
 * @param {string} [options.outDir='dist']
 * @param {number} [options.port=5173]
 * @param {string} [options.kitRoot]
 * @param {'standalone' | 'native-glass'} [options.surface='standalone']
 * @param {Array} [options.plugins=[]]
 * @param {object} [options.build={}]
 * @param {object} [options.server={}]
 * @param {object} [options.resolve={}]
 */
export function createWebUiViteConfig(options = {}) {
  const {
    outDir = 'dist',
    port = 5173,
    kitRoot,
    surface = 'standalone',
    plugins = [],
    build = {},
    server = {},
    resolve = {},
  } = options;

  const existingAllow = server?.fs?.allow ?? [];
  const mergedFs = kitRoot
    ? {
        ...server?.fs,
        allow: Array.from(new Set(['.', kitRoot, ...existingAllow])),
      }
    : server?.fs;

  return defineConfig({
    base: './',
    plugins: [pochitaThemeBootstrapPlugin(surface), react(), tailwindcss(), ...plugins],
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
      ...(mergedFs ? { fs: mergedFs } : {}),
    },
  });
}

export const createPochitaViteConfig = createWebUiViteConfig;
