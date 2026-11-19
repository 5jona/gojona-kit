export type ThemeId = 'coloros-glass' | 'modern-saas-dark';

export type ColorMode = 'system' | 'light' | 'dark';

export type ResolvedColorScheme = 'light' | 'dark';

export type SurfaceMode = 'standalone' | 'native-glass';

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  tagline: string;
  wantsNativeBlur: boolean;
  defaultCornerRadiusPx: number;
  previewSwatches: readonly [string, string, string];
}

export interface ThemeSyncPayload {
  themeId: ThemeId;
  colorScheme: ResolvedColorScheme;
  wantsNativeBlur: boolean;
  cornerRadiusPx: number;
}
