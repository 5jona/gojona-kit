import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  emitKotlin,
  emitRust,
  emitSchema,
  emitTs,
  GENERATED_BANNER,
  runCli,
  validateContractSpec,
  validateFixtureData,
  validateValue,
} from '../src/index.mjs';
import { createSampleSpec } from './sampleSpec.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CLI_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/cli.mjs');

test('validateContractSpec rejects invalid schemaVersion, unresolved ref, and invalid include', () => {
  const base = createSampleSpec();
  assert.doesNotThrow(() => validateContractSpec(base));
  assert.throws(() => validateContractSpec({ ...base, schemaVersion: 2 }), /schemaVersion/);
  assert.throws(
    () =>
      validateContractSpec({
        ...base,
        structs: { Broken: { fields: [{ name: 'x', type: { ref: 'MissingType' } }] } },
      }),
    /MissingType/,
  );
  assert.throws(
    () =>
      validateContractSpec({
        ...base,
        outputs: [{ target: 'ts', path: 'a.ts', include: { structs: ['DoesNotExist'] } }],
      }),
    /DoesNotExist/,
  );
});

test('emitRust generates deterministic serde Rust code with defaults, maps, keywords, and unions', () => {
  const spec = validateContractSpec(createSampleSpec());
  const rustA = emitRust(spec, spec.outputs[0]);
  const rustB = emitRust(spec, spec.outputs[0]);
  assert.equal(rustA, rustB);
  assert.ok(rustA.includes(`// ${GENERATED_BANNER}`));
  assert.ok(rustA.includes('use serde::{Deserialize, Serialize};'));
  assert.ok(rustA.includes('use std::collections::BTreeMap;'));
  assert.ok(rustA.includes('pub const VERSION: u16 = 1;'));
  assert.ok(rustA.includes('pub const DEFAULT_RATIO: f64 = 1.0;'));
  assert.ok(rustA.includes('pub mod rpc_methods'));
  assert.ok(rustA.includes('pub const PING: &str = "core.ping";'));
  assert.ok(rustA.includes('#[serde(rename = "opaque_v1")]'));
  assert.ok(rustA.includes('#[serde(rename = "node-type")]'));
  assert.ok(rustA.includes('pub r#type: String,'));
  assert.ok(rustA.includes('#[serde(default = "default_node_config_port")]'));
  assert.ok(rustA.includes('fn default_node_config_port() -> u16 {\n    8080\n}'));
  assert.ok(rustA.includes('#[serde(skip_serializing_if = "Option::is_none")]'));
  assert.ok(rustA.includes('#[serde(tag = "kind", rename_all = "camelCase")]'));
  assert.ok(
    rustA.includes('#[serde(tag = "type", content = "payload", rename_all = "snake_case")]'),
  );

  const partial = emitRust(spec, spec.outputs[1]);
  assert.ok(partial.includes('pub mod protocol'));
  assert.ok(partial.includes('pub mod rpc_methods'));
  assert.ok(!partial.includes('pub struct NodeConfig'));
  assert.ok(!partial.includes('use serde::'));
});

test('emitKotlin generates deterministic kotlinx.serialization Kotlin code', () => {
  const spec = validateContractSpec(createSampleSpec());
  const kt = emitKotlin(spec, spec.outputs[2]);
  assert.ok(kt.includes(`// ${GENERATED_BANNER}`));
  assert.ok(kt.includes('package com.example.contracts'));
  assert.ok(kt.includes('import kotlinx.serialization.ExperimentalSerializationApi'));
  assert.ok(kt.includes('import kotlinx.serialization.SerialName'));
  assert.ok(kt.includes('import kotlinx.serialization.Serializable'));
  assert.ok(kt.includes('import kotlinx.serialization.json.JsonClassDiscriminator'));
  assert.ok(kt.includes('import kotlinx.serialization.json.JsonElement'));
  assert.ok(kt.includes('object ProtocolConstants'));
  assert.ok(kt.includes('const val VERSION: Int = 1'));
  assert.ok(kt.includes('@SerialName("native-glass")\n    NATIVE_GLASS,'));
  assert.ok(kt.includes('@SerialName("node-type")\n    val type: String,'));
  assert.ok(kt.includes('val port: Int = 8080,'));
  assert.ok(kt.includes('val tags: List<String>? = null,'));
  assert.ok(kt.includes('@JsonClassDiscriminator("kind")\nsealed interface HostCommand'));
  assert.ok(kt.includes('data object Dismiss : HostCommand'));
});

test('emitTs generates Biome-compliant TypeScript with RpcMethodMap and EventPayloadMap', () => {
  const spec = validateContractSpec(createSampleSpec());
  const ts = emitTs(spec, spec.outputs[3]);
  assert.ok(ts.includes(`// ${GENERATED_BANNER}`));
  assert.ok(ts.includes('export const PROTOCOL_CONSTANTS = {'));
  assert.ok(ts.includes("export type SurfaceKind = 'native-glass' | 'standalone' | 'opaque_v1';"));
  assert.ok(ts.includes("'node-type': string;"));
  assert.ok(ts.includes('export interface RpcMethodMap {'));
  assert.ok(ts.includes("'core.ping': {\n    params: void;\n    result: PingResult;\n  };"));
  assert.ok(ts.includes('export interface EventPayloadMap {'));
  assert.ok(ts.includes("'core.stateChanged': NodeConfig;"));

  const biomeBin = path.join(REPO_ROOT, 'node_modules', '.bin', 'biome');
  const biomeConfig = path.join(REPO_ROOT, 'packages/config/biome.base.json');
  const checked = execFileSync(
    biomeBin,
    ['check', '--write', '--config-path', biomeConfig, '--stdin-file-path=contracts.ts'],
    { input: ts, encoding: 'utf8' },
  );
  assert.equal(checked, ts);
});

test('emitSchema and validator validate positive and negative fixtures accurately', () => {
  const spec = validateContractSpec(createSampleSpec());
  const schema = JSON.parse(emitSchema(spec, spec.outputs[4]));
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.$comment, GENERATED_BANNER);

  const validNode = {
    nodeId: 'n1',
    port: 443,
    'node-type': 'edge',
    surface: 'native-glass',
    tags: ['a', 'b'],
  };
  assert.deepEqual(validateValue(validNode, schema.$defs.NodeConfig, schema), []);

  const invalidPortErrors = validateValue(
    { ...validNode, port: 70000 },
    schema.$defs.NodeConfig,
    schema,
  );
  assert.ok(invalidPortErrors.some((e) => e.includes('$.port') && e.includes('65535')));

  const extraKeyErrors = validateValue(
    { ...validNode, rogue: true },
    schema.$defs.NodeConfig,
    schema,
  );
  assert.ok(extraKeyErrors.some((e) => e.includes('$.rogue')));

  assert.deepEqual(validateValue({ kind: 'dismiss' }, schema.$defs.HostCommand, schema), []);
  assert.deepEqual(
    validateValue({ kind: 'applyNode', ...validNode }, schema.$defs.HostCommand, schema),
    [],
  );
  assert.ok(validateValue({ kind: 'unknown' }, schema.$defs.HostCommand, schema).length > 0);
  assert.equal(validateFixtureData(schema, 'NodeConfig', { nodeId: 'x' }, true).ok, true);
  assert.equal(validateFixtureData(schema, 'NodeConfig', validNode, true).ok, false);
});

test('CLI generate, check drift detection, and validate-fixtures work end to end', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'contracts-gen-cli-'));
  try {
    const specPath = path.join(tmpDir, 'sample.contract.json');
    fs.writeFileSync(specPath, JSON.stringify(createSampleSpec(), null, 2), 'utf8');

    const logs = [];
    const errs = [];
    const io = { out: (m) => logs.push(m), err: (m) => errs.push(m) };

    assert.equal(runCli(['generate', specPath], io), 0);
    assert.equal(runCli(['check', specPath], io), 0);

    const rsPath = path.join(tmpDir, 'out/contracts.rs');
    fs.appendFileSync(rsPath, '\n// drifted\n');
    errs.length = 0;
    assert.equal(runCli(['check', specPath], io), 1);
    assert.ok(errs.some((line) => line.includes(rsPath) && line.includes('content drift')));

    // Verify missing file drift detection
    fs.unlinkSync(rsPath);
    errs.length = 0;
    assert.equal(runCli(['check', specPath], io), 1);
    assert.ok(errs.some((line) => line.includes(rsPath) && line.includes('missing file')));

    // Regenerate and verify subprocess CLI execution
    execFileSync(process.execPath, [CLI_PATH, 'generate', specPath], { stdio: 'pipe' });
    execFileSync(process.execPath, [CLI_PATH, 'check', specPath], { stdio: 'pipe' });

    const fixturesDir = path.join(tmpDir, 'fixtures');
    fs.mkdirSync(fixturesDir, { recursive: true });
    fs.writeFileSync(
      path.join(fixturesDir, 'PingResult.ok.json'),
      JSON.stringify({ ok: true, uptimeMs: 1234 }),
    );
    fs.writeFileSync(
      path.join(fixturesDir, 'wrapped-valid.json'),
      JSON.stringify({ $def: 'AdjacentEvent', data: { type: 'heartbeat', payload: 99 } }),
    );
    fs.writeFileSync(
      path.join(fixturesDir, 'wrapped-invalid.json'),
      JSON.stringify({ $def: 'PingResult', invalid: true, data: { ok: 'nope', uptimeMs: -1 } }),
    );

    const schemaPath = path.join(tmpDir, 'out/contracts.schema.json');
    assert.equal(runCli(['validate-fixtures', schemaPath, fixturesDir], io), 0);

    fs.writeFileSync(
      path.join(fixturesDir, 'bad-negative.json'),
      JSON.stringify({ $def: 'PingResult', invalid: true, data: { ok: true, uptimeMs: 0 } }),
    );
    errs.length = 0;
    assert.equal(runCli(['validate-fixtures', schemaPath, fixturesDir], io), 1);
    assert.ok(errs.some((line) => line.includes('Expected invalid fixture')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
