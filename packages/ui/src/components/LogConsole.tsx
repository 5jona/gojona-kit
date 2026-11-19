import { Copy, Trash2 } from 'lucide-react';
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
  title?: string;
  maxHeightClassName?: string;
  className?: string;
}

const LEVEL_STYLES: Record<NonNullable<LogEntry['level']>, string> = {
  info: 'text-[var(--text-primary)]',
  warn: 'text-[var(--warning)]',
  error: 'text-[var(--danger)]',
};

export function LogConsole({
  entries,
  onClear,
  title = '诊断日志',
  maxHeightClassName = 'max-h-52',
  className,
}: LogConsoleProps) {
  const handleCopy = () => {
    const text = entries.map((e) => `[${e.timestamp}] ${e.message}`).join('\n');
    void navigator.clipboard?.writeText(text);
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
            <Copy className="size-3.5" />
            复制
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
