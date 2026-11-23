import {
  GENERATED_BANNER,
  isPlainObject,
  resolveWireName,
  selectSpecSections,
  unwrapFieldType,
} from './helpers.mjs';

const INTEGER_BOUNDS = {
  u8: { minimum: 0, maximum: 255 },
  u16: { minimum: 0, maximum: 65535 },
  u32: { minimum: 0, maximum: 4294967295 },
  u64: { minimum: 0 },
  usize: { minimum: 0 },
  i32: { minimum: -2147483648, maximum: 2147483647 },
  i64: {},
};

function renderSchemaType(typeExpr) {
  if (typeof typeExpr === 'string') {
    if (typeExpr === 'string') return { type: 'string' };
    if (typeExpr === 'bool') return { type: 'boolean' };
    if (typeExpr === 'f32' || typeExpr === 'f64') return { type: 'number' };
    if (typeExpr === 'json') return {};
    if (Object.hasOwn(INTEGER_BOUNDS, typeExpr)) {
      return { type: 'integer', ...INTEGER_BOUNDS[typeExpr] };
    }
    throw new Error(`Unsupported JSON Schema primitive "${typeExpr}"`);
  }
  if (Object.hasOwn(typeExpr, 'list')) {
    return { type: 'array', items: renderSchemaType(typeExpr.list) };
  }
  if (Object.hasOwn(typeExpr, 'map')) {
    return { type: 'object', additionalProperties: renderSchemaType(typeExpr.map[1]) };
  }
  if (Object.hasOwn(typeExpr, 'optional')) {
    return { anyOf: [renderSchemaType(typeExpr.optional), { type: 'null' }] };
  }
  if (Object.hasOwn(typeExpr, 'ref')) {
    return { $ref: `#/$defs/${typeExpr.ref}` };
  }
  if (Object.hasOwn(typeExpr, 'literal')) {
    return { const: typeExpr.literal };
  }
  throw new Error(`Unsupported JSON Schema type expression: ${JSON.stringify(typeExpr)}`);
}

function buildObjectSchema(fields, renameAll, extraProps = {}, extraRequired = []) {
  const properties = { ...extraProps };
  const required = [...extraRequired];
  for (const f of fields) {
    const { inner, optional } = unwrapFieldType(f);
    const wire = resolveWireName(f, renameAll);
    const fieldSchema = optional
      ? { anyOf: [renderSchemaType(inner), { type: 'null' }] }
      : renderSchemaType(inner);
    if (f.doc) fieldSchema.description = f.doc;
    properties[wire] = fieldSchema;
    if (!optional) required.push(wire);
  }
  const schema = {
    type: 'object',
    properties,
    additionalProperties: false,
  };
  if (required.length > 0) schema.required = required;
  return schema;
}

function buildUnionVariantSchema(spec, def, v) {
  const wire = resolveWireName(v, def.renameAll);
  const tagProps = { [def.tag]: { const: wire } };

  if (v.fields) {
    const obj = buildObjectSchema(v.fields, def.renameAll, tagProps, [def.tag]);
    if (v.doc) obj.description = v.doc;
    return obj;
  }

  if (v.payload !== undefined) {
    if (def.content) {
      const obj = {
        type: 'object',
        properties: {
          ...tagProps,
          [def.content]: renderSchemaType(v.payload),
        },
        required: [def.tag, def.content],
        additionalProperties: false,
      };
      if (v.doc) obj.description = v.doc;
      return obj;
    }

    // Internally tagged variant wrapping a referenced struct: inline struct fields so
    // `additionalProperties: false` permits the discriminator key cleanly.
    if (isPlainObject(v.payload) && Object.hasOwn(v.payload, 'ref')) {
      const targetStruct = spec.structs[v.payload.ref];
      if (targetStruct) {
        const obj = buildObjectSchema(targetStruct.fields, targetStruct.renameAll, tagProps, [
          def.tag,
        ]);
        if (v.doc) obj.description = v.doc;
        return obj;
      }
    }

    const combined = {
      allOf: [
        { type: 'object', properties: tagProps, required: [def.tag] },
        renderSchemaType(v.payload),
      ],
    };
    if (v.doc) combined.description = v.doc;
    return combined;
  }

  const unit = {
    type: 'object',
    properties: tagProps,
    required: [def.tag],
    additionalProperties: false,
  };
  if (v.doc) unit.description = v.doc;
  return unit;
}

/** Emits a deterministic JSON Schema Draft 2020-12 document with `$defs`. */
export function emitSchema(spec, output) {
  const selected = selectSpecSections(spec, output.include);
  const defs = {};

  for (const [name, def] of selected.enums) {
    const entry = {
      type: 'string',
      enum: def.variants.map((v) => resolveWireName(v, def.renameAll)),
    };
    if (def.doc) entry.description = def.doc;
    defs[name] = entry;
  }

  for (const [name, def] of selected.structs) {
    const entry = buildObjectSchema(def.fields, def.renameAll);
    if (def.doc) entry.description = def.doc;
    defs[name] = entry;
  }

  for (const [name, def] of selected.taggedUnions) {
    const entry = {
      oneOf: def.variants.map((v) => buildUnionVariantSchema(spec, def, v)),
    };
    if (def.doc) entry.description = def.doc;
    defs[name] = entry;
  }

  const doc = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $comment: GENERATED_BANNER,
    title: output.title ?? spec.name,
  };
  if (spec.description) doc.description = spec.description;
  doc.$defs = defs;

  return `${JSON.stringify(doc, null, 2)}\n`;
}
