import {
  applyRename,
  buildHeaderLines,
  escapeDoubleQuoted,
  inferConstType,
  isPlainObject,
  mapStringConstEntries,
  resolveWireName,
  sectionsUseType,
  selectSpecSections,
  toScreamingSnake,
  toSnakeCase,
  unwrapFieldType,
} from './helpers.mjs';

const RUST_KEYWORDS = new Set(
  'as async await box break const continue dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return static struct trait true type unsafe use where while'.split(
    ' ',
  ),
);

function rustFieldIdent(name) {
  const snake = toSnakeCase(name);
  if (snake === 'self' || snake === 'super' || snake === 'crate') return `${snake}_`;
  return RUST_KEYWORDS.has(snake) ? `r#${snake}` : snake;
}

function pushDoc(lines, doc, indent = '') {
  if (!doc) return;
  for (const line of String(doc).split('\n')) {
    lines.push(line.length > 0 ? `${indent}/// ${line}` : `${indent}///`);
  }
}

function renderRustType(typeExpr) {
  if (typeof typeExpr === 'string') {
    if (typeExpr === 'string') return 'String';
    if (typeExpr === 'json') return 'serde_json::Value';
    return typeExpr;
  }
  if (Object.hasOwn(typeExpr, 'list')) return `Vec<${renderRustType(typeExpr.list)}>`;
  if (Object.hasOwn(typeExpr, 'map')) {
    return `BTreeMap<${renderRustType(typeExpr.map[0])}, ${renderRustType(typeExpr.map[1])}>`;
  }
  if (Object.hasOwn(typeExpr, 'optional')) return `Option<${renderRustType(typeExpr.optional)}>`;
  if (Object.hasOwn(typeExpr, 'ref')) return typeExpr.ref;
  if (Object.hasOwn(typeExpr, 'literal')) {
    const v = typeExpr.literal;
    if (typeof v === 'string') return 'String';
    if (typeof v === 'boolean') return 'bool';
    return Number.isInteger(v) ? 'i64' : 'f64';
  }
  throw new Error(`Unsupported Rust type expression: ${JSON.stringify(typeExpr)}`);
}

function renderRustConstValue(value, constType) {
  if (constType === 'string') return escapeDoubleQuoted(String(value));
  if (constType === 'bool') return value ? 'true' : 'false';
  if (constType === 'f32' || constType === 'f64') {
    const s = String(value);
    return s.includes('.') || s.includes('e') || s.includes('E') ? s : `${s}.0`;
  }
  return String(value);
}

function isRustStdDefault(value) {
  return (
    value === null ||
    value === false ||
    value === 0 ||
    value === '' ||
    (Array.isArray(value) && value.length === 0) ||
    (isPlainObject(value) && Object.keys(value).length === 0)
  );
}

function renderRustDefaultExpr(value, innerType, optional) {
  if (value === null) return 'None';
  const expr =
    typeof value === 'string'
      ? `String::from(${escapeDoubleQuoted(value)})`
      : typeof value === 'boolean'
        ? String(value)
        : typeof value === 'number'
          ? renderRustConstValue(
              value,
              innerType === 'f32' || innerType === 'f64' ? innerType : 'i64',
            )
          : null;
  if (expr === null) throw new Error(`Unsupported Rust default value: ${JSON.stringify(value)}`);
  return optional ? `Some(${expr})` : expr;
}

function emitFieldLines(field, renameAll, ownerSnake, indent, helperFns) {
  const lines = [];
  const { inner, optional } = unwrapFieldType(field);
  const ident = rustFieldIdent(field.name);
  const rawIdent = ident.startsWith('r#') ? ident.slice(2) : ident;
  const wireName = resolveWireName(field, renameAll);
  const serdeImplicit = applyRename(rawIdent, renameAll);
  const rustType = optional ? `Option<${renderRustType(inner)}>` : renderRustType(inner);

  pushDoc(lines, field.doc, indent);
  if (wireName !== serdeImplicit) {
    lines.push(`${indent}#[serde(rename = ${escapeDoubleQuoted(wireName)})]`);
  }
  if (field.default !== undefined) {
    if (isRustStdDefault(field.default)) {
      lines.push(`${indent}#[serde(default)]`);
    } else {
      const fnName = `default_${ownerSnake}_${rawIdent}`;
      const expr = renderRustDefaultExpr(field.default, inner, optional);
      helperFns.push(`fn ${fnName}() -> ${rustType} {\n    ${expr}\n}`);
      lines.push(`${indent}#[serde(default = ${escapeDoubleQuoted(fnName)})]`);
    }
  } else if (optional) {
    lines.push(`${indent}#[serde(default)]`);
  }
  if (optional && field.skipSerializingIfNone === true) {
    lines.push(`${indent}#[serde(skip_serializing_if = "Option::is_none")]`);
  }
  lines.push(`${indent}${indent === '    ' ? 'pub ' : ''}${ident}: ${rustType},`);
  return lines;
}

function emitConstMod(modName, doc, items) {
  const lines = [];
  pushDoc(lines, doc);
  lines.push(`pub mod ${modName} {`);
  for (const [key, item] of items) {
    pushDoc(lines, item.doc, '    ');
    const cType = inferConstType(item.value, item.type);
    const rsType = cType === 'string' ? '&str' : cType;
    const val = renderRustConstValue(item.value, cType);
    lines.push(`    pub const ${toScreamingSnake(key)}: ${rsType} = ${val};`);
  }
  lines.push('}');
  return lines.join('\n');
}

/** Emits deterministic, rustfmt-aligned Rust code for the given contract spec and output config. */
export function emitRust(spec, output) {
  const selected = selectSpecSections(spec, output.include);
  const blocks = [];
  const helperFns = [];

  const headerLines = [...buildHeaderLines(output.header), '#![allow(dead_code)]'];
  blocks.push(headerLines.join('\n'));

  const needsSerde =
    selected.enums.length > 0 || selected.structs.length > 0 || selected.taggedUnions.length > 0;
  const needsMap = sectionsUseType(selected, (t) => isPlainObject(t) && Object.hasOwn(t, 'map'));

  const imports = [];
  if (needsSerde) imports.push('use serde::{Deserialize, Serialize};');
  if (needsMap) imports.push('use std::collections::BTreeMap;');
  if (imports.length > 0) blocks.push(imports.join('\n'));

  for (const [groupName, group] of selected.constants) {
    blocks.push(
      emitConstMod(group.rustMod ?? toSnakeCase(groupName), group.doc, Object.entries(group.items)),
    );
  }
  if (selected.rpcs.length > 0) {
    blocks.push(
      emitConstMod(
        output.rpcConstantsMod ?? 'rpc_methods',
        'RPC method constants.',
        mapStringConstEntries(selected.rpcs, 'method'),
      ),
    );
  }
  if (selected.events.length > 0) {
    blocks.push(
      emitConstMod(
        output.eventConstantsMod ?? 'events',
        'Event name constants.',
        mapStringConstEntries(selected.events, 'event'),
      ),
    );
  }

  for (const [name, def] of selected.enums) {
    const lines = [];
    pushDoc(lines, def.doc);
    lines.push('#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]');
    if (def.renameAll) lines.push(`#[serde(rename_all = ${escapeDoubleQuoted(def.renameAll)})]`);
    lines.push(`pub enum ${name} {`);
    for (const v of def.variants) {
      pushDoc(lines, v.doc, '    ');
      const wire = resolveWireName(v, def.renameAll);
      if (wire !== applyRename(v.name, def.renameAll)) {
        lines.push(`    #[serde(rename = ${escapeDoubleQuoted(wire)})]`);
      }
      lines.push(`    ${v.name},`);
    }
    lines.push('}');
    blocks.push(lines.join('\n'));
  }

  for (const [name, def] of selected.structs) {
    const lines = [];
    const derives = def.rustDerives ?? ['Debug', 'Clone', 'PartialEq', 'Serialize', 'Deserialize'];
    pushDoc(lines, def.doc);
    lines.push(`#[derive(${derives.join(', ')})]`);
    if (def.renameAll) lines.push(`#[serde(rename_all = ${escapeDoubleQuoted(def.renameAll)})]`);
    lines.push(`pub struct ${name} {`);
    for (const f of def.fields) {
      lines.push(...emitFieldLines(f, def.renameAll, toSnakeCase(name), '    ', helperFns));
    }
    lines.push('}');
    blocks.push(lines.join('\n'));
  }

  for (const [name, def] of selected.taggedUnions) {
    const lines = [];
    pushDoc(lines, def.doc);
    lines.push('#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]');
    const serdeAttrs = [`tag = ${escapeDoubleQuoted(def.tag)}`];
    if (def.content) serdeAttrs.push(`content = ${escapeDoubleQuoted(def.content)}`);
    if (def.renameAll) serdeAttrs.push(`rename_all = ${escapeDoubleQuoted(def.renameAll)}`);
    lines.push(`#[serde(${serdeAttrs.join(', ')})]`, `pub enum ${name} {`);
    for (const v of def.variants) {
      pushDoc(lines, v.doc, '    ');
      const wire = resolveWireName(v, def.renameAll);
      if (wire !== applyRename(v.name, def.renameAll)) {
        lines.push(`    #[serde(rename = ${escapeDoubleQuoted(wire)})]`);
      }
      if (v.fields) {
        lines.push(`    ${v.name} {`);
        const ownerSnake = `${toSnakeCase(name)}_${toSnakeCase(v.name)}`;
        for (const f of v.fields) {
          lines.push(...emitFieldLines(f, def.renameAll, ownerSnake, '        ', helperFns));
        }
        lines.push('    },');
      } else if (v.payload !== undefined) {
        lines.push(`    ${v.name}(${renderRustType(v.payload)}),`);
      } else {
        lines.push(`    ${v.name},`);
      }
    }
    lines.push('}');
    blocks.push(lines.join('\n'));
  }

  blocks.push(...helperFns);
  return `${blocks.join('\n\n')}\n`;
}
