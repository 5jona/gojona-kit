import type { ThemeId } from '@gojona/config/themes';

export type { ThemeId };

/**
 * User-selected tri-state color mode preference.
 */
export type ColorMode = 'system' | 'light' | 'dark';

/**
 * Concrete active color scheme after resolving `'system'` against OS `prefers-color-scheme`.
 */
export type ResolvedColorScheme = 'light' | 'dark';

/**
 * Rendering surface backdrop mode (`'standalone'` browser canvas vs `'native-glass'` transparent WebView overlay).
 */
export type SurfaceMode = 'standalone' | 'native-glass';

/**
 * Visual metadata and native window hints for a registered design system theme.
 */
export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  tagline: string;
  wantsNativeBlur: boolean;
  defaultCornerRadiusPx: number;
  previewSwatches: readonly [string, string, string];
}

/**
 * Payload emitted via `<ThemeProvider onThemeSync={...}>` to synchronize native container backdrops.
 */
export interface ThemeSyncPayload {
  themeId: ThemeId;
  colorScheme: ResolvedColorScheme;
  wantsNativeBlur: boolean;
  cornerRadiusPx: number;
}
