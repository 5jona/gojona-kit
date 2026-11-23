/**
 * Supported theme identifiers across the design system.
 */
export type ThemeId = 'coloros-glass' | 'modern-saas-dark';

/**
 * Surface backdrop mode for standalone browser views or native frosted-glass overlays.
 */
export type ThemeSurfaceMode = 'standalone' | 'native-glass';

/**
 * Canonical allowlist of registered theme identifiers.
 */
export declare const THEME_IDS: readonly ThemeId[];

/**
 * Default theme identifier applied when no persisted preference exists.
 */
export declare const DEFAULT_THEME_ID: ThemeId;

/**
 * `localStorage` key storing the active theme identifier.
 */
export declare const STORAGE_KEY_THEME: 'pochita:theme';

/**
 * `localStorage` key storing the active color mode (`light` | `dark` | `system`).
 */
export declare const STORAGE_KEY_SCHEME: 'pochita:color-scheme';

/**
 * Union of canonical semantic CSS custom property names shared across all themes.
 */
export type SemanticThemeToken =
  | '--surface-canvas'
  | '--surface-panel'
  | '--surface-card'
  | '--surface-elevated'
  | '--surface-toast'
  | '--text-primary'
  | '--text-secondary'
  | '--border-hairline'
  | '--glass-divider'
  | '--accent'
  | '--accent-soft'
  | '--accent-fg'
  | '--success'
  | '--warning'
  | '--danger'
  | '--radius-panel'
  | '--radius-card'
  | '--radius-control'
  | '--radius-pill'
  | '--blur-amount';

/**
 * Canonical list of semantic CSS custom properties shared across all themes.
 */
export declare const SEMANTIC_THEME_TOKENS: readonly SemanticThemeToken[];

/**
 * Generates the synchronous theme/color-scheme bootstrap snippet injected into `<head>`
 * to restore `dataset.surface`, `dataset.colorScheme`, `dataset.theme`, and `<meta name="color-scheme">`
 * before first paint.
 */
export declare function createThemeBootstrapScript(surface?: ThemeSurfaceMode): string;
