import type {
  BuildOptions,
  Plugin,
  PluginOption,
  ResolveOptions,
  ServerOptions,
  UserConfig,
} from 'vite';
import type { ThemeSurfaceMode } from './themes.d.ts';

export {
  createThemeBootstrapScript,
  DEFAULT_THEME_ID,
  SEMANTIC_THEME_TOKENS,
  type SemanticThemeToken,
  STORAGE_KEY_SCHEME,
  STORAGE_KEY_THEME,
  THEME_IDS,
  type ThemeId,
  type ThemeSurfaceMode,
} from './themes.d.ts';

/**
 * Default root directory of the `gojona-kit` monorepo, derived from `import.meta.url`.
 */
export declare const DEFAULT_KIT_ROOT: string;

/**
 * HMR server configuration for embedded WebView and browser preview dev servers.
 */
export interface PochitaDevHmrOptions {
  host?: string;
  port?: number;
  protocol?: 'ws' | 'wss';
  clientPort?: number;
}

/**
 * Configuration options accepted by `createPochitaViteConfig`.
 */
export interface PochitaViteConfigOptions {
  /** Output directory for production builds (defaults to `'dist'`). */
  outDir?: string;
  /** Dev server port (defaults to `5173`). */
  port?: number;
  /** Explicit monorepo kit root path added to `server.fs.allow`. */
  kitRoot?: string;
  /** Surface mode injected by the theme bootstrap script (defaults to `'standalone'`). */
  surface?: ThemeSurfaceMode;
  /** Whether to include `@vitejs/plugin-react` (defaults to `true`). */
  react?: boolean;
  /** Whether to include `@tailwindcss/vite` (defaults to `true`). */
  tailwindcss?: boolean;
  /** Whether to inject the synchronous zero-flash theme bootstrap script (defaults to `true`). */
  themeBootstrap?: boolean;
  /** Optional loopback HMR WebSocket configuration. */
  devHmr?: boolean | PochitaDevHmrOptions;
  /** Explicit sourcemap generation mode (defaults to `true` when `POCHITA_DEBUG=1`). */
  sourcemap?: boolean | 'inline' | 'hidden';
  /** Additional Vite plugins appended after built-in presets. */
  plugins?: PluginOption[];
  /** Additional Vite `build` overrides. */
  build?: BuildOptions;
  /** Additional Vite `server` overrides. */
  server?: ServerOptions;
  /** Additional Vite `resolve` overrides (`react` and `react-dom` are deduplicated automatically). */
  resolve?: ResolveOptions;
}

/**
 * Vite plugin that injects the theme/scheme bootstrap script immediately after
 * `<meta name="color-scheme">` (before stylesheets and module scripts) so first
 * paint never flashes.
 */
export declare function pochitaThemeBootstrapPlugin(surface?: ThemeSurfaceMode): Plugin;

/**
 * Creates a standardized Vite configuration for offline Android WebView
 * and embedded WebUI bundles using relative `./` asset paths.
 */
export declare function createPochitaViteConfig(options?: PochitaViteConfigOptions): UserConfig;

/**
 * Legacy alias for `createPochitaViteConfig`.
 */
export declare const createWebUIViteConfig: typeof createPochitaViteConfig;

/**
 * Legacy camelCase alias for `createPochitaViteConfig`.
 */
export declare const createWebUiViteConfig: typeof createPochitaViteConfig;
