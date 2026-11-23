import type { ReactNode } from 'react';
import { cn } from '../lib/cn.ts';

/**
 * Props for `<EmptyState>`.
 */
export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  'data-testid'?: string;
}

/**
 * Clean centered placeholder for disconnected backends, empty device lists, or zero-match filters.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  'data-testid': dataTestId,
}: EmptyStateProps) {
  return (
    <div
      data-pochita="empty-state"
      data-testid={dataTestId}
      className={cn(
        'pochita-card flex flex-col items-center justify-center gap-2.5 px-5 py-7 text-center',
        className,
      )}
    >
      {icon ? (
        <div
          aria-hidden="true"
          className="inline-flex size-10 items-center justify-center rounded-[var(--radius-control)] bg-[var(--surface-elevated)] text-[var(--text-secondary)]"
        >
          {icon}
        </div>
      ) : null}

      <div className="flex max-w-xs flex-col gap-1">
        <p className="m-0 text-sm font-semibold text-[var(--text-primary)]">{title}</p>
        {description ? (
          <p className="m-0 text-xs leading-relaxed text-[var(--text-secondary)]">{description}</p>
        ) : null}
      </div>

      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
