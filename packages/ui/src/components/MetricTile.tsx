import type { ReactNode } from 'react';
import { cn } from '../lib/cn.ts';
import { Badge, type BadgeProps } from './Badge.tsx';

export interface MetricTileProps {
  label: string;
  value: string | number;
  unit?: string;
  statusLabel?: string;
  statusVariant?: BadgeProps['variant'];
  hint?: string;
  icon?: ReactNode;
  className?: string;
}

export function MetricTile({
  label,
  value,
  unit,
  statusLabel,
  statusVariant = 'neutral',
  hint,
  icon,
  className,
}: MetricTileProps) {
  return (
    <div
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

      <div className="flex items-baseline gap-1">
        <span className="tabular-nums text-xl font-semibold tracking-tight text-[var(--text-primary)]">
          {value}
        </span>
        {unit ? (
          <span className="text-xs font-medium text-[var(--text-secondary)]">{unit}</span>
        ) : null}
      </div>

      {hint ? <p className="truncate text-[11px] text-[var(--text-secondary)]">{hint}</p> : null}
    </div>
  );
}
