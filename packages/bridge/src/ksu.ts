import type { ExecOptions, ExecResult } from './types.ts';

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
export function ksuExec(
  cmd: string,
  options: ExecOptions = {},
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const ksu = typeof window !== 'undefined' ? window.ksu : undefined;
    if (!ksu || typeof ksu.exec !== 'function') {
      resolve({ errno: -127, stdout: '', stderr: 'KernelSU host bridge unavailable' });
      return;
    }

    const timeoutMs = options.timeoutMs ?? 8000;
    const cbName = `__pochita_ksu_cb_${Date.now()}_${++ksuCallbackSeq}`;
    let settled = false;

    const cleanup = () => {
      if (typeof window !== 'undefined') {
        delete window[cbName];
      }
    };

    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ errno: -1, stdout: '', stderr: `Execution timeout (${timeoutMs}ms)` });
    }, timeoutMs);

    window[cbName] = (errno: unknown, stdout: unknown, stderr: unknown) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      cleanup();
      resolve({
        errno: Number(errno) || 0,
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
 * Reads a UTF-8 file using KernelSU exec; returns null when missing or unreadable.
 */
export async function ksuReadFile(path: string): Promise<string | null> {
  const res = await ksuExec(`cat ${shellQuote(path)} 2>/dev/null`);
  if (res.errno !== 0) {
    return null;
  }
  return res.stdout;
}

/**
 * Atomically writes a configuration file (`tmp` -> `chmod 0644` -> `mv -f`)
 * so inotify watchers never observe half-written content.
 */
export async function ksuWriteFileAtomic(
  path: string,
  content: string,
): Promise<ExecResult> {
  let delimiter = `__POCHITA_EOF_${Date.now()}_${Math.random().toString(36).slice(2, 8)}__`;
  while (content.includes(delimiter)) {
    delimiter += '_X';
  }
  const tmpPath = `${path}.tmp`;
  const normalized = content.endsWith('\n') ? content : `${content}\n`;
  const cmd = [
    `cat <<'${delimiter}' > ${shellQuote(tmpPath)}`,
    normalized.slice(0, -1),
    delimiter,
    `chmod 0644 ${shellQuote(tmpPath)} && mv -f ${shellQuote(tmpPath)} ${shellQuote(path)}`,
  ].join('\n');

  return ksuExec(cmd);
}
