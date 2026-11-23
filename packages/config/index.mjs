import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import {
  createThemeBootstrapScript,
  DEFAULT_THEME_ID,
  SEMANTIC_THEME_TOKENS,
  STORAGE_KEY_SCHEME,
  STORAGE_KEY_THEME,
  THEME_IDS,
} from './themes.mjs';

export {
  createThemeBootstrapScript,
  DEFAULT_THEME_ID,
  SEMANTIC_THEME_TOKENS,
  STORAGE_KEY_SCHEME,
  STORAGE_KEY_THEME,
  THEME_IDS,
};

/**
 * Default root directory of the `gojona-kit` monorepo, derived from `import.meta.url`.
 */
export const DEFAULT_KIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

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
 * @param {boolean} [options.react=true]
 * @param {boolean} [options.tailwindcss=true]
 * @param {boolean} [options.themeBootstrap=true]
 * @param {boolean | { host?: string; port?: number; protocol?: 'ws' | 'wss'; clientPort?: number }} [options.devHmr]
 * @param {boolean | 'inline' | 'hidden'} [options.sourcemap]
 * @param {Array} [options.plugins=[]]
 * @param {object} [options.build={}]
 * @param {object} [options.server={}]
 * @param {object} [options.resolve={}]
 */
export function createPochitaViteConfig(options = {}) {
  const {
    outDir = 'dist',
    port = 5173,
    kitRoot,
    surface = 'standalone',
    react: useReact = true,
    tailwindcss: useTailwindcss = true,
    themeBootstrap = true,
    devHmr,
    sourcemap,
    plugins = [],
    build = {},
    server = {},
    resolve = {},
  } = options;

  const rawKitRoot = kitRoot ?? (process.env.POCHITA_KIT_ROOT?.trim() || DEFAULT_KIT_ROOT);
  const resolvedKitRoot = rawKitRoot ? path.resolve(rawKitRoot) : undefined;
  const existingAllow = (server?.fs?.allow ?? []).map((entry) => path.resolve(entry));
  const mergedFs = resolvedKitRoot
    ? {
        ...server?.fs,
        allow: Array.from(new Set([path.resolve('.'), resolvedKitRoot, ...existingAllow])),
      }
    : server?.fs;

  const existingDedupe = Array.isArray(resolve?.dedupe) ? resolve.dedupe : [];
  const mergedResolve = {
    ...resolve,
    dedupe: Array.from(new Set(['react', 'react-dom', ...existingDedupe])),
  };

  const resolvedHmr =
    devHmr === true
      ? { host: '127.0.0.1', port, protocol: 'ws' }
      : devHmr && typeof devHmr === 'object'
        ? {
            host: devHmr.host ?? '127.0.0.1',
            port: devHmr.port ?? port,
            protocol: devHmr.protocol ?? 'ws',
            ...(devHmr.clientPort !== undefined ? { clientPort: devHmr.clientPort } : {}),
          }
        : undefined;

  const resolvedSourcemap =
    sourcemap !== undefined ? sourcemap : process.env.POCHITA_DEBUG === '1' ? true : undefined;

  const resolvedPlugins = [
    ...(themeBootstrap ? [pochitaThemeBootstrapPlugin(surface)] : []),
    ...(useReact ? [react()] : []),
    ...(useTailwindcss ? [tailwindcss()] : []),
    ...plugins,
  ];

  return defineConfig({
    base: './',
    plugins: resolvedPlugins,
    resolve: mergedResolve,
    build: {
      outDir,
      emptyOutDir: true,
      target: 'es2022',
      assetsDir: 'assets',
      ...(resolvedSourcemap !== undefined ? { sourcemap: resolvedSourcemap } : {}),
      ...build,
    },
    server: {
      host: '127.0.0.1',
      port,
      strictPort: false,
      ...(resolvedHmr ? { hmr: resolvedHmr } : {}),
      ...server,
      ...(mergedFs ? { fs: mergedFs } : {}),
    },
  });
}

/**
 * Legacy alias for `createPochitaViteConfig`.
 */
export const createWebUIViteConfig = createPochitaViteConfig;

/**
 * Legacy camelCase alias for `createPochitaViteConfig`.
 */
export const createWebUiViteConfig = createPochitaViteConfig;
