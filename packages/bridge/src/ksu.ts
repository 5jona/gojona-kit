import type { ExecOptions, ExecResult, WriteFileAtomicOptions } from './types.ts';

let ksuCallbackSeq = 0;

/**
 * Single-quotes an argument safely for POSIX shell execution.
 */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Executes a shell command through KernelSU Manager's `window.ksu.exec` bridge
 * with timeout protection and deterministic callback cleanup.
 */
export function ksuExec(cmd: string, options: ExecOptions = {}): Promise<ExecResult> {
  return new Promise((resolve) => {
    const ksu = typeof window !== 'undefined' ? window.ksu : undefined;
    if (!ksu || typeof ksu.exec !== 'function') {
      resolve({ errno: -127, stdout: '', stderr: 'KernelSU host bridge unavailable' });
      return;
    }

    const winBag = window as unknown as Record<string, unknown>;
    const timeoutMs = options.timeoutMs ?? 8000;
    const cbName = `__pochita_ksu_cb_${Date.now()}_${++ksuCallbackSeq}`;
    let settled = false;

    const cleanup = () => {
      if (typeof window !== 'undefined') {
        delete winBag[cbName];
      }
    };

    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ errno: -1, stdout: '', stderr: `Execution timeout (${timeoutMs}ms)` });
    }, timeoutMs);

    winBag[cbName] = (errno: unknown, stdout: unknown, stderr: unknown) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      cleanup();
      const numericErrno = typeof errno === 'number' ? errno : Number(errno);
      resolve({
        errno: Number.isFinite(numericErrno) ? Math.trunc(numericErrno) : -1,
        stdout: stdout != null ? String(stdout) : '',
        stderr: stderr != null ? String(stderr) : '',
      });
    };

    const hostOptions: Record<string, unknown> = {};
    if (options.cwd) hostOptions.cwd = options.cwd;
    if (options.env) hostOptions.env = options.env;

    try {
      ksu.exec(cmd, JSON.stringify(hostOptions), cbName);
    } catch (err) {
      if (!settled) {
        settled = true;
        window.clearTimeout(timer);
        cleanup();
        resolve({ errno: -2, stdout: '', stderr: String(err) });
      }
    }
  });
}

/**
 * Triggers a native toast inside KernelSU Manager when supported.
 */
export function ksuToast(message: string): boolean {
  const ksu = typeof window !== 'undefined' ? window.ksu : undefined;
  if (ksu && typeof ksu.toast === 'function') {
    try {
      ksu.toast(message);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Reads a UTF-8 file using KernelSU exec.
 * Returns `null` strictly when the file does not exist (`ENOENT`), and throws on execution/read errors.
 */
export async function ksuReadFile(path: string): Promise<string | null> {
  const quoted = shellQuote(path);
  const res = await ksuExec(`if [ ! -e ${quoted} ]; then exit 44; fi; cat ${quoted}`);
  if (res.errno === 44) {
    return null;
  }
  if (res.errno !== 0) {
    throw new Error(res.stderr.trim() || `Failed to read ${path} (errno ${res.errno})`);
  }
  return res.stdout;
}

/**
 * Atomically writes a configuration file (`unique tmp` -> preserve/set owner & mode -> `mv -f`)
 * so inotify watchers never observe half-written content or clobbered UID ownership.
 */
export async function ksuWriteFileAtomic(
  path: string,
  content: string,
  options: WriteFileAtomicOptions = {},
): Promise<ExecResult> {
  let delimiter = `__POCHITA_EOF_${Date.now()}_${Math.random().toString(36).slice(2, 8)}__`;
  while (content.includes(delimiter)) {
    delimiter += '_X';
  }
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const quotedTarget = shellQuote(path);
  const quotedTmpPrefix = shellQuote(`${path}.tmp.${suffix}.`);
  const mode = options.mode && /^[0-7]{3,4}$/.test(options.mode) ? options.mode : '0644';
  const owner =
    options.owner && /^[0-9a-zA-Z_.-]+:[0-9a-zA-Z_.-]+$/.test(options.owner) ? options.owner : null;
  const preserveMetadata = options.preserveMetadata ?? true;

  const writeBlock =
    content.length === 0
      ? ': > "$TMP_FILE"'
      : [
          `cat <<'${delimiter}' > "$TMP_FILE"`,
          content.endsWith('\n') ? content.slice(0, -1) : content,
          delimiter,
        ].join('\n');

  const ownerCmd = owner
    ? `chown ${shellQuote(owner)} "$TMP_FILE" 2>/dev/null || true`
    : preserveMetadata
      ? 'if [ -e "$TARGET_FILE" ]; then ORIG_OWNER=$(stat -c \'%u:%g\' "$TARGET_FILE" 2>/dev/null || true); [ -n "$ORIG_OWNER" ] && chown "$ORIG_OWNER" "$TMP_FILE" 2>/dev/null || true; fi'
      : '';

  const modeCmd =
    !options.mode && preserveMetadata
      ? `if [ -e "$TARGET_FILE" ]; then ORIG_MODE=$(stat -c '%a' "$TARGET_FILE" 2>/dev/null || true); if [ -n "$ORIG_MODE" ]; then chmod "$ORIG_MODE" "$TMP_FILE"; else chmod ${mode} "$TMP_FILE"; fi; else chmod ${mode} "$TMP_FILE"; fi`
      : `chmod ${mode} "$TMP_FILE"`;

  const cmd = [
    `TARGET_FILE=${quotedTarget}`,
    `TMP_FILE=${quotedTmpPrefix}$$`,
    'mkdir -p "$(dirname "$TARGET_FILE")"',
    writeBlock,
    ownerCmd,
    `${modeCmd} && mv -f "$TMP_FILE" "$TARGET_FILE" || { CODE=$?; rm -f "$TMP_FILE"; exit $CODE; }`,
  ]
    .filter(Boolean)
    .join('\n');

  return ksuExec(cmd);
}
