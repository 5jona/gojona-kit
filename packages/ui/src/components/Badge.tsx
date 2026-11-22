import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn.ts';

const badgeVariants = cva(
  'inline-flex shrink-0 whitespace-nowrap items-center gap-1.5 rounded-[var(--radius-pill)] px-2.5 py-0.5 text-[11px] font-medium leading-tight border',
  {
    variants: {
      variant: {
        neutral:
          'bg-[var(--surface-elevated)] text-[var(--text-secondary)] border-[var(--border-hairline)]',
        accent:
          'bg-[var(--accent-soft)] text-[var(--accent)] border-[color-mix(in_oklab,var(--accent)_30%,transparent)]',
        success:
          'bg-[color-mix(in_oklab,var(--success)_14%,transparent)] text-[var(--success)] border-[color-mix(in_oklab,var(--success)_30%,transparent)]',
        warning:
          'bg-[color-mix(in_oklab,var(--warning)_14%,transparent)] text-[var(--warning)] border-[color-mix(in_oklab,var(--warning)_30%,transparent)]',
        danger:
          'bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] text-[var(--danger)] border-[color-mix(in_oklab,var(--danger)_30%,transparent)]',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
  pulse?: boolean;
}

export function Badge({
  className,
  variant,
  dot = false,
  pulse = false,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      data-pochita="badge"
      data-variant={variant ?? 'neutral'}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    >
      {dot ? (
        <span
          className={cn('inline-block size-1.5 rounded-full bg-current', pulse && 'animate-pulse')}
          aria-hidden="true"
        />
      ) : null}
      {children}
    </span>
  );
}
