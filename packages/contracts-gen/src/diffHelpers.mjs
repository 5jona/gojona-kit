import {
  inferConstType,
  isOptionalType,
  isPlainObject,
  resolveWireName,
  unwrapFieldType,
} from './helpers.mjs';

export const sortedKeys = (obj) => Object.keys(obj ?? {}).sort();

export function createReporter() {
  const breaking = [];
  const compatible = [];
  const push = (list, code, path, message, base, head) => {
    const item = { code, path, message };
    if (base !== undefined) item.base = base;
    if (head !== undefined) item.head = head;
    list.push(item);
  };
  return {
    breaking,
    compatible,
    brk: (code, path, message, base, head) => push(breaking, code, path, message, base, head),
    cmp: (code, path, message, base, head) => push(compatible, code, path, message, base, head),
  };
}

export function formatTypeExpr(t) {
  if (t == null) return 'void';
  if (typeof t === 'string') return t;
  if (Object.hasOwn(t, 'list')) return `list<${formatTypeExpr(t.list)}>`;
  if (Object.hasOwn(t, 'optional')) return `optional<${formatTypeExpr(t.optional)}>`;
  if (Object.hasOwn(t, 'map')) {
    return `map<${formatTypeExpr(t.map[0])}, ${formatTypeExpr(t.map[1])}>`;
  }
  if (Object.hasOwn(t, 'ref')) return t.ref;
  if (Object.hasOwn(t, 'literal')) return `literal(${JSON.stringify(t.literal)})`;
  return JSON.stringify(t);
}

export function typeExprEquals(a, b) {
  const l = a ?? null;
  const r = b ?? null;
  if (l === r) return true;
  if (l === null || r === null || typeof l === 'string' || typeof r === 'string') return l === r;
  if (!isPlainObject(l) || !isPlainObject(r)) return false;
  const [kl] = Object.keys(l);
  const [kr] = Object.keys(r);
  if (kl !== kr) return false;
  if (kl === 'list' || kl === 'optional') return typeExprEquals(l[kl], r[kr]);
  if (kl === 'map') {
    return typeExprEquals(l.map[0], r.map[0]) && typeExprEquals(l.map[1], r.map[1]);
  }
  if (kl === 'ref') return l.ref === r.ref;
  return kl === 'literal' && Object.is(l.literal, r.literal);
}

export function unwrapOptionalExpr(t) {
  let inner = t ?? null;
  let optional = false;
  while (isOptionalType(inner)) {
    optional = true;
    inner = inner.optional;
  }
  return { inner, optional };
}

export const indexByWire = (items, renameAll) =>
  new Map(items.map((item) => [resolveWireName(item, renameAll), item]));

export function diffFields(bFields, bRename, hFields, hRename, owner, r) {
  const bMap = indexByWire(bFields, bRename);
  const hMap = indexByWire(hFields, hRename);
  for (const w of [...bMap.keys()].sort()) {
    const p = `${owner}.${w}`;
    const bf = bMap.get(w);
    if (!hMap.has(w)) {
      r.brk('STRUCT_FIELD_REMOVED', p, `Field "${w}" removed or renamed`, formatTypeExpr(bf.type));
      continue;
    }
    const b = unwrapFieldType(bf);
    const h = unwrapFieldType(hMap.get(w));
    if (!typeExprEquals(b.inner, h.inner)) {
      const [bs, hs] = [formatTypeExpr(b.inner), formatTypeExpr(h.inner)];
      r.brk('STRUCT_FIELD_TYPE_CHANGED', p, `Field "${w}" type (${bs} -> ${hs})`, bs, hs);
    } else if (b.optional && !h.optional) {
      r.brk('STRUCT_FIELD_MADE_REQUIRED', p, `Field "${w}" made required`, 'optional', 'required');
    } else if (!b.optional && h.optional) {
      r.cmp('STRUCT_FIELD_MADE_OPTIONAL', p, `Field "${w}" made optional`, 'required', 'optional');
    }
  }
  for (const w of [...hMap.keys()].sort()) {
    if (bMap.has(w)) continue;
    const h = unwrapFieldType(hMap.get(w));
    const hs = formatTypeExpr(h.inner);
    const p = `${owner}.${w}`;
    if (h.optional) {
      r.cmp('STRUCT_FIELD_ADDED_OPTIONAL', p, `Added optional field "${w}" (${hs})`, undefined, hs);
    } else {
      r.brk('STRUCT_FIELD_ADDED_REQUIRED', p, `Added required field "${w}" (${hs})`, undefined, hs);
    }
  }
}

export function diffOutputType(bType, hType, path, codeBrk, codeCmp, r) {
  if (typeExprEquals(bType, hType)) return;
  const b = unwrapOptionalExpr(bType);
  const h = unwrapOptionalExpr(hType);
  const [bs, hs] = [formatTypeExpr(bType), formatTypeExpr(hType)];
  if (b.optional && !h.optional && typeExprEquals(b.inner, h.inner)) {
    r.cmp(codeCmp, path, `Narrowed output type (${bs} -> ${hs})`, bs, hs);
  } else {
    r.brk(codeBrk, path, `Changed type incompatibly (${bs} -> ${hs})`, bs, hs);
  }
}

export function diffConstants(base, head, r) {
  for (const g of sortedKeys(base.constants)) {
    const gp = `constants.${g}`;
    if (!Object.hasOwn(head.constants, g)) {
      r.brk('CONSTANT_GROUP_REMOVED', gp, `Constant group "${g}" removed`);
      continue;
    }
    const bItems = base.constants[g].items;
    const hItems = head.constants[g].items;
    for (const k of sortedKeys(bItems)) {
      const ip = `${gp}.${k}`;
      if (!Object.hasOwn(hItems, k)) {
        r.brk('CONSTANT_REMOVED', ip, `Constant "${k}" removed`, bItems[k].value);
        continue;
      }
      const [bi, hi] = [bItems[k], hItems[k]];
      if (!Object.is(bi.value, hi.value)) {
        r.brk('CONSTANT_VALUE_CHANGED', ip, `Constant "${k}" value changed`, bi.value, hi.value);
      } else {
        const [bt, ht] = [inferConstType(bi.value, bi.type), inferConstType(hi.value, hi.type)];
        if (bt !== ht)
          r.brk('CONSTANT_TYPE_CHANGED', ip, `Constant "${k}" type (${bt} -> ${ht})`, bt, ht);
      }
    }
    for (const k of sortedKeys(hItems)) {
      if (!Object.hasOwn(bItems, k)) {
        r.cmp('CONSTANT_ADDED', `${gp}.${k}`, `Added constant "${k}"`, undefined, hItems[k].value);
      }
    }
  }
  for (const g of sortedKeys(head.constants)) {
    if (!Object.hasOwn(base.constants, g)) {
      r.cmp('CONSTANT_GROUP_ADDED', `constants.${g}`, `Added constant group "${g}"`);
    }
  }
}

export function diffEnums(base, head, r) {
  for (const n of sortedKeys(base.enums)) {
    const ep = `enums.${n}`;
    if (!Object.hasOwn(head.enums, n)) {
      r.brk('ENUM_REMOVED', ep, `Enum "${n}" removed`);
      continue;
    }
    const bw = new Set(
      base.enums[n].variants.map((v) => resolveWireName(v, base.enums[n].renameAll)),
    );
    const hw = new Set(
      head.enums[n].variants.map((v) => resolveWireName(v, head.enums[n].renameAll)),
    );
    for (const w of [...bw].sort()) {
      if (!hw.has(w))
        r.brk('ENUM_VARIANT_REMOVED', `${ep}.${w}`, `Variant "${w}" removed/renamed`, w);
    }
    for (const w of [...hw].sort()) {
      if (!bw.has(w))
        r.cmp('ENUM_VARIANT_ADDED', `${ep}.${w}`, `Added variant "${w}"`, undefined, w);
    }
  }
  for (const n of sortedKeys(head.enums)) {
    if (!Object.hasOwn(base.enums, n)) r.cmp('ENUM_ADDED', `enums.${n}`, `Added enum "${n}"`);
  }
}
