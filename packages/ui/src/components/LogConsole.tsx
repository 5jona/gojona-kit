import { AlertCircle, Check, Copy, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '../lib/cn.ts';
import { Button } from './Button.tsx';

export interface LogEntry {
  id: string;
  timestamp: string;
  level?: 'info' | 'warn' | 'error';
  message: string;
}

export interface LogConsoleProps {
  entries: readonly LogEntry[];
  onClear?: () => void;
  /**
   * Optional custom copy handler (for example SideVeil's `useClipboard().writeText`).
   * Overrides the default `navigator.clipboard` fallback so unfocused embedded WebViews can copy reliably.
   */
  onCopy?: (text: string) => boolean | Promise<boolean>;
  title?: string;
  maxHeightClassName?: string;
  className?: string;
}

const LEVEL_STYLES: Record<NonNullable<LogEntry['level']>, string> = {
  info: 'text-[var(--text-primary)]',
  warn: 'text-[var(--warning)]',
  error: 'text-[var(--danger)]',
};

function copyTextFallback(text: string): boolean {
  if (typeof document === 'undefined') return false;
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  textArea.style.top = '-9999px';
  textArea.setAttribute('readonly', '');
  document.body.appendChild(textArea);
  try {
    textArea.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(textArea);
  }
}

export function LogConsole({
  entries,
  onClear,
  onCopy,
  title = '诊断日志',
  maxHeightClassName = 'max-h-52',
  className,
}: LogConsoleProps) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    const text = entries.map((e) => `[${e.timestamp}] ${e.message}`).join('\n');
    let success = false;
    if (onCopy) {
      try {
        success = Boolean(await onCopy(text));
      } catch {
        success = false;
      }
    } else {
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          await navigator.clipboard.writeText(text);
          success = true;
        } else {
          success = copyTextFallback(text);
        }
      } catch {
        success = copyTextFallback(text);
      }
    }

    setCopyStatus(success ? 'copied' : 'error');
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      setCopyStatus('idle');
    }, 1500);
  };

  return (
    <div className={cn('pochita-card overflow-hidden p-0', className)}>
      <div className="flex items-center justify-between border-b border-[var(--border-hairline)] px-3.5 py-2">
        <span className="text-xs font-medium text-[var(--text-secondary)]">
          {title} ({entries.length})
        </span>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCopy}
            disabled={entries.length === 0}
            aria-label="复制日志"
          >
            {copyStatus === 'copied' ? (
              <>
                <Check className="size-3.5 text-[var(--success)]" />
                已复制
              </>
            ) : copyStatus === 'error' ? (
              <>
                <AlertCircle className="size-3.5 text-[var(--danger)]" />
                复制失败
              </>
            ) : (
              <>
                <Copy className="size-3.5" />
                复制
              </>
            )}
          </Button>
          {onClear ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={onClear}
              disabled={entries.length === 0}
              aria-label="清空日志"
            >
              <Trash2 className="size-3.5" />
              清空
            </Button>
          ) : null}
        </div>
      </div>

      <div
        className={cn(
          'pochita-scroller space-y-1 px-3.5 py-2.5 font-mono text-[11px] leading-relaxed',
          maxHeightClassName,
        )}
      >
        {entries.length === 0 ? (
          <div className="py-3 text-center text-[var(--text-secondary)]">暂无日志记录</div>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className={cn('break-all', LEVEL_STYLES[entry.level ?? 'info'])}>
              <span className="mr-2 text-[var(--text-secondary)]">[{entry.timestamp}]</span>
              <span>{entry.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
