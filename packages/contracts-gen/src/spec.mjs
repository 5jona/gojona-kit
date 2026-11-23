import fs from 'node:fs';
import path from 'node:path';
import { CONST_TYPES, isPlainObject, PRIMITIVE_TYPES, RENAME_RULES } from './helpers.mjs';

const VALID_TARGETS = new Set(['rust', 'kotlin', 'ts', 'jsonSchema']);
const SECTION_KEYS = ['constants', 'enums', 'structs', 'taggedUnions', 'rpcs', 'events'];

function fail(ctx, message) {
  throw new Error(`Invalid contract spec (${ctx}): ${message}`);
}

function assertNonEmptyString(val, ctx) {
  if (typeof val !== 'string' || val.trim().length === 0) {
    fail(ctx, 'expected a non-empty string');
  }
}

function assertOptionalRename(val, ctx) {
  if (val !== undefined && !RENAME_RULES.has(val)) {
    fail(ctx, `unsupported renameAll "${val}"`);
  }
}

function validateTypeExpr(typeExpr, knownTypes, ctx) {
  if (typeof typeExpr === 'string') {
    if (!PRIMITIVE_TYPES.has(typeExpr)) {
      fail(ctx, `unknown primitive type "${typeExpr}"`);
    }
    return;
  }
  if (!isPlainObject(typeExpr)) {
    fail(ctx, 'type expression must be a primitive string or type object');
  }
  const keys = Object.keys(typeExpr);
  if (keys.length !== 1) {
    fail(ctx, `type expression object must have exactly one key, got [${keys.join(', ')}]`);
  }
  const [kind] = keys;
  const arg = typeExpr[kind];
  if (kind === 'list' || kind === 'optional') {
    validateTypeExpr(arg, knownTypes, `${ctx}.${kind}`);
    return;
  }
  if (kind === 'map') {
    if (!Array.isArray(arg) || arg.length !== 2) {
      fail(`${ctx}.map`, 'expected [KeyType, ValueType] tuple');
    }
    validateTypeExpr(arg[0], knownTypes, `${ctx}.map[0]`);
    validateTypeExpr(arg[1], knownTypes, `${ctx}.map[1]`);
    return;
  }
  if (kind === 'ref') {
    assertNonEmptyString(arg, `${ctx}.ref`);
    if (!knownTypes.has(arg)) {
      fail(
        `${ctx}.ref`,
        `referenced type "${arg}" is not declared in enums, structs, or taggedUnions`,
      );
    }
    return;
  }
  if (kind === 'literal') {
    if (typeof arg !== 'string' && typeof arg !== 'number' && typeof arg !== 'boolean') {
      fail(`${ctx}.literal`, 'literal must be string, number, or boolean');
    }
    return;
  }
  fail(ctx, `unsupported type constructor "${kind}"`);
}

function validateFields(fields, knownTypes, ctx) {
  if (!Array.isArray(fields)) {
    fail(ctx, 'fields must be an array');
  }
  const seen = new Set();
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    const fCtx = `${ctx}[${i}]`;
    if (!isPlainObject(f)) fail(fCtx, 'field must be an object');
    assertNonEmptyString(f.name, `${fCtx}.name`);
    if (seen.has(f.name)) fail(fCtx, `duplicate field name "${f.name}"`);
    seen.add(f.name);
    validateTypeExpr(f.type, knownTypes, `${fCtx}.type`);
  }
}

function validateSections(spec, knownTypes) {
  for (const [groupName, group] of Object.entries(spec.constants)) {
    const gCtx = `constants.${groupName}`;
    if (!isPlainObject(group) || !isPlainObject(group.items)) {
      fail(gCtx, 'constant group must be an object with an items map');
    }
    for (const [key, item] of Object.entries(group.items)) {
      const iCtx = `${gCtx}.items.${key}`;
      if (!isPlainObject(item)) fail(iCtx, 'constant item must be an object');
      const vType = typeof item.value;
      if (vType !== 'string' && vType !== 'number' && vType !== 'boolean') {
        fail(`${iCtx}.value`, 'value must be string, number, or boolean');
      }
      if (item.type !== undefined && !CONST_TYPES.has(item.type)) {
        fail(`${iCtx}.type`, `unsupported constant type "${item.type}"`);
      }
    }
  }

  for (const [name, def] of Object.entries(spec.enums)) {
    const eCtx = `enums.${name}`;
    if (!isPlainObject(def)) fail(eCtx, 'enum definition must be an object');
    assertOptionalRename(def.renameAll, `${eCtx}.renameAll`);
    if (!Array.isArray(def.variants) || def.variants.length === 0) {
      fail(`${eCtx}.variants`, 'enum must declare at least one variant');
    }
    for (let i = 0; i < def.variants.length; i++) {
      const v = def.variants[i];
      if (!isPlainObject(v)) fail(`${eCtx}.variants[${i}]`, 'variant must be an object');
      assertNonEmptyString(v.name, `${eCtx}.variants[${i}].name`);
    }
  }

  for (const [name, def] of Object.entries(spec.structs)) {
    const sCtx = `structs.${name}`;
    if (!isPlainObject(def)) fail(sCtx, 'struct definition must be an object');
    assertOptionalRename(def.renameAll, `${sCtx}.renameAll`);
    validateFields(def.fields, knownTypes, `${sCtx}.fields`);
  }

  for (const [name, def] of Object.entries(spec.taggedUnions)) {
    const uCtx = `taggedUnions.${name}`;
    if (!isPlainObject(def)) fail(uCtx, 'taggedUnion definition must be an object');
    assertNonEmptyString(def.tag, `${uCtx}.tag`);
    assertOptionalRename(def.renameAll, `${uCtx}.renameAll`);
    if (!Array.isArray(def.variants) || def.variants.length === 0) {
      fail(`${uCtx}.variants`, 'taggedUnion must declare at least one variant');
    }
    for (let i = 0; i < def.variants.length; i++) {
      const v = def.variants[i];
      const vCtx = `${uCtx}.variants[${i}]`;
      if (!isPlainObject(v)) fail(vCtx, 'variant must be an object');
      assertNonEmptyString(v.name, `${vCtx}.name`);
      if (v.fields !== undefined && v.payload !== undefined) {
        fail(vCtx, 'variant cannot declare both fields and payload');
      }
      if (v.fields !== undefined) validateFields(v.fields, knownTypes, `${vCtx}.fields`);
      if (v.payload !== undefined) validateTypeExpr(v.payload, knownTypes, `${vCtx}.payload`);
    }
  }
  validateRpcAndEvents(spec, knownTypes);
}

function validateRpcAndEvents(spec, knownTypes) {
  for (const [key, def] of Object.entries(spec.rpcs)) {
    const rCtx = `rpcs.${key}`;
    if (!isPlainObject(def)) fail(rCtx, 'rpc definition must be an object');
    assertNonEmptyString(def.method, `${rCtx}.method`);
    if (def.params != null) validateTypeExpr(def.params, knownTypes, `${rCtx}.params`);
    if (def.result != null) validateTypeExpr(def.result, knownTypes, `${rCtx}.result`);
  }
  for (const [key, def] of Object.entries(spec.events)) {
    const evCtx = `events.${key}`;
    if (!isPlainObject(def)) fail(evCtx, 'event definition must be an object');
    assertNonEmptyString(def.event, `${evCtx}.event`);
    if (def.payload != null) validateTypeExpr(def.payload, knownTypes, `${evCtx}.payload`);
  }
}

function validateOutputs(spec) {
  if (!Array.isArray(spec.outputs) || spec.outputs.length === 0) {
    fail('outputs', 'outputs must be a non-empty array');
  }
  for (let i = 0; i < spec.outputs.length; i++) {
    const out = spec.outputs[i];
    const oCtx = `outputs[${i}]`;
    if (!isPlainObject(out)) fail(oCtx, 'output config must be an object');
    if (!VALID_TARGETS.has(out.target)) {
      fail(`${oCtx}.target`, `unsupported target "${out.target}"`);
    }
    assertNonEmptyString(out.path, `${oCtx}.path`);
    if (out.target === 'kotlin') {
      assertNonEmptyString(out.package, `${oCtx}.package`);
    }
    if (out.include !== undefined) {
      if (!isPlainObject(out.include)) fail(`${oCtx}.include`, 'include must be an object');
      for (const [sec, rule] of Object.entries(out.include)) {
        if (!SECTION_KEYS.includes(sec)) {
          fail(`${oCtx}.include`, `unknown section "${sec}"`);
        }
        if (typeof rule === 'boolean') continue;
        if (!Array.isArray(rule)) {
          fail(`${oCtx}.include.${sec}`, 'expected boolean or string[]');
        }
        const sourceMap = spec[sec] ?? {};
        for (const item of rule) {
          if (typeof item !== 'string' || !Object.hasOwn(sourceMap, item)) {
            fail(`${oCtx}.include.${sec}`, `unknown entry "${item}"`);
          }
        }
      }
    }
  }
}

/** Validates and normalizes an in-memory contract spec object. */
export function validateContractSpec(raw) {
  if (!isPlainObject(raw)) fail('root', 'spec must be a JSON object');
  if (raw.$schema !== undefined) {
    assertNonEmptyString(raw.$schema, '$schema');
  }
  if (raw.schemaVersion !== 1) {
    fail('schemaVersion', `expected 1, got ${JSON.stringify(raw.schemaVersion)}`);
  }
  assertNonEmptyString(raw.name, 'name');

  const spec = {
    ...(raw.$schema !== undefined ? { $schema: raw.$schema.trim() } : {}),
    schemaVersion: 1,
    name: raw.name.trim(),
    description: typeof raw.description === 'string' ? raw.description : '',
    constants: isPlainObject(raw.constants) ? raw.constants : {},
    enums: isPlainObject(raw.enums) ? raw.enums : {},
    structs: isPlainObject(raw.structs) ? raw.structs : {},
    taggedUnions: isPlainObject(raw.taggedUnions) ? raw.taggedUnions : {},
    rpcs: isPlainObject(raw.rpcs) ? raw.rpcs : {},
    events: isPlainObject(raw.events) ? raw.events : {},
    outputs: raw.outputs,
  };

  const knownTypes = new Set([
    ...Object.keys(spec.enums),
    ...Object.keys(spec.structs),
    ...Object.keys(spec.taggedUnions),
  ]);
  validateSections(spec, knownTypes);
  validateOutputs(spec);
  return spec;
}

/** Reads, parses, and validates a `*.contract.json` file from disk. */
export function loadContractSpec(specPath) {
  const absPath = path.resolve(specPath);
  const rawText = fs.readFileSync(absPath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    throw new Error(`Failed to parse JSON spec "${specPath}": ${err.message}`);
  }
  const spec = validateContractSpec(parsed);
  return { spec, specPath: absPath, baseDir: path.dirname(absPath) };
}
