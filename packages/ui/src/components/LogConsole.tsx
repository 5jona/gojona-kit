import { AlertCircle, ArrowDown, Check, Copy, Download, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { copyTextWithFallback } from '../lib/clipboard.ts';
import { cn } from '../lib/cn.ts';
import { Button } from './Button.tsx';
import { Input } from './Input.tsx';
import {
  filterLogEntries,
  formatLogEntriesText,
  LOG_FILTER_OPTIONS,
  type LogEntry,
  type LogFilterLevel,
  type LogLevel,
} from './logConsoleUtils.ts';

export {
  filterLogEntries,
  formatLogEntriesText,
  type LogEntry,
  type LogFilterLevel,
  type LogLevel,
};

export interface LogConsoleProps {
  entries: readonly LogEntry[];
  onClear?: () => void;
  /**
   * Optional custom copy handler (for example SideVeil's `useClipboard().writeText`).
   * Overrides the default `navigator.clipboard` fallback so unfocused embedded WebViews can copy reliably.
   */
  onCopy?: (text: string) => boolean | Promise<boolean>;
  /** Optional export callback invoked with the currently displayed log text. */
  onExport?: (text: string) => void;
  title?: string;
  searchable?: boolean;
  filterable?: boolean;
  autoScroll?: boolean;
  emptyMessage?: string;
  maxHeightClassName?: string;
  className?: string;
  'data-testid'?: string;
}

const LEVEL_STYLES: Record<LogLevel, string> = {
  info: 'text-[var(--text-primary)]',
  warn: 'text-[var(--warning)]',
  error: 'text-[var(--danger)]',
  debug: 'text-[var(--text-secondary)]',
};

const BOTTOM_THRESHOLD_PX = 24;

export function LogConsole({
  entries,
  onClear,
  onCopy,
  onExport,
  title = '诊断日志',
  searchable = false,
  filterable = false,
  autoScroll = true,
  emptyMessage = '暂无日志记录',
  maxHeightClassName = 'max-h-52',
  className,
  'data-testid': dataTestId,
}: LogConsoleProps) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<LogFilterLevel>('all');
  const [scrollPaused, setScrollPaused] = useState(false);

  const timerRef = useRef<number | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const filteredEntries = useMemo(
    () =>
      filterLogEntries(entries, {
        level: filterable ? levelFilter : 'all',
        query: searchable ? searchQuery : '',
      }),
    [entries, filterable, levelFilter, searchable, searchQuery],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!autoScroll || scrollPaused || filteredEntries.length === 0) return;
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [autoScroll, scrollPaused, filteredEntries.length]);

  const handleScroll = () => {
    if (!autoScroll) return;
    const el = scrollerRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setScrollPaused(distanceToBottom > BOTTOM_THRESHOLD_PX);
  };

  const scrollToBottom = () => {
    const el = scrollerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
    setScrollPaused(false);
  };

  const handleCopy = async () => {
    const text = formatLogEntriesText(filteredEntries);
    const success = await copyTextWithFallback(text, onCopy);
    setCopyStatus(success ? 'copied' : 'error');
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      setCopyStatus('idle');
    }, 1500);
  };

  const handleExport = () => {
    if (!onExport) return;
    onExport(formatLogEntriesText(filteredEntries));
  };

  const hasToolbar = searchable || filterable;
  const isFiltered =
    (filterable && levelFilter !== 'all') || (searchable && searchQuery.trim().length > 0);
  const countLabel = isFiltered
    ? `${filteredEntries.length}/${entries.length}`
    : `${entries.length}`;

  return (
    <div
      data-pochita="log-console"
      data-testid={dataTestId}
      className={cn('pochita-card overflow-hidden p-0', className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-hairline)] px-3.5 py-2">
        <span className="text-xs font-medium text-[var(--text-secondary)]">
          {title} ({countLabel})
        </span>
        <div className="flex items-center gap-1">
          {autoScroll && scrollPaused ? (
            <Button size="sm" variant="secondary" onClick={scrollToBottom} aria-label="回到底部">
              <ArrowDown className="size-3.5" />
              回到底部
            </Button>
          ) : null}
          {onExport ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleExport}
              disabled={filteredEntries.length === 0}
              aria-label="导出日志"
            >
              <Download className="size-3.5" />
              导出
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCopy}
            disabled={filteredEntries.length === 0}
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

      {hasToolbar ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border-hairline)] bg-[var(--surface-elevated)] px-3.5 py-2">
          {filterable ? (
            <fieldset
              className="m-0 flex flex-wrap items-center gap-1 border-0 p-0"
              aria-label="日志级别筛选"
            >
              {LOG_FILTER_OPTIONS.map((opt) => {
                const active = levelFilter === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setLevelFilter(opt.value)}
                    className={cn(
                      'rounded-[var(--radius-pill)] border px-2 py-0.5 text-[11px] font-medium transition-colors',
                      active
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                        : 'border-[var(--border-hairline)] bg-[var(--surface-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </fieldset>
          ) : null}
          {searchable ? (
            <div className="relative min-w-[140px] flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-[var(--text-secondary)]"
                aria-hidden="true"
              />
              <Input
                size="sm"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索日志内容或来源..."
                aria-label="搜索日志"
                className="h-7 pl-7 text-[11px]"
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className={cn(
          'pochita-scroller space-y-1 px-3.5 py-2.5 font-mono text-[11px] leading-relaxed',
          maxHeightClassName,
        )}
      >
        {filteredEntries.length === 0 ? (
          <div className="py-3 text-center text-[var(--text-secondary)]">
            {isFiltered ? '没有匹配的日志' : emptyMessage}
          </div>
        ) : (
          filteredEntries.map((entry) => {
            const level: LogLevel = entry.level ?? 'info';
            const meta = [entry.source, entry.tag].filter(Boolean).join('/');
            return (
              <div
                key={entry.id}
                data-log-level={level}
                className={cn('break-all', LEVEL_STYLES[level])}
              >
                <span className="mr-2 text-[var(--text-secondary)]">[{entry.timestamp}]</span>
                {meta ? <span className="mr-2 text-[var(--accent)]">[{meta}]</span> : null}
                <span>{entry.message}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
