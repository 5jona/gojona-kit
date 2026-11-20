import assert from 'node:assert/strict';
import test from 'node:test';
import { cn } from '../src/lib/cn.ts';
import { isValidThemeId, THEME_REGISTRY } from '../src/theme/registry.ts';
import { buildThemeSyncKey } from '../src/theme/sync.ts';
import {
  colorWithAlpha,
  readThemeToken,
  STORAGE_KEY_SCHEME,
  STORAGE_KEY_THEME,
  THEME_BOOTSTRAP_SCRIPT,
} from '../src/theme/tokens.ts';

test('isValidThemeId and THEME_REGISTRY definitions', () => {
  // Theme identifier validation
  assert.equal(isValidThemeId('coloros-glass'), true);
  assert.equal(isValidThemeId('modern-saas-dark'), true);
  assert.equal(isValidThemeId('non-existent-theme'), false);
  assert.equal(isValidThemeId(null), false);
  assert.equal(isValidThemeId(''), false);

  // 'coloros-glass' registration metadata
  const colorosGlass = THEME_REGISTRY['coloros-glass'];
  assert.ok(colorosGlass);
  assert.equal(colorosGlass.id, 'coloros-glass');
  assert.equal(colorosGlass.name, 'ColorOS Glass');
  assert.equal(colorosGlass.wantsNativeBlur, true);
  assert.equal(colorosGlass.defaultCornerRadiusPx, 24);
  assert.ok(Array.isArray(colorosGlass.previewSwatches));
  assert.equal(colorosGlass.previewSwatches.length, 3);

  // 'modern-saas-dark' registration metadata
  const modernSaas = THEME_REGISTRY['modern-saas-dark'];
  assert.ok(modernSaas);
  assert.equal(modernSaas.id, 'modern-saas-dark');
  assert.equal(modernSaas.name, 'Modern SaaS Dark');
  assert.equal(modernSaas.wantsNativeBlur, false);
  assert.equal(modernSaas.defaultCornerRadiusPx, 14);
  assert.ok(Array.isArray(modernSaas.previewSwatches));
  assert.equal(modernSaas.previewSwatches.length, 3);
});

test('colorWithAlpha parses hex, rgb, rgba, and clamps alpha within [0, 1]', () => {
  // Short 3-digit hex (#rgb)
  assert.equal(colorWithAlpha('#06f', 0.5), 'rgba(0, 102, 255, 0.5)');
  assert.equal(colorWithAlpha('#fff', 0.8), 'rgba(255, 255, 255, 0.8)');

  // Full 6-digit hex (#rrggbb)
  assert.equal(colorWithAlpha('#0066ff', 0.22), 'rgba(0, 102, 255, 0.22)');
  assert.equal(colorWithAlpha('#121826', 0.7), 'rgba(18, 24, 38, 0.7)');

  // rgb(...) format
  assert.equal(colorWithAlpha('rgb(10, 20, 30)', 0.75), 'rgba(10, 20, 30, 0.75)');

  // rgba(...) format
  assert.equal(colorWithAlpha('rgba(10, 20, 30, 0.5)', 0.4), 'rgba(10, 20, 30, 0.4)');

  // Alpha clamping below 0
  assert.equal(colorWithAlpha('#ffffff', -0.5), 'rgba(255, 255, 255, 0)');
  assert.equal(colorWithAlpha('rgb(10, 20, 30)', -1), 'rgba(10, 20, 30, 0)');

  // Alpha clamping above 1
  assert.equal(colorWithAlpha('#ffffff', 1.5), 'rgba(255, 255, 255, 1)');
  assert.equal(colorWithAlpha('rgba(10, 20, 30, 0.2)', 2), 'rgba(10, 20, 30, 1)');

  // Non-matching color format returned trimmed as-is
  assert.equal(colorWithAlpha('  transparent  ', 0.5), 'transparent');
});

test('readThemeToken fallback behavior and scheme-specific token resolution', () => {
  // Fallback when root is null
  assert.equal(readThemeToken('accent', 'dark', '#fallback', null), '#fallback');
  assert.equal(readThemeToken('--accent', 'light', '#default', null), '#default');

  const originalGetComputedStyle = globalThis.getComputedStyle;
  try {
    const mockElement = {};
    const stylesMap = {
      '--accent-dark': '#3b82f6',
      '--accent-light': '#0066ff',
      '--surface-dark': 'rgba(30, 36, 48, 0.85)',
      '--direct-token': '#123456',
      '--mixed-token': 'light-dark(#ffffff, #000000)',
    };

    globalThis.getComputedStyle = () => ({
      getPropertyValue: (prop) => stylesMap[prop] || '',
    });

    // Resolves scheme-specific custom properties
    assert.equal(readThemeToken('accent', 'dark', '#fallback', mockElement), '#3b82f6');
    assert.equal(readThemeToken('--accent', 'light', '#fallback', mockElement), '#0066ff');
    assert.equal(
      readThemeToken('surface', 'dark', '#fallback', mockElement),
      'rgba(30, 36, 48, 0.85)',
    );

    // Falls back to direct custom property when available and not light-dark expression
    assert.equal(readThemeToken('direct-token', 'dark', '#fallback', mockElement), '#123456');

    // Rejects light-dark direct value and returns fallback
    assert.equal(readThemeToken('mixed-token', 'dark', '#fallback', mockElement), '#fallback');

    // Missing custom property returns fallback
    assert.equal(readThemeToken('unknown-token', 'dark', '#fallback', mockElement), '#fallback');
  } finally {
    globalThis.getComputedStyle = originalGetComputedStyle;
  }
});

test('THEME_BOOTSTRAP_SCRIPT contains STORAGE_KEY_THEME and STORAGE_KEY_SCHEME', () => {
  assert.ok(
    THEME_BOOTSTRAP_SCRIPT.includes(STORAGE_KEY_THEME),
    `Bootstrap script must contain ${STORAGE_KEY_THEME}`,
  );
  assert.ok(
    THEME_BOOTSTRAP_SCRIPT.includes(STORAGE_KEY_SCHEME),
    `Bootstrap script must contain ${STORAGE_KEY_SCHEME}`,
  );
  assert.ok(THEME_BOOTSTRAP_SCRIPT.includes('coloros-glass'));
  assert.ok(THEME_BOOTSTRAP_SCRIPT.includes('modern-saas-dark'));
});

test('cn merges Tailwind classes cleanly', () => {
  assert.equal(cn('px-2 py-1', 'px-4'), 'py-1 px-4');
  assert.equal(cn('bg-red-500', 'bg-blue-500'), 'bg-blue-500');
  assert.equal(cn('text-sm font-medium', false && 'opacity-50', 'text-lg'), 'font-medium text-lg');
});

test('buildThemeSyncKey produces distinct keys for any field change and identical keys for equal payloads', () => {
  const basePayload = {
    themeId: 'coloros-glass',
    colorScheme: 'dark',
    wantsNativeBlur: true,
    cornerRadiusPx: 24,
  };

  const baseKey = buildThemeSyncKey(basePayload);
  assert.equal(typeof baseKey, 'string');
  assert.ok(baseKey.length > 0);

  // Identical payload produces identical key
  const equalPayload = { ...basePayload };
  assert.equal(buildThemeSyncKey(equalPayload), baseKey);

  // Any single field change produces a distinct key
  const differentTheme = { ...basePayload, themeId: 'modern-saas-dark' };
  assert.notEqual(buildThemeSyncKey(differentTheme), baseKey);

  const differentScheme = { ...basePayload, colorScheme: 'light' };
  assert.notEqual(buildThemeSyncKey(differentScheme), baseKey);

  const differentBlur = { ...basePayload, wantsNativeBlur: false };
  assert.notEqual(buildThemeSyncKey(differentBlur), baseKey);

  const differentRadius = { ...basePayload, cornerRadiusPx: 14 };
  assert.notEqual(buildThemeSyncKey(differentRadius), baseKey);
});
