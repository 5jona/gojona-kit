import { AlertCircle, Check, ChevronDown, ChevronRight, Copy, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useCopyFeedback } from '../hooks/useCopyFeedback.ts';
import { cn } from '../lib/cn.ts';
import { Badge } from './Badge.tsx';
import { Button } from './Button.tsx';
import {
  type BridgeTraceEntry,
  type BridgeTraceFilter,
  DEFAULT_SLOW_THRESHOLD_MS,
  filterTraceEntries,
  formatTracePayload,
  formatTraceTimestamp,
  getTraceLabel,
  isTraceError,
  isTraceSlow,
  resolveTracePhaseBadge,
  summarizeTraceEntries,
  TRACE_FILTER_OPTIONS,
} from './bridgeTraceUtils.ts';
import { Input } from './Input.tsx';

export {
  type BridgeTraceEntry,
  type BridgeTraceFilter,
  DEFAULT_SLOW_THRESHOLD_MS,
  filterTraceEntries,
  isTraceError,
  isTraceSlow,
  summarizeTraceEntries,
};

/**
 * Props for `<BridgeTraceInspector>`.
 */
export interface BridgeTraceInspectorProps {
  entries: readonly BridgeTraceEntry[];
  title?: string;
  slowThresholdMs?: number;
  onClear?: () => void;
  onCopy?: (json: string) => boolean | Promise<boolean>;
  maxHeightClassName?: string;
  emptyMessage?: string;
  className?: string;
  'data-testid'?: string;
}

/**
 * Interactive inspector for `@gojona/bridge` RPC, event, and port lifecycle traces
 * with error/slow filtering, expandable payload previews, and JSON copy.
 */
export function BridgeTraceInspector({
  entries,
  title = '桥接追踪',
  slowThresholdMs = DEFAULT_SLOW_THRESHOLD_MS,
  onClear,
  onCopy,
  maxHeightClassName = 'max-h-72',
  emptyMessage = '暂无追踪记录',
  className,
  'data-testid': dataTestId,
}: BridgeTraceInspectorProps) {
  const [filter, setFilter] = useState<BridgeTraceFilter>('all');
  const [query, setQuery] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});
  const { copyStatus, copyText } = useCopyFeedback({ onCopy });

  const summary = useMemo(
    () => summarizeTraceEntries(entries, slowThresholdMs),
    [entries, slowThresholdMs],
  );

  const filtered = useMemo(
    () => filterTraceEntries(entries, { filter, query, slowThresholdMs }),
    [entries, filter, query, slowThresholdMs],
  );

  const handleCopyJson = async () => {
    const json = JSON.stringify(filtered, null, 2);
    await copyText(json);
  };

  const toggleRow = (rowKey: string) => {
    setExpandedKeys((prev) => ({ ...prev, [rowKey]: !prev[rowKey] }));
  };

  const isFiltered = filter !== 'all' || query.trim().length > 0;

  return (
    <div
      data-pochita="bridge-trace-inspector"
      data-testid={dataTestId}
      className={cn('pochita-card overflow-hidden p-0', className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-hairline)] px-3.5 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-[var(--text-primary)]">{title}</span>
          <Badge variant="neutral">共 {summary.total} 条</Badge>
          <Badge variant={summary.errors > 0 ? 'danger' : 'neutral'}>错误 {summary.errors}</Badge>
          <Badge variant={summary.slow > 0 ? 'warning' : 'neutral'}>慢请求 {summary.slow}</Badge>
        </div>

        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void handleCopyJson()}
            disabled={filtered.length === 0}
            aria-label="复制追踪 JSON"
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
                复制 JSON
              </>
            )}
          </Button>
          {onClear ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={onClear}
              disabled={entries.length === 0}
              aria-label="清空追踪记录"
            >
              <Trash2 className="size-3.5" />
              清空
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border-hairline)] bg-[var(--surface-elevated)] px-3.5 py-2">
        <fieldset
          className="m-0 flex flex-wrap items-center gap-1 border-0 p-0"
          aria-label="追踪类型筛选"
        >
          {TRACE_FILTER_OPTIONS.map((opt) => {
            const active = filter === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(opt.value)}
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

        <div className="relative min-w-[140px] flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-[var(--text-secondary)]"
            aria-hidden="true"
          />
          <Input
            size="sm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="筛选方法、事件或错误..."
            aria-label="筛选追踪记录"
            className="h-7 pl-7 text-[11px]"
          />
        </div>
      </div>

      <div
        className={cn(
          'pochita-scroller divide-y divide-[var(--border-hairline)]',
          maxHeightClassName,
        )}
      >
        {filtered.length === 0 ? (
          <div className="px-3.5 py-4 text-center text-xs text-[var(--text-secondary)]">
            {isFiltered ? '没有匹配的追踪记录' : emptyMessage}
          </div>
        ) : (
          filtered.map((entry, idx) => {
            const phaseOrKind = entry.phase ?? entry.kind ?? 'trace';
            const tsPart = entry.timestampMs ?? entry.timestamp ?? '';
            const rowKey = entry.id
              ? `${entry.id}_${phaseOrKind}_${tsPart}`
              : `trace_${phaseOrKind}_${tsPart || idx}`;
            const expanded = Boolean(expandedKeys[rowKey]);
            const badge = resolveTracePhaseBadge(entry);
            const slow = isTraceSlow(entry, slowThresholdMs);
            const errorMsg = entry.errorMessage ?? entry.error;
            const errorCode = entry.errorCode ?? entry.code;
            const payloadText = formatTracePayload(entry.payloadPreview);

            return (
              <div key={rowKey} data-trace-phase={entry.phase ?? entry.kind ?? 'unknown'}>
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => toggleRow(rowKey)}
                  className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-xs transition-colors hover:bg-[var(--surface-elevated)]"
                >
                  {expanded ? (
                    <ChevronDown className="size-3.5 shrink-0 text-[var(--text-secondary)]" />
                  ) : (
                    <ChevronRight className="size-3.5 shrink-0 text-[var(--text-secondary)]" />
                  )}
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-[var(--text-primary)]">
                    {getTraceLabel(entry)}
                  </span>
                  {entry.transport ? (
                    <span className="shrink-0 font-mono text-[10px] text-[var(--text-secondary)]">
                      {entry.transport}
                    </span>
                  ) : null}
                  {typeof entry.durationMs === 'number' ? (
                    <span
                      className={cn(
                        'shrink-0 font-mono text-[11px]',
                        slow
                          ? 'font-semibold text-[var(--warning)]'
                          : 'text-[var(--text-secondary)]',
                      )}
                    >
                      {entry.durationMs}ms
                    </span>
                  ) : null}
                </button>

                {expanded ? (
                  <div className="flex flex-col gap-1.5 border-t border-[var(--border-hairline)] bg-[var(--surface-elevated)] px-4 py-2.5 font-mono text-[11px] text-[var(--text-secondary)]">
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      <span>传输通道: {entry.transport ?? 'unknown'}</span>
                      <span>时间: {formatTraceTimestamp(entry)}</span>
                      {typeof entry.durationMs === 'number' ? (
                        <span>耗时: {entry.durationMs}ms</span>
                      ) : null}
                      {errorCode !== undefined ? (
                        <span className="text-[var(--danger)]">错误码: {String(errorCode)}</span>
                      ) : null}
                    </div>
                    {errorMsg ? (
                      <div className="break-all text-[var(--danger)]">错误信息: {errorMsg}</div>
                    ) : null}
                    {payloadText ? (
                      <div>
                        <div className="mb-1 text-[10px] text-[var(--text-secondary)]">
                          载荷摘要:
                        </div>
                        <pre className="max-h-40 overflow-auto rounded-[var(--radius-control)] border border-[var(--border-hairline)] bg-[var(--surface-card)] p-2 text-[10px] text-[var(--text-primary)]">
                          {payloadText}
                        </pre>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
