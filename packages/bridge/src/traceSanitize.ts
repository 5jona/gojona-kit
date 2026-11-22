const SENSITIVE_KEY_PATTERN = /token|secret|password|passwd|auth|cookie|private.?key/i;

export const TRACE_REDACTED_VALUE = '[REDACTED]';
export const DEFAULT_TRACE_MAX_STRING_LENGTH = 256;
export const DEFAULT_TRACE_MAX_DEPTH = 4;
export const DEFAULT_TRACE_MAX_ARRAY_LENGTH = 20;
export const DEFAULT_TRACE_MAX_OBJECT_KEYS = 30;

export interface SanitizeTraceOptions {
  maxStringLength?: number;
  maxDepth?: number;
  maxArrayLength?: number;
  maxObjectKeys?: number;
}

function truncateString(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}…`;
}

function sanitizeInternal(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
  opts: Required<SanitizeTraceOptions>,
): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    return truncateString(value, opts.maxStringLength);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'bigint') {
    return truncateString(value.toString(), opts.maxStringLength);
  }
  if (typeof value === 'symbol') {
    return truncateString(value.toString(), opts.maxStringLength);
  }
  if (typeof value === 'function') {
    return '[Function]';
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: truncateString(value.message, opts.maxStringLength),
    };
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? 'Invalid Date' : value.toISOString();
  }
  if (typeof value !== 'object') {
    return truncateString(String(value), opts.maxStringLength);
  }
  if (seen.has(value)) {
    return '[Circular]';
  }
  if (depth >= opts.maxDepth) {
    return '[MaxDepth]';
  }

  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const limit = Math.min(value.length, opts.maxArrayLength);
      const out: unknown[] = [];
      for (let i = 0; i < limit; i += 1) {
        out.push(sanitizeInternal(value[i], depth + 1, seen, opts));
      }
      if (value.length > limit) {
        out.push(`… (+${value.length - limit} items)`);
      }
      return out;
    }

    const entries = Object.entries(value as Record<string, unknown>);
    const out: Record<string, unknown> = {};
    const limit = Math.min(entries.length, opts.maxObjectKeys);
    for (let i = 0; i < limit; i += 1) {
      const [key, entryValue] = entries[i];
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        out[key] = TRACE_REDACTED_VALUE;
      } else {
        out[key] = sanitizeInternal(entryValue, depth + 1, seen, opts);
      }
    }
    if (entries.length > limit) {
      out['…'] = `+${entries.length - limit} keys`;
    }
    return out;
  } finally {
    seen.delete(value);
  }
}

/**
 * Recursively redacts sensitive keys and truncates long strings, deep trees,
 * and large collections so trace payloads never leak credentials or spike memory.
 */
export function sanitizeTraceValue(value: unknown, options: SanitizeTraceOptions = {}): unknown {
  const opts: Required<SanitizeTraceOptions> = {
    maxStringLength: Math.max(1, options.maxStringLength ?? DEFAULT_TRACE_MAX_STRING_LENGTH),
    maxDepth: Math.max(1, options.maxDepth ?? DEFAULT_TRACE_MAX_DEPTH),
    maxArrayLength: Math.max(1, options.maxArrayLength ?? DEFAULT_TRACE_MAX_ARRAY_LENGTH),
    maxObjectKeys: Math.max(1, options.maxObjectKeys ?? DEFAULT_TRACE_MAX_OBJECT_KEYS),
  };
  return sanitizeInternal(value, 0, new WeakSet<object>(), opts);
}
