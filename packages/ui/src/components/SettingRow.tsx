import type { ReactNode } from 'react';
import { cn } from '../lib/cn.ts';

export interface SettingRowProps {
  title: string;
  description?: string;
  control: ReactNode;
  className?: string;
}

export function SettingRow({ title, description, control, className }: SettingRowProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--border-hairline)] bg-[var(--surface-elevated)] px-3.5 py-2.5',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-[var(--text-primary)]">{title}</div>
        {description ? (
          <p className="mt-0.5 text-xs leading-snug text-[var(--text-secondary)]">{description}</p>
        ) : null}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}
