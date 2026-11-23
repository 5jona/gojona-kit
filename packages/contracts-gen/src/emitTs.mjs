import {
  escapeSingleQuoted,
  GENERATED_BANNER,
  pushBlockDoc,
  resolveWireName,
  selectSpecSections,
  toScreamingSnake,
  unwrapFieldType,
} from './helpers.mjs';

const VALID_JS_IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function formatPropKey(key) {
  return VALID_JS_IDENT.test(key) ? key : escapeSingleQuoted(key);
}

function renderTsLiteral(value) {
  if (typeof value === 'string') return escapeSingleQuoted(value);
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  throw new Error(`Unsupported TS literal: ${JSON.stringify(value)}`);
}

function renderTsType(typeExpr) {
  if (typeof typeExpr === 'string') {
    if (typeExpr === 'string') return 'string';
    if (typeExpr === 'bool') return 'boolean';
    if (typeExpr === 'json') return 'unknown';
    return 'number';
  }
  if (Object.hasOwn(typeExpr, 'list')) {
    const inner = renderTsType(typeExpr.list);
    return /^[A-Za-z0-9_$[\]]+$/.test(inner) ? `${inner}[]` : `Array<${inner}>`;
  }
  if (Object.hasOwn(typeExpr, 'map')) {
    const key = renderTsType(typeExpr.map[0]);
    const val = renderTsType(typeExpr.map[1]);
    return `Record<${key}, ${val}>`;
  }
  if (Object.hasOwn(typeExpr, 'optional')) {
    return `${renderTsType(typeExpr.optional)} | null`;
  }
  if (Object.hasOwn(typeExpr, 'ref')) return typeExpr.ref;
  if (Object.hasOwn(typeExpr, 'literal')) return renderTsLiteral(typeExpr.literal);
  throw new Error(`Unsupported TS type expression: ${JSON.stringify(typeExpr)}`);
}

function emitFieldsBody(fields, renameAll, indent) {
  const lines = [];
  for (const f of fields) {
    const { inner, optional } = unwrapFieldType(f);
    const wire = resolveWireName(f, renameAll);
    pushBlockDoc(lines, f.doc, indent);
    lines.push(`${indent}${formatPropKey(wire)}${optional ? '?' : ''}: ${renderTsType(inner)};`);
  }
  return lines;
}

function emitConstObject(constName, doc, entries) {
  const lines = [];
  pushBlockDoc(lines, doc);
  lines.push(`export const ${constName} = {`);
  for (const [key, item] of entries) {
    pushBlockDoc(lines, item.doc, '  ');
    lines.push(`  ${formatPropKey(key)}: ${renderTsLiteral(item.value)},`);
  }
  lines.push('} as const;');
  return lines.join('\n');
}

/** Emits deterministic, Biome-friendly TypeScript types, const objects, and RPC/Event maps. */
export function emitTs(spec, output) {
  const selected = selectSpecSections(spec, output.include);
  const blocks = [];

  const headerLines = [`// ${GENERATED_BANNER}`];
  if (output.header) {
    for (const line of String(output.header).split('\n')) {
      headerLines.push(line.startsWith('//') ? line : `// ${line}`);
    }
  }
  if (Array.isArray(output.imports) && output.imports.length > 0) {
    headerLines.push('');
    for (const imp of output.imports) {
      headerLines.push(imp);
    }
  }
  blocks.push(headerLines.join('\n'));

  for (const [groupName, group] of selected.constants) {
    const constName = group.tsName ?? toScreamingSnake(groupName);
    blocks.push(emitConstObject(constName, group.doc, Object.entries(group.items)));
  }

  for (const [name, def] of selected.enums) {
    const wires = def.variants.map((v) => escapeSingleQuoted(resolveWireName(v, def.renameAll)));
    const lines = [];
    pushBlockDoc(lines, def.doc);
    const singleType = `export type ${name} = ${wires.join(' | ')};`;
    if (singleType.length <= 100) {
      lines.push(singleType);
    } else {
      lines.push(`export type ${name} =`);
      for (let i = 0; i < wires.length; i++) {
        lines.push(`  | ${wires[i]}${i === wires.length - 1 ? ';' : ''}`);
      }
    }
    blocks.push(lines.join('\n'));

    const valuesConst = `${toScreamingSnake(name)}_VALUES`;
    const singleArr = `export const ${valuesConst} = [${wires.join(', ')}] as const;`;
    if (singleArr.length <= 100) {
      blocks.push(singleArr);
    } else {
      const arrLines = [`export const ${valuesConst} = [`];
      for (const w of wires) arrLines.push(`  ${w},`);
      arrLines.push('] as const;');
      blocks.push(arrLines.join('\n'));
    }
  }

  for (const [name, def] of selected.structs) {
    const lines = [];
    pushBlockDoc(lines, def.doc);
    if (def.fields.length === 0) {
      lines.push(`export type ${name} = Record<string, never>;`);
    } else {
      lines.push(`export interface ${name} {`);
      lines.push(...emitFieldsBody(def.fields, def.renameAll, '  '));
      lines.push('}');
    }
    blocks.push(lines.join('\n'));
  }

  for (const [name, def] of selected.taggedUnions) {
    const lines = [];
    pushBlockDoc(lines, def.doc);
    lines.push(`export type ${name} =`);
    const tagProp = formatPropKey(def.tag);
    for (let i = 0; i < def.variants.length; i++) {
      const v = def.variants[i];
      const wire = escapeSingleQuoted(resolveWireName(v, def.renameAll));
      const isLast = i === def.variants.length - 1;
      const semi = isLast ? ';' : '';
      if (v.fields && v.fields.length > 0) {
        lines.push('  | {');
        lines.push(`      ${tagProp}: ${wire};`);
        lines.push(...emitFieldsBody(v.fields, def.renameAll, '      '));
        lines.push(`    }${semi}`);
      } else if (v.payload !== undefined) {
        const payloadTs = renderTsType(v.payload);
        if (def.content) {
          const contentProp = formatPropKey(def.content);
          lines.push('  | {');
          lines.push(`      ${tagProp}: ${wire};`);
          lines.push(`      ${contentProp}: ${payloadTs};`);
          lines.push(`    }${semi}`);
        } else {
          lines.push(`  | ({ ${tagProp}: ${wire} } & ${payloadTs})${semi}`);
        }
      } else {
        lines.push(`  | { ${tagProp}: ${wire} }${semi}`);
      }
    }
    blocks.push(lines.join('\n'));
  }

  if (selected.rpcs.length > 0) {
    const methodsName = output.methodsConstName ?? 'RPC_METHODS';
    const methodEntries = selected.rpcs.map(([k, r]) => [
      toScreamingSnake(k),
      { value: r.method, doc: r.doc },
    ]);
    blocks.push(emitConstObject(methodsName, 'RPC method names.', methodEntries));

    const mapName = output.rpcMapName ?? 'RpcMethodMap';
    const mapLines = [
      '/** Typed RPC method parameter and result map. */',
      `export interface ${mapName} {`,
    ];
    for (const [, r] of selected.rpcs) {
      pushBlockDoc(mapLines, r.doc, '  ');
      const paramsTs = r.params ? renderTsType(r.params) : 'void';
      const resultTs = r.result ? renderTsType(r.result) : 'void';
      mapLines.push(`  ${formatPropKey(r.method)}: {`);
      mapLines.push(`    params: ${paramsTs};`);
      mapLines.push(`    result: ${resultTs};`);
      mapLines.push('  };');
    }
    mapLines.push('}');
    blocks.push(mapLines.join('\n'));
  }

  if (selected.events.length > 0) {
    const eventsName = output.eventsConstName ?? 'EVENT_NAMES';
    const eventEntries = selected.events.map(([k, e]) => [
      toScreamingSnake(k),
      { value: e.event, doc: e.doc },
    ]);
    blocks.push(emitConstObject(eventsName, 'Host and plugin event names.', eventEntries));

    const mapName = output.eventMapName ?? 'EventPayloadMap';
    const mapLines = ['/** Typed event payload map. */', `export interface ${mapName} {`];
    for (const [, e] of selected.events) {
      pushBlockDoc(mapLines, e.doc, '  ');
      const payloadTs = e.payload ? renderTsType(e.payload) : 'void';
      mapLines.push(`  ${formatPropKey(e.event)}: ${payloadTs};`);
    }
    mapLines.push('}');
    blocks.push(mapLines.join('\n'));
  }

  return `${blocks.join('\n\n')}\n`;
}
