import type { ReactNode } from 'react';
import { cn } from '../lib/cn.ts';

/**
 * Props for `<SettingRow>`.
 */
export interface SettingRowProps {
  title: string;
  description?: string;
  control: ReactNode;
  variant?: 'elevated' | 'plain';
  className?: string;
  'data-testid'?: string;
}

/**
 * Two-column setting row pairing a title and optional description with a trailing interactive control.
 */
export function SettingRow({
  title,
  description,
  control,
  variant = 'elevated',
  className,
  'data-testid': dataTestId,
}: SettingRowProps) {
  return (
    <div
      data-pochita="setting-row"
      data-variant={variant}
      data-testid={dataTestId}
      className={cn(
        'flex items-center justify-between gap-3',
        variant === 'elevated'
          ? 'pochita-setting-row rounded-[var(--radius-control)] border border-[var(--border-hairline)] bg-[var(--surface-elevated)] px-3.5 py-2.5'
          : 'py-1',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            'font-medium text-[var(--text-primary)]',
            variant === 'plain' ? 'text-[13px]' : 'text-sm',
          )}
        >
          {title}
        </div>
        {description ? (
          <p className="mt-0.5 text-xs leading-snug text-[var(--text-secondary)]">{description}</p>
        ) : null}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}
