import assert from 'node:assert/strict';
import test from 'node:test';
import { createThemeBootstrapScript, pochitaThemeBootstrapPlugin } from '../index.mjs';

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
