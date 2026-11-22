import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  createPochitaViteConfig,
  createThemeBootstrapScript,
  DEFAULT_KIT_ROOT,
  DEFAULT_THEME_ID,
  pochitaThemeBootstrapPlugin,
  THEME_IDS,
} from '../index.mjs';

test('pochitaThemeBootstrapPlugin injects script immediately after color-scheme meta before stylesheets', () => {
  const plugin = pochitaThemeBootstrapPlugin('native-glass');
  const html = [
    '<!doctype html>',
    '<html>',
    '<head>',
    '  <meta charset="UTF-8" />',
    '  <meta name="color-scheme" content="light dark" />',
    '  <link rel="stylesheet" href="./assets/app.css" />',
    '  <script type="module" src="./assets/app.js"></script>',
    '</head>',
    '<body><div id="root"></div></body>',
    '</html>',
  ].join('\n');

  const out = plugin.transformIndexHtml.handler(html);
  assert.equal(typeof out, 'string');

  const metaIdx = out.indexOf('name="color-scheme"');
  const bootstrapIdx = out.indexOf('pochita:color-scheme');
  const cssIdx = out.indexOf('rel="stylesheet"');
  const moduleIdx = out.indexOf('type="module"');

  assert.ok(metaIdx !== -1, 'color-scheme meta should remain');
  assert.ok(bootstrapIdx > metaIdx, 'bootstrap script must execute after color-scheme meta');
  assert.ok(bootstrapIdx < cssIdx, 'bootstrap script must precede stylesheets');
  assert.ok(bootstrapIdx < moduleIdx, 'bootstrap script must precede module scripts');
  assert.ok(out.includes("dataset.surface='native-glass'"));
});

test('pochitaThemeBootstrapPlugin adds color-scheme meta before script when missing', () => {
  const plugin = pochitaThemeBootstrapPlugin('standalone');
  const html = '<html><head><title>Test</title></head><body></body></html>';

  const out = plugin.transformIndexHtml.handler(html);
  assert.equal(typeof out, 'string');
  assert.ok(out.indexOf('name="color-scheme"') < out.indexOf('pochita:color-scheme'));
  assert.ok(!out.includes('dataset.surface'));
});

test('pochitaThemeBootstrapPlugin is idempotent when bootstrap script is already present', () => {
  const plugin = pochitaThemeBootstrapPlugin('standalone');
  const script = createThemeBootstrapScript('standalone');
  const html = `<head><meta name="color-scheme" content="light dark" /><script>${script}</script></head>`;
  assert.equal(plugin.transformIndexHtml.handler(html), html);
});

test('createPochitaViteConfig derives DEFAULT_KIT_ROOT automatically and honors overrides', () => {
  const expectedKitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  assert.equal(DEFAULT_KIT_ROOT, expectedKitRoot);

  const prevEnv = process.env.POCHITA_KIT_ROOT;
  try {
    delete process.env.POCHITA_KIT_ROOT;
    const defaultCfg = createPochitaViteConfig();
    assert.ok(defaultCfg.server?.fs?.allow?.includes(expectedKitRoot));

    process.env.POCHITA_KIT_ROOT = '/tmp/custom-env-kit-root';
    const envCfg = createPochitaViteConfig();
    assert.ok(envCfg.server?.fs?.allow?.includes('/tmp/custom-env-kit-root'));

    const explicitCfg = createPochitaViteConfig({ kitRoot: '/tmp/explicit-kit-root' });
    assert.ok(explicitCfg.server?.fs?.allow?.includes('/tmp/explicit-kit-root'));
    assert.ok(!explicitCfg.server?.fs?.allow?.includes('/tmp/custom-env-kit-root'));
  } finally {
    if (prevEnv !== undefined) {
      process.env.POCHITA_KIT_ROOT = prevEnv;
    } else {
      delete process.env.POCHITA_KIT_ROOT;
    }
  }
});

test('THEME_IDS and DEFAULT_THEME_ID drive createThemeBootstrapScript as single source of truth', () => {
  const script = createThemeBootstrapScript('standalone');
  for (const id of THEME_IDS) {
    assert.ok(script.includes(`t==='${id}'`), `script must include allowlisted theme ${id}`);
  }
  assert.ok(script.includes(`:'${DEFAULT_THEME_ID}'`));
});

test('createPochitaViteConfig configures devHmr and POCHITA_DEBUG / sourcemap options', () => {
  const prevDebug = process.env.POCHITA_DEBUG;
  try {
    delete process.env.POCHITA_DEBUG;
    const baseCfg = createPochitaViteConfig({ port: 5199 });
    assert.equal(baseCfg.server?.hmr, undefined);
    assert.equal(baseCfg.build?.sourcemap, undefined);

    // Boolean devHmr defaults to loopback WS on configured port
    const boolHmrCfg = createPochitaViteConfig({ port: 5199, devHmr: true });
    assert.deepEqual(boolHmrCfg.server?.hmr, {
      host: '127.0.0.1',
      port: 5199,
      protocol: 'ws',
    });

    // Object devHmr overrides host/port/protocol/clientPort
    const customHmrCfg = createPochitaViteConfig({
      port: 5199,
      devHmr: { host: '127.0.0.1', port: 5201, protocol: 'wss', clientPort: 443 },
    });
    assert.deepEqual(customHmrCfg.server?.hmr, {
      host: '127.0.0.1',
      port: 5201,
      protocol: 'wss',
      clientPort: 443,
    });

    // POCHITA_DEBUG=1 enables production sourcemap automatically
    process.env.POCHITA_DEBUG = '1';
    const debugCfg = createPochitaViteConfig();
    assert.equal(debugCfg.build?.sourcemap, true);

    // Explicit sourcemap option overrides POCHITA_DEBUG
    const explicitFalseCfg = createPochitaViteConfig({ sourcemap: false });
    assert.equal(explicitFalseCfg.build?.sourcemap, false);
  } finally {
    if (prevDebug !== undefined) {
      process.env.POCHITA_DEBUG = prevDebug;
    } else {
      delete process.env.POCHITA_DEBUG;
    }
  }
});

test('createPochitaViteConfig supports toggling react, tailwindcss, and themeBootstrap plugins', () => {
  const flattenPluginNames = (plugins) =>
    (plugins ?? [])
      .flat(Number.POSITIVE_INFINITY)
      .filter((p) => p && typeof p === 'object' && 'name' in p)
      .map((p) => p.name);

  const defaultNames = flattenPluginNames(createPochitaViteConfig().plugins);
  assert.ok(defaultNames.includes('pochita:theme-bootstrap'));
  assert.ok(defaultNames.some((name) => name.includes('react')));
  assert.ok(defaultNames.some((name) => name.includes('tailwindcss')));

  const bareCfg = createPochitaViteConfig({
    react: false,
    tailwindcss: false,
    themeBootstrap: false,
  });
  assert.deepEqual(bareCfg.plugins, []);

  const thinShellNames = flattenPluginNames(
    createPochitaViteConfig({
      react: false,
      tailwindcss: false,
      themeBootstrap: true,
    }).plugins,
  );
  assert.deepEqual(thinShellNames, ['pochita:theme-bootstrap']);
});

test('biome.base.json excludes vendored third-party directories', () => {
  const biomeBasePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../biome.base.json',
  );
  const config = JSON.parse(fs.readFileSync(biomeBasePath, 'utf8'));
  assert.ok(config.files.includes.includes('!**/vendor'));
});
