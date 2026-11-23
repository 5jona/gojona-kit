import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { diffContractSpecs, runCli, validateContractSpec, validateValue } from '../src/index.mjs';
import { createSampleSpec } from './sampleSpec.mjs';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA_PATH = path.join(PKG_ROOT, 'contract.schema.json');
const CLI_PATH = path.join(PKG_ROOT, 'src/cli.mjs');

function cloneSpec(spec = createSampleSpec()) {
  return structuredClone(spec);
}

test('contract.schema.json validates sampleSpec with and without $schema and rejects invalid specs', () => {
  const metaSchema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  assert.equal(metaSchema.$schema, 'https://json-schema.org/draft/2020-12/schema');

  const sample = createSampleSpec();
  assert.deepEqual(validateValue(sample, metaSchema, metaSchema), []);

  const withSchema = {
    $schema: '../contract.schema.json',
    ...sample,
  };
  assert.deepEqual(validateValue(withSchema, metaSchema, metaSchema), []);
  assert.equal(validateContractSpec(withSchema).$schema, '../contract.schema.json');

  assert.throws(() => validateContractSpec({ ...sample, $schema: 123 }), /\$schema/);
  assert.throws(() => validateContractSpec({ ...sample, $schema: '   ' }), /\$schema/);

  // Negative checks against meta JSON Schema
  assert.ok(validateValue({ ...sample, schemaVersion: 2 }, metaSchema, metaSchema).length > 0);
  assert.ok(validateValue({ ...sample, rogueRootProp: true }, metaSchema, metaSchema).length > 0);
  assert.ok(
    validateValue(
      { ...sample, outputs: [{ target: 'kotlin', path: 'Out.kt' }] },
      metaSchema,
      metaSchema,
    ).length > 0,
  );
  assert.ok(
    validateValue(
      {
        ...sample,
        structs: { Bad: { fields: [{ name: 'x', type: 'u128' }] } },
      },
      metaSchema,
      metaSchema,
    ).length > 0,
  );
});

test('diffContractSpecs reports zero findings for identical specs and canonical optional forms', () => {
  const base = cloneSpec();
  const head = cloneSpec();
  // Rewrite `{ type: { list: 'string' }, optional: true }` to `{ type: { optional: { list: 'string' } } }`
  const tagsField = head.structs.NodeConfig.fields.find((f) => f.name === 'tags');
  delete tagsField.optional;
  tagsField.type = { optional: { list: 'string' } };

  const res = diffContractSpecs(base, head);
  assert.equal(res.ok, true);
  assert.deepEqual(res.breaking, []);
  assert.deepEqual(res.compatible, []);
});

test('diffContractSpecs allows additive non-breaking evolutions across all sections', () => {
  const base = cloneSpec();
  base.rpcs.GET_OPT = {
    method: 'core.getOpt',
    params: 'string',
    result: { optional: { ref: 'PingResult' } },
  };
  base.events.OPT_EVT = {
    event: 'core.optEvt',
    payload: { optional: 'string' },
  };

  const head = cloneSpec(base);
  head.constants.protocol.items.MAX_RETRIES = { value: 5, type: 'u32' };
  head.constants.extra = { items: { FLAG: { value: true } } };
  head.enums.SurfaceKind.variants.push({ name: 'Acrylic' });
  head.enums.NewEnum = { variants: [{ name: 'Alpha' }] };
  head.structs.NodeConfig.fields.push({ name: 'label', type: 'string', optional: true });
  head.structs.ExtraInfo = { fields: [{ name: 'note', type: 'string' }] };
  head.taggedUnions.HostCommand.variants.push({ name: 'Focus' });
  head.rpcs.PING.params = { optional: { ref: 'ExtraInfo' } };
  head.rpcs.GET_OPT.params = { optional: 'string' };
  head.rpcs.GET_OPT.result = { ref: 'PingResult' };
  head.rpcs.LIST_NODES = { method: 'node.list', params: null, result: { list: 'string' } };
  head.events.OPT_EVT.payload = 'string';
  head.events.SHUTDOWN = { event: 'core.shutdown', payload: null };

  const res = diffContractSpecs(base, head);
  assert.equal(res.ok, true);
  assert.deepEqual(res.breaking, []);

  const codes = new Set(res.compatible.map((c) => c.code));
  for (const expected of [
    'CONSTANT_ADDED',
    'CONSTANT_GROUP_ADDED',
    'ENUM_VARIANT_ADDED',
    'ENUM_ADDED',
    'STRUCT_FIELD_ADDED_OPTIONAL',
    'STRUCT_ADDED',
    'TAGGED_UNION_VARIANT_ADDED',
    'RPC_PARAMS_RELAXED',
    'RPC_RESULT_NARROWED',
    'RPC_ADDED',
    'EVENT_PAYLOAD_NARROWED',
    'EVENT_ADDED',
  ]) {
    assert.ok(codes.has(expected), `Expected compatible code ${expected}`);
  }
});

test('diffContractSpecs detects breaking changes in constants, enums, structs, and tagged unions', () => {
  const base = cloneSpec();
  const head = cloneSpec();

  // Constants: remove one, change value, change type
  delete head.constants.protocol.items.CHANNEL_NAME;
  head.constants.protocol.items.VERSION.value = 2;
  head.constants.protocol.items.DEFAULT_RATIO.type = 'f32';

  // Enums: rename variant wire value
  head.enums.SurfaceKind.variants[2].wire = 'opaque_v2';

  // Structs: remove field, change field type, make optional field required, add required field
  head.structs.NodeConfig.fields = head.structs.NodeConfig.fields.filter((f) => f.name !== 'type');
  head.structs.NodeConfig.fields.find((f) => f.name === 'port').type = 'string';
  head.structs.NodeConfig.fields.find((f) => f.name === 'tags').optional = false;
  head.structs.NodeConfig.fields.push({ name: 'cluster_id', type: 'string' });

  // Tagged unions: change tag, remove variant, change adjacent payload type
  head.taggedUnions.HostCommand.tag = 'action';
  head.taggedUnions.HostCommand.variants = head.taggedUnions.HostCommand.variants.filter(
    (v) => v.name !== 'Dismiss',
  );
  head.taggedUnions.AdjacentEvent.variants[0].payload = 'string';

  const res = diffContractSpecs(base, head);
  assert.equal(res.ok, false);

  const codes = new Set(res.breaking.map((b) => b.code));
  for (const expected of [
    'CONSTANT_REMOVED',
    'CONSTANT_VALUE_CHANGED',
    'CONSTANT_TYPE_CHANGED',
    'ENUM_VARIANT_REMOVED',
    'STRUCT_FIELD_REMOVED',
    'STRUCT_FIELD_TYPE_CHANGED',
    'STRUCT_FIELD_MADE_REQUIRED',
    'STRUCT_FIELD_ADDED_REQUIRED',
    'TAGGED_UNION_TAG_CHANGED',
    'TAGGED_UNION_VARIANT_REMOVED',
    'TAGGED_UNION_VARIANT_PAYLOAD_CHANGED',
  ]) {
    assert.ok(codes.has(expected), `Expected breaking code ${expected}`);
  }
});

test('diffContractSpecs detects breaking RPC and event wire changes', () => {
  const base = cloneSpec();
  base.rpcs.OPT_RPC = { method: 'core.opt', params: { optional: 'string' }, result: 'bool' };
  const head = cloneSpec(base);

  delete head.rpcs.UPDATE_NODE;
  head.rpcs.PING.method = 'core.pingV2';
  head.rpcs.PING.params = 'string';
  head.rpcs.PING.result = { optional: { ref: 'PingResult' } };
  head.rpcs.OPT_RPC.params = 'string';

  delete head.events.READY;
  head.events.STATE_CHANGED.event = 'core.stateUpdated';
  head.events.STATE_CHANGED.payload = 'string';

  const res = diffContractSpecs(base, head);
  assert.equal(res.ok, false);

  const codes = new Set(res.breaking.map((b) => b.code));
  for (const expected of [
    'RPC_REMOVED',
    'RPC_METHOD_CHANGED',
    'RPC_PARAMS_CHANGED',
    'RPC_RESULT_CHANGED',
    'EVENT_REMOVED',
    'EVENT_WIRE_CHANGED',
    'EVENT_PAYLOAD_CHANGED',
  ]) {
    assert.ok(codes.has(expected), `Expected breaking code ${expected}`);
  }
});

test('CLI diff command enforces exit codes and supports --json output', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'contracts-gen-diff-'));
  try {
    const baseSpec = cloneSpec();
    const compatSpec = cloneSpec();
    compatSpec.enums.SurfaceKind.variants.push({ name: 'Mica' });

    const brokenSpec = cloneSpec();
    delete brokenSpec.rpcs.PING;

    const basePath = path.join(tmpDir, 'base.contract.json');
    const compatPath = path.join(tmpDir, 'compat.contract.json');
    const brokenPath = path.join(tmpDir, 'broken.contract.json');
    fs.writeFileSync(basePath, JSON.stringify(baseSpec, null, 2), 'utf8');
    fs.writeFileSync(compatPath, JSON.stringify(compatSpec, null, 2), 'utf8');
    fs.writeFileSync(brokenPath, JSON.stringify(brokenSpec, null, 2), 'utf8');

    const logs = [];
    const errs = [];
    const io = { out: (m) => logs.push(m), err: (m) => errs.push(m) };

    assert.equal(runCli(['diff', basePath, compatPath], io), 0);
    assert.ok(logs.some((l) => l.includes('Contract diff passed: 0 breaking, 1 compatible')));

    logs.length = 0;
    errs.length = 0;
    assert.equal(runCli(['diff', basePath, brokenPath], io), 1);
    assert.ok(errs.some((l) => l.includes('[BREAKING] RPC_REMOVED rpcs.PING')));

    logs.length = 0;
    errs.length = 0;
    assert.equal(runCli(['diff', '--json', basePath, brokenPath], io), 1);
    const parsed = JSON.parse(logs.join('\n'));
    assert.equal(parsed.ok, false);
    assert.equal(parsed.breaking.length, 1);
    assert.equal(parsed.breaking[0].code, 'RPC_REMOVED');

    assert.equal(runCli(['diff', basePath], io), 1);
    assert.equal(runCli(['diff', '--bogus', basePath, compatPath], io), 1);

    const cliOut = execFileSync(
      process.execPath,
      [CLI_PATH, 'diff', '--json', basePath, compatPath],
      {
        encoding: 'utf8',
      },
    );
    assert.equal(JSON.parse(cliOut).ok, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
