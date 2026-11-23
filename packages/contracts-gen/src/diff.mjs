import {
  createReporter,
  diffConstants,
  diffEnums,
  diffFields,
  diffOutputType,
  formatTypeExpr,
  indexByWire,
  sortedKeys,
  typeExprEquals,
  unwrapOptionalExpr,
} from './diffHelpers.mjs';
import { validateContractSpec } from './spec.mjs';

const variantKind = (v) =>
  v.fields !== undefined ? 'fields' : v.payload !== undefined ? 'payload' : 'unit';

function diffStructs(base, head, r) {
  for (const n of sortedKeys(base.structs)) {
    if (!Object.hasOwn(head.structs, n)) {
      r.brk('STRUCT_REMOVED', `structs.${n}`, `Struct "${n}" removed`);
    } else {
      const [b, h] = [base.structs[n], head.structs[n]];
      diffFields(b.fields, b.renameAll, h.fields, h.renameAll, `structs.${n}`, r);
    }
  }
  for (const n of sortedKeys(head.structs)) {
    if (!Object.hasOwn(base.structs, n))
      r.cmp('STRUCT_ADDED', `structs.${n}`, `Added struct "${n}"`);
  }
}

function diffTaggedUnions(base, head, r) {
  for (const n of sortedKeys(base.taggedUnions)) {
    const up = `taggedUnions.${n}`;
    if (!Object.hasOwn(head.taggedUnions, n)) {
      r.brk('TAGGED_UNION_REMOVED', up, `Tagged union "${n}" removed`);
      continue;
    }
    const [b, h] = [base.taggedUnions[n], head.taggedUnions[n]];
    if (b.tag !== h.tag) {
      r.brk(
        'TAGGED_UNION_TAG_CHANGED',
        `${up}.$tag`,
        `Tag ("${b.tag}" -> "${h.tag}")`,
        b.tag,
        h.tag,
      );
    }
    if ((b.content ?? null) !== (h.content ?? null)) {
      r.brk(
        'TAGGED_UNION_CONTENT_CHANGED',
        `${up}.$content`,
        'Adjacent content key changed',
        b.content ?? null,
        h.content ?? null,
      );
    }
    const bvMap = indexByWire(b.variants, b.renameAll);
    const hvMap = indexByWire(h.variants, h.renameAll);
    for (const w of [...bvMap.keys()].sort()) {
      const vp = `${up}.${w}`;
      if (!hvMap.has(w)) {
        r.brk('TAGGED_UNION_VARIANT_REMOVED', vp, `Variant "${w}" removed or renamed`, w);
        continue;
      }
      const [bv, hv] = [bvMap.get(w), hvMap.get(w)];
      const [bk, hk] = [variantKind(bv), variantKind(hv)];
      if (bk !== hk) {
        r.brk(
          'TAGGED_UNION_VARIANT_SHAPE_CHANGED',
          vp,
          `Variant "${w}" shape (${bk} -> ${hk})`,
          bk,
          hk,
        );
      } else if (bk === 'fields') {
        diffFields(bv.fields, b.renameAll, hv.fields, h.renameAll, vp, r);
      } else if (bk === 'payload' && !typeExprEquals(bv.payload, hv.payload)) {
        const [bs, hs] = [formatTypeExpr(bv.payload), formatTypeExpr(hv.payload)];
        r.brk(
          'TAGGED_UNION_VARIANT_PAYLOAD_CHANGED',
          vp,
          `Variant "${w}" payload (${bs} -> ${hs})`,
          bs,
          hs,
        );
      }
    }
    for (const w of [...hvMap.keys()].sort()) {
      if (!bvMap.has(w)) {
        r.cmp('TAGGED_UNION_VARIANT_ADDED', `${up}.${w}`, `Added variant "${w}"`, undefined, w);
      }
    }
  }
  for (const n of sortedKeys(head.taggedUnions)) {
    if (!Object.hasOwn(base.taggedUnions, n)) {
      r.cmp('TAGGED_UNION_ADDED', `taggedUnions.${n}`, `Added tagged union "${n}"`);
    }
  }
}

function diffRpcs(base, head, r) {
  for (const k of sortedKeys(base.rpcs)) {
    const rp = `rpcs.${k}`;
    if (!Object.hasOwn(head.rpcs, k)) {
      r.brk('RPC_REMOVED', rp, `RPC "${k}" (${base.rpcs[k].method}) removed`, base.rpcs[k].method);
      continue;
    }
    const [b, h] = [base.rpcs[k], head.rpcs[k]];
    if (b.method !== h.method) {
      r.brk(
        'RPC_METHOD_CHANGED',
        `${rp}.method`,
        `Method ("${b.method}" -> "${h.method}")`,
        b.method,
        h.method,
      );
    }
    const [bp, hp] = [b.params ?? null, h.params ?? null];
    if (!typeExprEquals(bp, hp)) {
      const [bu, hu] = [unwrapOptionalExpr(bp), unwrapOptionalExpr(hp)];
      const [bs, hs] = [formatTypeExpr(bp), formatTypeExpr(hp)];
      const relaxed =
        (bp === null && hu.optional) ||
        (!bu.optional && hu.optional && typeExprEquals(bu.inner, hu.inner));
      if (relaxed) {
        r.cmp('RPC_PARAMS_RELAXED', `${rp}.params`, `Relaxed params (${bs} -> ${hs})`, bs, hs);
      } else {
        r.brk('RPC_PARAMS_CHANGED', `${rp}.params`, `Incompatible params (${bs} -> ${hs})`, bs, hs);
      }
    }
    diffOutputType(
      b.result,
      h.result,
      `${rp}.result`,
      'RPC_RESULT_CHANGED',
      'RPC_RESULT_NARROWED',
      r,
    );
  }
  for (const k of sortedKeys(head.rpcs)) {
    if (!Object.hasOwn(base.rpcs, k)) {
      r.cmp(
        'RPC_ADDED',
        `rpcs.${k}`,
        `Added RPC "${k}" (${head.rpcs[k].method})`,
        undefined,
        head.rpcs[k].method,
      );
    }
  }
}

function diffEvents(base, head, r) {
  for (const k of sortedKeys(base.events)) {
    const ep = `events.${k}`;
    if (!Object.hasOwn(head.events, k)) {
      r.brk(
        'EVENT_REMOVED',
        ep,
        `Event "${k}" (${base.events[k].event}) removed`,
        base.events[k].event,
      );
      continue;
    }
    const [b, h] = [base.events[k], head.events[k]];
    if (b.event !== h.event) {
      r.brk(
        'EVENT_WIRE_CHANGED',
        `${ep}.event`,
        `Event ("${b.event}" -> "${h.event}")`,
        b.event,
        h.event,
      );
    }
    diffOutputType(
      b.payload,
      h.payload,
      `${ep}.payload`,
      'EVENT_PAYLOAD_CHANGED',
      'EVENT_PAYLOAD_NARROWED',
      r,
    );
  }
  for (const k of sortedKeys(head.events)) {
    if (!Object.hasOwn(base.events, k)) {
      r.cmp(
        'EVENT_ADDED',
        `events.${k}`,
        `Added event "${k}" (${head.events[k].event})`,
        undefined,
        head.events[k].event,
      );
    }
  }
}

/**
 * Compares a base contract spec against a head contract spec and returns deterministic
 * wire-compatibility findings split into `breaking` and `compatible` arrays.
 */
export function diffContractSpecs(baseRaw, headRaw) {
  const base = validateContractSpec(baseRaw);
  const head = validateContractSpec(headRaw);
  const r = createReporter();
  diffConstants(base, head, r);
  diffEnums(base, head, r);
  diffStructs(base, head, r);
  diffTaggedUnions(base, head, r);
  diffRpcs(base, head, r);
  diffEvents(base, head, r);
  return { ok: r.breaking.length === 0, breaking: r.breaking, compatible: r.compatible };
}
