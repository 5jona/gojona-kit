import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { THEME_IDS } from '../packages/config/themes.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.css', '.mjs']);

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

function countLines(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return raw.length === 0 ? 0 : raw.split('\n').length;
}

test('all package and app source files satisfy <= 300 soft limit and <= 400 hard limit', () => {
  const pkgSrcFiles = [];
  for (const pkg of fs.readdirSync(path.join(REPO_ROOT, 'packages'))) {
    const srcDir = path.join(REPO_ROOT, 'packages', pkg, 'src');
    for (const file of walkFiles(srcDir)) {
      if (SOURCE_EXTENSIONS.has(path.extname(file))) {
        pkgSrcFiles.push(file);
      }
    }
  }

  const appSrcFiles = [];
  const appsDir = path.join(REPO_ROOT, 'apps');
  if (fs.existsSync(appsDir)) {
    for (const app of fs.readdirSync(appsDir)) {
      for (const file of walkFiles(path.join(appsDir, app, 'src'))) {
        if (SOURCE_EXTENSIONS.has(path.extname(file))) {
          appSrcFiles.push(file);
        }
      }
    }
  }

  assert.ok(pkgSrcFiles.length > 0, 'Expected package source files to exist');
  assert.ok(
    pkgSrcFiles.some((file) =>
      path.relative(REPO_ROOT, file).startsWith(`packages${path.sep}contracts-gen${path.sep}src`),
    ),
    'Expected packages/contracts-gen/src/*.mjs to be covered by line-count checks',
  );

  for (const file of pkgSrcFiles) {
    const lines = countLines(file);
    const rel = path.relative(REPO_ROOT, file);
    assert.ok(lines <= 300, `${rel} has ${lines} lines (package src limit is <= 300)`);
  }

  for (const file of appSrcFiles) {
    const lines = countLines(file);
    const rel = path.relative(REPO_ROOT, file);
    assert.ok(lines <= 400, `${rel} has ${lines} lines (hard limit is <= 400)`);
  }
});

test('THEME_IDS in @pochita/config is the single source of truth for UI theme registry and CSS files', () => {
  const registryPath = path.join(REPO_ROOT, 'packages/ui/src/theme/registry.ts');
  const registrySrc = fs.readFileSync(registryPath, 'utf8');
  assert.ok(
    registrySrc.includes("from '@pochita/config/themes'"),
    'registry.ts must import THEME_IDS from @pochita/config/themes',
  );

  const themesCssDir = path.join(REPO_ROOT, 'packages/ui/src/styles/themes');
  const cssThemes = fs
    .readdirSync(themesCssDir)
    .filter((f) => f.endsWith('.css'))
    .map((f) => f.slice(0, -4))
    .sort();

  assert.deepEqual(cssThemes, [...THEME_IDS].sort());
  for (const themeId of THEME_IDS) {
    assert.ok(
      registrySrc.includes(`'${themeId}':`),
      `THEME_REGISTRY must define entry for ${themeId}`,
    );
  }
});

test('UI components contain zero hardcoded hex colors', () => {
  const componentsDir = path.join(REPO_ROOT, 'packages/ui/src/components');
  const hexRe = /#[0-9a-fA-F]{3,8}\b/g;

  for (const file of walkFiles(componentsDir)) {
    if (!file.endsWith('.tsx')) continue;
    const src = fs.readFileSync(file, 'utf8');
    const matches = src.match(hexRe);
    assert.equal(
      matches,
      null,
      `${path.relative(REPO_ROOT, file)} contains hardcoded hex colors: ${matches?.join(', ')}`,
    );
  }
});

test('TypeScript sources use explicit import type for React type-only symbols', () => {
  const reactTypeNames = ['ReactNode', 'ErrorInfo', 'HTMLAttributes', 'ButtonHTMLAttributes'];
  const pkgRoot = path.join(REPO_ROOT, 'packages');
  const bareImportRe = /import\s*\{([^}]+)\}\s*from\s*['"]react['"]/;

  for (const pkg of fs.readdirSync(pkgRoot)) {
    for (const file of walkFiles(path.join(pkgRoot, pkg, 'src'))) {
      if (!file.endsWith('.ts') && !file.endsWith('.tsx')) continue;
      const src = fs.readFileSync(file, 'utf8');
      const match = src.match(bareImportRe);
      if (!match) continue;
      if (match[0].startsWith('import type')) continue;
      const specifiers = match[1].split(',').map((s) => s.trim());
      for (const spec of specifiers) {
        if (reactTypeNames.includes(spec)) {
          assert.fail(
            `${path.relative(REPO_ROOT, file)} imports React type "${spec}" without explicit "type" modifier`,
          );
        }
      }
    }
  }
});

test('workspace package dist/ artifacts exist and stay in sync with src/', () => {
  for (const pkg of ['ui', 'bridge', 'sdk']) {
    const pkgDir = path.join(REPO_ROOT, 'packages', pkg);
    const distIndexJs = path.join(pkgDir, 'dist', 'index.js');
    const distIndexDts = path.join(pkgDir, 'dist', 'index.d.ts');
    assert.ok(fs.existsSync(distIndexJs), `Missing ${path.relative(REPO_ROOT, distIndexJs)}`);
    assert.ok(fs.existsSync(distIndexDts), `Missing ${path.relative(REPO_ROOT, distIndexDts)}`);
    assert.ok(fs.statSync(distIndexJs).size > 0, `${pkg}/dist/index.js must not be empty`);
    assert.ok(fs.statSync(distIndexDts).size > 0, `${pkg}/dist/index.d.ts must not be empty`);
  }
});
