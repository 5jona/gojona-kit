import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BUILTIN_DIAG_PLUGIN_ID,
  definePluginManifest,
  extractPluginAppearance,
  parseClickThroughChangedEvent,
  parsePresentationChangedEvent,
} from '../src/index.ts';

test('BUILTIN_DIAG_PLUGIN_ID is canonical', () => {
  assert.equal(BUILTIN_DIAG_PLUGIN_ID, 'sideveil.diagnostic');
});

test('definePluginManifest fills default fields gracefully', () => {
  const manifest = definePluginManifest({
    id: 'com.example.sample',
    name: 'Sample Plugin',
    version: '1.2.0',
    entry: 'index.html',
  });

  assert.equal(manifest.id, 'com.example.sample');
  assert.equal(manifest.name, 'Sample Plugin');
  assert.equal(manifest.version, '1.2.0');
  assert.equal(manifest.entry, 'index.html');
  assert.equal(manifest.backend, 'none');
  assert.deepEqual(manifest.capabilities, []);
  assert.deepEqual(manifest.triggers, {
    packages: [],
    global: false,
    priority: 0,
  });
  assert.deepEqual(manifest.surface, {
    backdrop: 'native-glass',
    presentation: 'drawer',
    widthDp: undefined,
    heightPercent: undefined,
  });
});

test('definePluginManifest preserves explicit properties', () => {
  const manifest = definePluginManifest({
    id: 'com.example.tweak',
    name: 'Tweak Engine',
    version: '2.0.0',
    entry: 'dist/index.html',
    backend: 'uds-native',
    capabilities: ['storage', 'toast', 'system-exec', 'native-hud'],
    triggers: {
      packages: ['com.android.settings'],
      global: false,
      priority: 50,
    },
    surface: {
      backdrop: 'opaque',
      presentation: 'pinned',
      widthDp: 400,
      heightPercent: 85,
    },
  });

  assert.equal(manifest.backend, 'uds-native');
  assert.deepEqual(manifest.capabilities, ['storage', 'toast', 'system-exec', 'native-hud']);
  assert.equal(manifest.triggers?.priority, 50);
  assert.deepEqual(manifest.triggers?.packages, ['com.android.settings']);
  assert.equal(manifest.surface?.backdrop, 'opaque');
  assert.equal(manifest.surface?.presentation, 'pinned');
  assert.equal(manifest.surface?.widthDp, 400);
  assert.equal(manifest.surface?.heightPercent, 85);
});

test('parsePresentationChangedEvent validates known presentation modes', () => {
  assert.equal(parsePresentationChangedEvent({ mode: 'pinned' }), 'pinned');
  assert.equal(parsePresentationChangedEvent({ mode: 'drawer' }), 'drawer');
  assert.equal(parsePresentationChangedEvent({ mode: 'native-hud' }), 'native-hud');
  assert.equal(parsePresentationChangedEvent({ mode: 'unknown' }), null);
  assert.equal(parsePresentationChangedEvent(null), null);
  assert.equal(parsePresentationChangedEvent({}), null);
});

test('parseClickThroughChangedEvent validates boolean clickThrough payloads', () => {
  assert.equal(parseClickThroughChangedEvent({ clickThrough: true }), true);
  assert.equal(parseClickThroughChangedEvent({ clickThrough: false }), false);
  assert.equal(parseClickThroughChangedEvent({ clickThrough: 'true' }), null);
  assert.equal(parseClickThroughChangedEvent(undefined), null);
});

test('extractPluginAppearance parses valid panel themeId and colorMode safely', () => {
  assert.deepEqual(
    extractPluginAppearance({ panel: { themeId: 'coloros-glass', colorMode: 'dark' } }),
    { themeId: 'coloros-glass', colorMode: 'dark' },
  );
  assert.deepEqual(
    extractPluginAppearance({ panel: { themeId: '  modern-saas-dark  ', colorMode: 'invalid' } }),
    { themeId: 'modern-saas-dark', colorMode: null },
  );
  assert.deepEqual(extractPluginAppearance(null), { themeId: null, colorMode: null });
  assert.deepEqual(extractPluginAppearance({}), { themeId: null, colorMode: null });
});
