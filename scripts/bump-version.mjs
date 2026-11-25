#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

const MANIFEST_PATHS = [
  'package.json',
  'packages/config/package.json',
  'packages/contracts-gen/package.json',
  'packages/bridge/package.json',
  'packages/ui/package.json',
  'packages/sdk/package.json',
  'apps/playground/package.json',
];

function fail(message) {
  console.error(`[bump-version] Error: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  let check = false;
  let tag = null;
  let version = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--check') {
      check = true;
    } else if (arg === '--tag') {
      tag = argv[++i] ?? fail('--tag requires a value (e.g. v0.2.0)');
    } else if (arg.startsWith('--tag=')) {
      tag = arg.slice('--tag='.length);
    } else if (arg === '-h' || arg === '--help') {
      console.log('Usage: node scripts/bump-version.mjs [<X.Y.Z>] [--check] [--tag vX.Y.Z]');
      process.exit(0);
    } else if (arg.startsWith('-')) {
      fail(`Unknown option: ${arg}`);
    } else if (!version) {
      version = arg;
    } else {
      fail(`Unexpected extra argument: ${arg}`);
    }
  }
  if (!check && !version && !tag) {
    fail('Specify a target <X.Y.Z> version or --check');
  }
  if ((check || tag) && version) {
    fail('Cannot combine positional <X.Y.Z> with --check or --tag');
  }
  return { check: check || Boolean(tag), tag, version };
}

function assertSemver(raw, label) {
  if (!SEMVER_RE.test(raw)) {
    fail(`${label} "${raw}" is not a valid SemVer string`);
  }
}

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8'));
}

function writeJsonVersion(relPath, nextVersion) {
  const fullPath = path.join(REPO_ROOT, relPath);
  const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  data.version = nextVersion;
  fs.writeFileSync(fullPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function extractTopChangelogVersion(content) {
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^## \[([^\]]+)\](?:\s+-\s+\d{4}-\d{2}-\d{2})?$/);
    if (match) {
      return match[1];
    }
  }
  return null;
}

function updateChangelog(nextVersion) {
  const changelogPath = path.join(REPO_ROOT, 'docs/CHANGELOG.md');
  const raw = fs.readFileSync(changelogPath, 'utf8');
  if (extractTopChangelogVersion(raw) === nextVersion) {
    return false;
  }
  const today = new Date().toISOString().slice(0, 10);
  const heading = `## [${nextVersion}] - ${today}\n\n### Changed\n\n- Release ${nextVersion}.\n\n`;
  const idx = raw.search(/^## \[/m);
  const next =
    idx === -1
      ? `${raw.trimEnd()}\n\n${heading}`
      : `${raw.slice(0, idx)}${heading}${raw.slice(idx)}`;
  fs.writeFileSync(changelogPath, next, 'utf8');
  return true;
}

function runCheck(tag) {
  const rootPkg = readJson('package.json');
  const expected = rootPkg.version;
  assertSemver(expected, 'package.json version');

  for (const relPath of MANIFEST_PATHS.slice(1)) {
    const pkg = readJson(relPath);
    if (pkg.version !== expected) {
      fail(`${relPath} version "${pkg.version}" does not match root "${expected}"`);
    }
  }

  const changelog = fs.readFileSync(path.join(REPO_ROOT, 'docs/CHANGELOG.md'), 'utf8');
  const topHeading = extractTopChangelogVersion(changelog);
  if (topHeading !== expected) {
    fail(`docs/CHANGELOG.md top heading "${topHeading ?? 'none'}" does not match "${expected}"`);
  }

  if (tag !== null) {
    if (!tag.startsWith('v')) {
      fail(`Tag "${tag}" must start with "v"`);
    }
    const tagVersion = tag.slice(1);
    assertSemver(tagVersion, 'Tag version');
    if (tagVersion !== expected) {
      fail(`Tag "${tag}" (${tagVersion}) does not match repository version "${expected}"`);
    }
  }

  console.log(
    `[bump-version] OK: all ${MANIFEST_PATHS.length} manifests and docs/CHANGELOG.md match ${expected}`,
  );
}

const { check, tag, version } = parseArgs(process.argv.slice(2));
if (check) {
  runCheck(tag);
} else {
  assertSemver(version, 'Target version');
  for (const relPath of MANIFEST_PATHS) {
    writeJsonVersion(relPath, version);
  }
  updateChangelog(version);
  console.log(
    `[bump-version] Updated ${MANIFEST_PATHS.length} manifests and docs/CHANGELOG.md to ${version}`,
  );
}
