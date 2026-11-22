export type ThemeId = 'coloros-glass' | 'modern-saas-dark';

export declare const THEME_IDS: readonly ThemeId[];

export declare const DEFAULT_THEME_ID: ThemeId;

export declare const STORAGE_KEY_THEME: 'pochita:theme';

export declare const STORAGE_KEY_SCHEME: 'pochita:color-scheme';

export declare function createThemeBootstrapScript(surface?: 'standalone' | 'native-glass'): string;
