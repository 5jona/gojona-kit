import fs from 'node:fs';
import path from 'node:path';
import { isPlainObject } from './helpers.mjs';

function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, idx) => deepEqual(item, b[idx]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((k) => Object.hasOwn(b, k) && deepEqual(a[k], b[k]));
  }
  return false;
}

const TYPE_CHECKS = {
  null: (v) => v === null,
  boolean: (v) => typeof v === 'boolean',
  string: (v) => typeof v === 'string',
  integer: (v) => typeof v === 'number' && Number.isInteger(v),
  number: (v) => typeof v === 'number' && Number.isFinite(v),
  array: (v) => Array.isArray(v),
  object: (v) => isPlainObject(v),
};

function matchesType(value, expected) {
  return TYPE_CHECKS[expected]?.(value) ?? false;
}

function resolveRef(rootSchema, ref, seen) {
  if (typeof ref !== 'string' || !ref.startsWith('#/$defs/')) {
    throw new Error(`Unsupported $ref "${ref}" (expected "#/$defs/<Name>")`);
  }
  const defName = ref.slice('#/$defs/'.length);
  const target = rootSchema?.$defs?.[defName];
  if (!target) {
    throw new Error(`Unresolved schema reference "${ref}"`);
  }
  if (seen.has(ref)) return null;
  const nextSeen = new Set(seen);
  nextSeen.add(ref);
  return { target, seen: nextSeen };
}

/**
 * Validates `value` against `schema` using `rootSchema` for `#/$defs/*` resolution.
 * Returns an array of human-readable error strings with JSON paths (empty when valid).
 */
export function validateValue(value, schema, rootSchema, valuePath = '$', seenRefs = new Set()) {
  if (schema === true) return [];
  if (schema === false) return [`${valuePath}: value is disallowed by false schema`];
  if (!isPlainObject(schema)) return [`${valuePath}: invalid schema node`];

  const errors = [];

  if (schema.$ref) {
    const resolved = resolveRef(rootSchema, schema.$ref, seenRefs);
    if (!resolved) {
      return [`${valuePath}: cyclic $ref "${schema.$ref}"`];
    }
    errors.push(...validateValue(value, resolved.target, rootSchema, valuePath, resolved.seen));
    return errors;
  }

  if (Object.hasOwn(schema, 'const')) {
    if (!deepEqual(value, schema.const)) {
      errors.push(
        `${valuePath}: expected constant ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`,
      );
    }
  }

  if (Array.isArray(schema.enum)) {
    if (!schema.enum.some((candidate) => deepEqual(value, candidate))) {
      errors.push(
        `${valuePath}: expected one of ${JSON.stringify(schema.enum)}, got ${JSON.stringify(value)}`,
      );
    }
  }

  if (schema.type !== undefined) {
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!allowed.some((t) => matchesType(value, t))) {
      errors.push(
        `${valuePath}: expected type ${allowed.join(' | ')}, got ${value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value}`,
      );
      return errors;
    }
  }

  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) {
      errors.push(`${valuePath}: value ${value} is less than minimum ${schema.minimum}`);
    }
    if (typeof schema.maximum === 'number' && value > schema.maximum) {
      errors.push(`${valuePath}: value ${value} exceeds maximum ${schema.maximum}`);
    }
  }

  if (Array.isArray(value) && schema.items !== undefined) {
    for (let i = 0; i < value.length; i++) {
      errors.push(...validateValue(value[i], schema.items, rootSchema, `${valuePath}[${i}]`));
    }
  }

  if (isPlainObject(value)) {
    if (Array.isArray(schema.required)) {
      for (const reqKey of schema.required) {
        if (!Object.hasOwn(value, reqKey)) {
          errors.push(`${valuePath}: missing required property "${reqKey}"`);
        }
      }
    }
    const props = isPlainObject(schema.properties) ? schema.properties : {};
    for (const [key, propVal] of Object.entries(value)) {
      const childPath = `${valuePath}.${key}`;
      if (Object.hasOwn(props, key)) {
        errors.push(...validateValue(propVal, props[key], rootSchema, childPath));
      } else if (schema.additionalProperties === false) {
        errors.push(`${childPath}: unexpected additional property "${key}"`);
      } else if (isPlainObject(schema.additionalProperties)) {
        errors.push(...validateValue(propVal, schema.additionalProperties, rootSchema, childPath));
      }
    }
  }

  if (Array.isArray(schema.allOf)) {
    for (const branch of schema.allOf) {
      errors.push(...validateValue(value, branch, rootSchema, valuePath, seenRefs));
    }
  }

  if (Array.isArray(schema.anyOf)) {
    const branchErrors = schema.anyOf.map((branch) =>
      validateValue(value, branch, rootSchema, valuePath, seenRefs),
    );
    if (!branchErrors.some((errs) => errs.length === 0)) {
      errors.push(
        `${valuePath}: failed all anyOf branches (${branchErrors.map((e) => e[0]).join('; ')})`,
      );
    }
  }

  if (Array.isArray(schema.oneOf)) {
    const branchErrors = schema.oneOf.map((branch) =>
      validateValue(value, branch, rootSchema, valuePath, seenRefs),
    );
    const matchCount = branchErrors.filter((errs) => errs.length === 0).length;
    if (matchCount !== 1) {
      const detail =
        matchCount === 0
          ? `matched 0 branches (${branchErrors.map((e) => e[0]).join('; ')})`
          : `matched ${matchCount} branches (expected exactly 1)`;
      errors.push(`${valuePath}: oneOf violation — ${detail}`);
    }
  }

  return errors;
}

/** Collects `*.json` fixture paths from a list of files and/or directories in sorted order. */
export function collectFixtureFiles(targets) {
  const files = [];
  function walk(targetPath) {
    const abs = path.resolve(targetPath);
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
        walk(path.join(abs, entry.name));
      }
    } else if (abs.endsWith('.json')) {
      files.push(abs);
    }
  }
  for (const t of targets) walk(t);
  return files.sort();
}

/** Validates a single parsed fixture payload against `rootSchema.$defs[defName]`. */
export function validateFixtureData(rootSchema, defName, data, expectInvalid = false) {
  const defSchema = rootSchema?.$defs?.[defName];
  if (!defSchema) {
    return {
      ok: false,
      defName,
      expectInvalid,
      errors: [`Unknown $defs entry "${defName}"`],
    };
  }
  const schemaErrors = validateValue(data, defSchema, rootSchema, '$');
  if (expectInvalid) {
    if (schemaErrors.length > 0) {
      return { ok: true, defName, expectInvalid, errors: schemaErrors };
    }
    return {
      ok: false,
      defName,
      expectInvalid,
      errors: [`Expected invalid fixture for "${defName}", but validation succeeded`],
    };
  }
  return {
    ok: schemaErrors.length === 0,
    defName,
    expectInvalid,
    errors: schemaErrors,
  };
}

/** Loads and validates a single fixture file using wrapper or `<TypeName>.<case>.json` naming. */
export function validateFixtureFile(rootSchema, fixturePath) {
  const raw = fs.readFileSync(fixturePath, 'utf8');
  const parsed = JSON.parse(raw);

  let defName;
  let data;
  let expectInvalid = false;

  if (isPlainObject(parsed) && typeof parsed.$def === 'string' && Object.hasOwn(parsed, 'data')) {
    defName = parsed.$def;
    data = parsed.data;
    expectInvalid = Boolean(parsed.invalid);
  } else {
    const base = path.basename(fixturePath);
    const match = base.match(/^([^.]+)\..+\.json$/);
    if (!match) {
      return {
        ok: false,
        file: fixturePath,
        defName: null,
        expectInvalid: false,
        errors: [
          `Cannot determine $def for "${base}": use "<TypeName>.<case>.json" or { "$def", "data" } wrapper`,
        ],
      };
    }
    defName = match[1];
    data = parsed;
  }

  return {
    file: fixturePath,
    ...validateFixtureData(rootSchema, defName, data, expectInvalid),
  };
}
