import { THEME_IDS } from '@gojona/config/themes';
import type { ThemeDefinition, ThemeId } from './types.ts';

const VALID_THEME_ID_SET: ReadonlySet<string> = new Set(THEME_IDS);

/**
 * Canonical registry mapping each supported `ThemeId` to its visual metadata and native container hints.
 */
export const THEME_REGISTRY: Record<ThemeId, ThemeDefinition> = {
  'coloros-glass': {
    id: 'coloros-glass',
    name: 'ColorOS Glass',
    tagline: '通透磨砂质感 · 连续大圆角与光感层级',
    wantsNativeBlur: true,
    defaultCornerRadiusPx: 24,
    previewSwatches: ['#0066ff', '#1e2430', '#f4f7fb'],
  },
  'modern-saas-dark': {
    id: 'modern-saas-dark',
    name: 'Modern SaaS Dark',
    tagline: '极简碳灰质感 · 1px 锐利微边框',
    wantsNativeBlur: false,
    defaultCornerRadiusPx: 14,
    previewSwatches: ['#6366f1', '#111114', '#fafafa'],
  },
};

/**
 * Ordered list of registered theme definitions for `<ThemeSwitcher>`.
 */
export const THEME_LIST: readonly ThemeDefinition[] = Object.values(THEME_REGISTRY);

/**
 * Type guard checking whether an arbitrary string is a registered `ThemeId`.
 */
export function isValidThemeId(value: string | null): value is ThemeId {
  return value !== null && VALID_THEME_ID_SET.has(value);
}
