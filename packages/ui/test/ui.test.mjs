import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppShell } from '../dist/components/AppShell.js';
import { ControlTile } from '../dist/components/ControlTile.js';
import { EmptyState } from '../dist/components/EmptyState.js';
import { ErrorBoundary } from '../dist/components/ErrorBoundary.js';
import { FilterChips } from '../dist/components/FilterChips.js';
import { MetricTile } from '../dist/components/MetricTile.js';
import { ProgressBar } from '../dist/components/ProgressBar.js';
import { SegmentedControl } from '../dist/components/SegmentedControl.js';
import { Slider } from '../dist/components/Slider.js';
import { buildSparklineGeometry, Sparkline } from '../dist/components/Sparkline.js';
import { StatusBanner } from '../dist/components/StatusBanner.js';
import { cn } from '../src/lib/cn.ts';
import { isValidThemeId, THEME_REGISTRY } from '../src/theme/registry.ts';
import { buildThemeSyncKey } from '../src/theme/sync.ts';
import {
  colorWithAlpha,
  inspectThemeTokens,
  readThemeToken,
  SEMANTIC_THEME_TOKENS,
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

  // Modern CSS Color 4 oklch(...) and color(...) formats
  assert.equal(colorWithAlpha('oklch(0.62 0.21 255)', 0.4), 'oklch(0.62 0.21 255 / 0.4)');
  assert.equal(colorWithAlpha('oklch(0.62 0.21 255 / 0.9)', 0.25), 'oklch(0.62 0.21 255 / 0.25)');
  assert.equal(
    colorWithAlpha('color(display-p3 0.2 0.5 0.9)', 0.6),
    'color(display-p3 0.2 0.5 0.9 / 0.6)',
  );
  assert.equal(colorWithAlpha('color(srgb 0.1 0.2 0.3 / 0.8)', 1.5), 'color(srgb 0.1 0.2 0.3 / 1)');
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

test('readThemeToken prioritizes inline dynamic CSS variable overrides over static scheme variables', () => {
  const originalGetComputedStyle = globalThis.getComputedStyle;
  try {
    const inlineMap = {
      '--accent': 'oklch(0.68 0.19 145)',
    };
    const mockRoot = {
      dataset: { theme: 'coloros-glass', surface: 'native-glass', colorScheme: 'dark' },
      style: {
        getPropertyValue: (prop) => inlineMap[prop] || '',
      },
    };
    const computedMap = {
      '--accent-dark': '#3b82f6',
      '--accent-light': '#0066ff',
      '--accent': 'oklch(0.68 0.19 145)',
      '--text-primary-dark': '#f4f7fb',
      '--text-primary': 'light-dark(#121826, #f4f7fb)',
    };
    globalThis.getComputedStyle = () => ({
      getPropertyValue: (prop) => computedMap[prop] || '',
    });

    // Inline dynamic override must win over static --accent-dark
    assert.equal(readThemeToken('--accent', 'dark', '#fallback', mockRoot), 'oklch(0.68 0.19 145)');
    // Non-overridden token still resolves scheme-specific value
    assert.equal(readThemeToken('--text-primary', 'dark', '#fallback', mockRoot), '#f4f7fb');

    // inspectThemeTokens captures both resolved tokens and inlineOverrides
    const snapshot = inspectThemeTokens(mockRoot);
    assert.equal(snapshot.themeId, 'coloros-glass');
    assert.equal(snapshot.surface, 'native-glass');
    assert.equal(snapshot.colorScheme, 'dark');
    assert.equal(snapshot.tokens['--accent']?.resolved, 'oklch(0.68 0.19 145)');
    assert.equal(snapshot.tokens['--accent']?.inlineOverride, 'oklch(0.68 0.19 145)');
    assert.equal(snapshot.tokens['--text-primary']?.inlineOverride, null);
    assert.deepEqual(snapshot.inlineOverrides, { '--accent': 'oklch(0.68 0.19 145)' });
    assert.ok(SEMANTIC_THEME_TOKENS.includes('--accent'));
  } finally {
    globalThis.getComputedStyle = originalGetComputedStyle;
  }
});

test('ErrorBoundary renders children normally and renders glass error card on error with reset/copy', async () => {
  const normalHtml = renderToStaticMarkup(
    createElement(ErrorBoundary, null, createElement('span', null, '正常内容')),
  );
  assert.ok(normalHtml.includes('正常内容'));

  let copiedText = '';
  let resetCalled = false;
  const instance = new ErrorBoundary({
    children: null,
    title: '面板渲染失败',
    'data-testid': 'diag-eb',
    onCopy: (text) => {
      copiedText = text;
      return true;
    },
    onReset: () => {
      resetCalled = true;
    },
  });
  const derived = ErrorBoundary.getDerivedStateFromError(new Error('Canvas init failed'));
  instance.state = { ...instance.state, ...derived };
  instance.setState = (updater) => {
    const patch = typeof updater === 'function' ? updater(instance.state, instance.props) : updater;
    instance.state = { ...instance.state, ...patch };
  };

  const errorHtml = renderToStaticMarkup(instance.render());
  assert.ok(errorHtml.includes('data-pochita="error-boundary"'));
  assert.ok(errorHtml.includes('data-testid="diag-eb"'));
  assert.ok(errorHtml.includes('面板渲染失败'));
  assert.ok(errorHtml.includes('Canvas init failed'));
  assert.ok(errorHtml.includes('重试'));

  await instance.handleCopy();
  assert.ok(copiedText.includes('Canvas init failed'));
  assert.equal(instance.state.copyStatus, 'copied');

  instance.handleReset();
  assert.equal(resetCalled, true);
  assert.equal(instance.state.error, null);
});

test('UI components emit consistent data-pochita and semantic automation attributes', () => {
  const html = renderToStaticMarkup(
    createElement(MetricTile, {
      label: '帧率',
      value: 120,
      unit: 'FPS',
      'data-testid': 'fps-tile',
    }),
  );
  assert.ok(html.includes('data-pochita="metric-tile"'));
  assert.ok(html.includes('data-metric-label="帧率"'));
  assert.ok(html.includes('data-metric-value="120"'));
  assert.ok(html.includes('data-testid="fps-tile"'));
});

test('Phase 2B HA and Proxy UI components render semantic attributes and accessibility roles', () => {
  const segHtml = renderToStaticMarkup(
    createElement(SegmentedControl, {
      options: [
        { value: 'rule', label: '规则' },
        { value: 'global', label: '全局' },
        { value: 'direct', label: '直连' },
      ],
      value: 'rule',
      onValueChange: () => {},
      fullWidth: true,
      ariaLabel: '代理模式',
      'data-testid': 'proxy-mode',
    }),
  );
  assert.ok(segHtml.includes('data-pochita="segmented-control"'));
  assert.ok(segHtml.includes('<fieldset'));
  assert.ok(segHtml.includes('aria-pressed="true"'));
  assert.ok(segHtml.includes('data-testid="proxy-mode"'));

  const tileHtml = renderToStaticMarkup(
    createElement(ControlTile, {
      label: '客厅主灯',
      value: '80%',
      subtitle: '已开启',
      active: true,
      tone: 'warning',
      'data-testid': 'light-tile',
    }),
  );
  assert.ok(tileHtml.includes('data-pochita="control-tile"'));
  assert.ok(tileHtml.includes('data-state="active"'));
  assert.ok(tileHtml.includes('data-tone="warning"'));
  assert.ok(tileHtml.includes('aria-pressed="true"'));
  assert.ok(tileHtml.includes('data-testid="light-tile"'));

  const barHtml = renderToStaticMarkup(
    createElement(ProgressBar, {
      value: 140,
      tone: 'success',
      label: '流量配额',
      showValue: true,
      'data-testid': 'quota-bar',
    }),
  );
  assert.ok(barHtml.includes('data-pochita="progress-bar"'));
  assert.ok(barHtml.includes('role="progressbar"'));
  assert.ok(barHtml.includes('aria-valuenow="100"'));
  assert.ok(barHtml.includes('100%'));

  const geo = buildSparklineGeometry([10, 20, 15, 30], 100, 30);
  assert.ok(geo.linePoints.length > 0);
  assert.ok(geo.areaPath.startsWith('M 0 30'));

  const sparkHtml = renderToStaticMarkup(
    createElement(Sparkline, {
      values: [10, 20, 15, 30],
      tone: 'accent',
      fill: true,
      ariaLabel: '下行速率趋势',
      'data-testid': 'speed-spark',
    }),
  );
  assert.ok(sparkHtml.includes('data-pochita="sparkline"'));
  assert.ok(sparkHtml.includes('role="img"'));
  assert.ok(sparkHtml.includes('var(--accent)'));
  assert.ok(sparkHtml.includes('<path'));

  const bannerHtml = renderToStaticMarkup(
    createElement(StatusBanner, {
      tone: 'danger',
      title: '后端未连接',
      description: '请检查本地服务状态',
      'data-testid': 'conn-banner',
    }),
  );
  assert.ok(bannerHtml.includes('data-pochita="status-banner"'));
  assert.ok(bannerHtml.includes('role="alert"'));
  assert.ok(bannerHtml.includes('后端未连接'));

  const emptyHtml = renderToStaticMarkup(
    createElement(EmptyState, {
      title: '暂无设备',
      description: '当前房间未发现可控实体',
      'data-testid': 'empty-rooms',
    }),
  );
  assert.ok(emptyHtml.includes('data-pochita="empty-state"'));
  assert.ok(emptyHtml.includes('暂无设备'));

  const chipsHtml = renderToStaticMarkup(
    createElement(FilterChips, {
      options: [
        { value: 'living', label: '客厅', count: 4 },
        { value: 'bedroom', label: '卧室', count: 2 },
      ],
      selected: ['living'],
      onChange: () => {},
      ariaLabel: '房间筛选',
      'data-testid': 'room-chips',
    }),
  );
  assert.ok(chipsHtml.includes('data-pochita="filter-chips"'));
  assert.ok(chipsHtml.includes('data-selection-mode="multiple"'));
  assert.ok(chipsHtml.includes('aria-pressed="true"'));
});

test('Slider supports formatValue and AppShell supports headerMode compact/hidden', () => {
  const sliderHtml = renderToStaticMarkup(
    createElement(Slider, {
      label: '色温',
      value: 4000,
      min: 2700,
      max: 6500,
      onValueChange: () => {},
      onValueCommit: () => {},
      formatValue: (v) => `${v} K`,
      'data-testid': 'temp-slider',
    }),
  );
  assert.ok(sliderHtml.includes('4000 K'));
  assert.ok(sliderHtml.includes('data-testid="temp-slider"'));

  const hiddenHeaderHtml = renderToStaticMarkup(
    createElement(
      AppShell,
      {
        title: '嵌入式面板',
        variant: 'drawer',
        headerMode: 'hidden',
      },
      createElement('div', null, '全屏内容'),
    ),
  );
  assert.ok(hiddenHeaderHtml.includes('data-header-mode="hidden"'));
  assert.ok(!hiddenHeaderHtml.includes('<header'));
  assert.ok(hiddenHeaderHtml.includes('全屏内容'));

  const compactHeaderHtml = renderToStaticMarkup(
    createElement(
      AppShell,
      {
        title: '紧凑面板',
        subtitle: '不会显示',
        variant: 'drawer',
        headerMode: 'compact',
      },
      createElement('div', null, '主体'),
    ),
  );
  assert.ok(compactHeaderHtml.includes('data-header-mode="compact"'));
  assert.ok(compactHeaderHtml.includes('<header'));
  assert.ok(!compactHeaderHtml.includes('不会显示'));
});
