import type { ReactNode } from 'react';
import { cn } from '../lib/cn.ts';
import { Badge, type BadgeProps } from './Badge.tsx';

/**
 * Props for `<MetricTile>`.
 */
export interface MetricTileProps {
  label: string;
  value: string | number;
  unit?: string;
  statusLabel?: string;
  statusVariant?: BadgeProps['variant'];
  hint?: string;
  icon?: ReactNode;
  className?: string;
  'data-testid'?: string;
}

/**
 * Compact numeric KPI tile with tabular numerals, optional unit suffix, and status badge.
 */
export function MetricTile({
  label,
  value,
  unit,
  statusLabel,
  statusVariant = 'neutral',
  hint,
  icon,
  className,
  'data-testid': dataTestId,
}: MetricTileProps) {
  return (
    <div
      data-pochita="metric-tile"
      data-metric-label={label}
      data-metric-value={String(value)}
      data-testid={dataTestId}
      className={cn(
        'pochita-card flex min-w-0 flex-col justify-between gap-2 overflow-hidden p-3 transition-colors duration-150',
        className,
      )}
    >
      <div className="flex min-w-0 items-center justify-between gap-1">
        <span className="flex min-w-0 flex-1 items-center gap-1 text-xs font-medium text-[var(--text-secondary)]">
          {icon ? <span className="shrink-0">{icon}</span> : null}
          <span className="truncate">{label}</span>
        </span>
        {statusLabel ? (
          <Badge variant={statusVariant} className="shrink-0">
            {statusLabel}
          </Badge>
        ) : null}
      </div>

      <div className="flex min-w-0 items-baseline gap-1">
        <span className="min-w-0 truncate tabular-nums text-xl font-semibold tracking-tight text-[var(--text-primary)]">
          {value}
        </span>
        {unit ? (
          <span className="shrink-0 text-xs font-medium text-[var(--text-secondary)]">{unit}</span>
        ) : null}
      </div>

      {hint ? <p className="truncate text-[11px] text-[var(--text-secondary)]">{hint}</p> : null}
    </div>
  );
}
