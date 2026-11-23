import {
  buildHeaderLines,
  escapeDoubleQuoted,
  inferConstType,
  isPlainObject,
  mapStringConstEntries,
  pushBlockDoc,
  resolveWireName,
  sectionsUseType,
  selectSpecSections,
  toCamelCase,
  toPascalCase,
  toScreamingSnake,
  unwrapFieldType,
} from './helpers.mjs';

const KOTLIN_KEYWORDS = new Set(
  'as break class continue do else false for fun if in interface is null object package return super this throw true try typealias typeof val var when while'.split(
    ' ',
  ),
);

const KT_PRIMITIVES = {
  string: 'String',
  bool: 'Boolean',
  u8: 'Int',
  u16: 'Int',
  i32: 'Int',
  u32: 'Long',
  u64: 'Long',
  i64: 'Long',
  usize: 'Long',
  f32: 'Float',
  f64: 'Double',
  json: 'JsonElement',
};

function kotlinPropName(name) {
  const camel = toCamelCase(name);
  return KOTLIN_KEYWORDS.has(camel) ? `\`${camel}\`` : camel;
}

function renderKotlinType(typeExpr) {
  if (typeof typeExpr === 'string') {
    const mapped = KT_PRIMITIVES[typeExpr];
    if (!mapped) throw new Error(`Unsupported Kotlin primitive "${typeExpr}"`);
    return mapped;
  }
  if (Object.hasOwn(typeExpr, 'list')) return `List<${renderKotlinType(typeExpr.list)}>`;
  if (Object.hasOwn(typeExpr, 'map')) {
    return `Map<${renderKotlinType(typeExpr.map[0])}, ${renderKotlinType(typeExpr.map[1])}>`;
  }
  if (Object.hasOwn(typeExpr, 'optional')) return `${renderKotlinType(typeExpr.optional)}?`;
  if (Object.hasOwn(typeExpr, 'ref')) return typeExpr.ref;
  if (Object.hasOwn(typeExpr, 'literal')) {
    const v = typeExpr.literal;
    if (typeof v === 'string') return 'String';
    if (typeof v === 'boolean') return 'Boolean';
    return Number.isInteger(v) ? 'Long' : 'Double';
  }
  throw new Error(`Unsupported Kotlin type expression: ${JSON.stringify(typeExpr)}`);
}

function renderKotlinLiteral(value, typeHint) {
  if (value === null) return 'null';
  if (Array.isArray(value) && value.length === 0) return 'emptyList()';
  if (isPlainObject(value) && Object.keys(value).length === 0) return 'emptyMap()';
  if (typeof value === 'string') return escapeDoubleQuoted(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (typeHint === 'u32' || typeHint === 'u64' || typeHint === 'i64' || typeHint === 'usize') {
      return `${value}L`;
    }
    if (typeHint === 'f32') {
      const s = String(value);
      return s.includes('.') ? `${s}f` : `${s}.0f`;
    }
    if (typeHint === 'f64') {
      const s = String(value);
      return s.includes('.') || s.includes('e') || s.includes('E') ? s : `${s}.0`;
    }
    return String(value);
  }
  throw new Error(`Unsupported Kotlin literal: ${JSON.stringify(value)}`);
}

function emitKotlinObject(name, doc, items) {
  const lines = [];
  pushBlockDoc(lines, doc);
  lines.push(`object ${name} {`);
  for (const [key, item] of items) {
    pushBlockDoc(lines, item.doc, '    ');
    const cType = inferConstType(item.value, item.type);
    const ktType = renderKotlinType(cType);
    const val = renderKotlinLiteral(item.value, cType);
    lines.push(`    const val ${toScreamingSnake(key)}: ${ktType} = ${val}`);
  }
  lines.push('}');
  return lines.join('\n');
}

function emitKotlinFields(fields, renameAll, indent, flags) {
  const lines = [];
  for (const f of fields) {
    const { inner, optional } = unwrapFieldType(f);
    const rawCamel = toCamelCase(f.name);
    const prop = kotlinPropName(f.name);
    const wire = resolveWireName(f, renameAll);
    const ktType = optional ? `${renderKotlinType(inner)}?` : renderKotlinType(inner);
    pushBlockDoc(lines, f.doc, indent);
    if (wire !== rawCamel) {
      flags.usesSerialName = true;
      lines.push(`${indent}@SerialName(${escapeDoubleQuoted(wire)})`);
    }
    let suffix = '';
    if (f.default !== undefined) {
      suffix = ` = ${renderKotlinLiteral(f.default, typeof inner === 'string' ? inner : undefined)}`;
    } else if (optional) {
      suffix = ' = null';
    }
    lines.push(`${indent}val ${prop}: ${ktType}${suffix},`);
  }
  return lines;
}

/** Emits deterministic, ktlint/detekt-friendly Kotlin code using kotlinx.serialization. */
export function emitKotlin(spec, output) {
  const selected = selectSpecSections(spec, output.include);
  const flags = {
    usesSerializable:
      selected.enums.length > 0 || selected.structs.length > 0 || selected.taggedUnions.length > 0,
    usesSerialName: selected.enums.length > 0 || selected.taggedUnions.length > 0,
    usesJsonElement: sectionsUseType(selected, (t) => t === 'json'),
    usesDiscriminator: selected.taggedUnions.length > 0,
  };

  const bodyBlocks = [];

  for (const [groupName, group] of selected.constants) {
    const objName = group.kotlinObject ?? toPascalCase(groupName);
    bodyBlocks.push(emitKotlinObject(objName, group.doc, Object.entries(group.items)));
  }

  if (selected.rpcs.length > 0) {
    bodyBlocks.push(
      emitKotlinObject(
        output.rpcConstantsObject ?? 'RpcMethods',
        'RPC method constants.',
        mapStringConstEntries(selected.rpcs, 'method'),
      ),
    );
  }
  if (selected.events.length > 0) {
    bodyBlocks.push(
      emitKotlinObject(
        output.eventConstantsObject ?? 'EventNames',
        'Event name constants.',
        mapStringConstEntries(selected.events, 'event'),
      ),
    );
  }

  for (const [name, def] of selected.enums) {
    const lines = [];
    pushBlockDoc(lines, def.doc);
    lines.push('@Serializable');
    lines.push(`enum class ${name} {`);
    for (const v of def.variants) {
      pushBlockDoc(lines, v.doc, '    ');
      const wire = resolveWireName(v, def.renameAll);
      lines.push(`    @SerialName(${escapeDoubleQuoted(wire)})`);
      lines.push(`    ${toScreamingSnake(v.name)},`);
    }
    lines.push('}');
    bodyBlocks.push(lines.join('\n'));
  }

  for (const [name, def] of selected.structs) {
    const lines = [];
    pushBlockDoc(lines, def.doc);
    lines.push('@Serializable');
    if (def.fields.length === 0) {
      lines.push(`class ${name}`);
    } else {
      lines.push(`data class ${name}(`);
      lines.push(...emitKotlinFields(def.fields, def.renameAll, '    ', flags));
      lines.push(')');
    }
    bodyBlocks.push(lines.join('\n'));
  }

  for (const [name, def] of selected.taggedUnions) {
    const lines = [];
    pushBlockDoc(lines, def.doc);
    lines.push('@OptIn(ExperimentalSerializationApi::class)');
    lines.push('@Serializable');
    lines.push(`@JsonClassDiscriminator(${escapeDoubleQuoted(def.tag)})`);
    lines.push(`sealed interface ${name} {`);
    for (let i = 0; i < def.variants.length; i++) {
      const v = def.variants[i];
      if (i > 0) lines.push('');
      pushBlockDoc(lines, v.doc, '    ');
      const wire = resolveWireName(v, def.renameAll);
      lines.push('    @Serializable');
      lines.push(`    @SerialName(${escapeDoubleQuoted(wire)})`);
      if (v.fields && v.fields.length > 0) {
        lines.push(`    data class ${v.name}(`);
        lines.push(...emitKotlinFields(v.fields, def.renameAll, '        ', flags));
        lines.push(`    ) : ${name}`);
      } else if (v.payload !== undefined) {
        const contentKey = def.content ?? 'payload';
        const prop = kotlinPropName(contentKey);
        lines.push(`    data class ${v.name}(`);
        if (contentKey !== toCamelCase(contentKey)) {
          lines.push(`        @SerialName(${escapeDoubleQuoted(contentKey)})`);
        }
        lines.push(`        val ${prop}: ${renderKotlinType(v.payload)},`);
        lines.push(`    ) : ${name}`);
      } else {
        lines.push(`    data object ${v.name} : ${name}`);
      }
    }
    lines.push('}');
    bodyBlocks.push(lines.join('\n'));
  }

  const headerLines = buildHeaderLines(output.header);

  const importSet = new Set(output.imports ?? []);
  if (flags.usesDiscriminator) {
    importSet.add('kotlinx.serialization.ExperimentalSerializationApi');
    importSet.add('kotlinx.serialization.json.JsonClassDiscriminator');
  }
  if (flags.usesSerialName) importSet.add('kotlinx.serialization.SerialName');
  if (flags.usesSerializable) importSet.add('kotlinx.serialization.Serializable');
  if (flags.usesJsonElement) importSet.add('kotlinx.serialization.json.JsonElement');
  const sortedImports = Array.from(importSet)
    .sort()
    .map((imp) => (imp.startsWith('import ') ? imp : `import ${imp}`));

  const sections = [headerLines.join('\n'), `package ${output.package}`];
  if (sortedImports.length > 0) sections.push(sortedImports.join('\n'));
  sections.push(...bodyBlocks);

  return `${sections.join('\n\n')}\n`;
}
