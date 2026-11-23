import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../lib/cn.ts';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 font-medium transition-all duration-150 select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:pointer-events-none disabled:opacity-45 cursor-pointer active:scale-[0.98]',
  {
    variants: {
      variant: {
        primary:
          'bg-[var(--accent)] text-[var(--accent-fg)] shadow-sm hover:brightness-110 rounded-[var(--radius-control)]',
        secondary:
          'bg-[var(--surface-elevated)] text-[var(--text-primary)] border border-[var(--border-hairline)] hover:brightness-105 rounded-[var(--radius-control)]',
        ghost:
          'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-primary)] rounded-[var(--radius-control)]',
        danger:
          'bg-[color-mix(in_oklab,var(--danger)_16%,transparent)] text-[var(--danger)] border border-[color-mix(in_oklab,var(--danger)_30%,transparent)] hover:bg-[color-mix(in_oklab,var(--danger)_24%,transparent)] rounded-[var(--radius-control)]',
        pill: 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[color-mix(in_oklab,var(--accent)_28%,transparent)] hover:brightness-110 rounded-[var(--radius-pill)]',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-9 px-4 text-sm',
        'icon-sm': 'size-7 p-0 text-xs',
        icon: 'size-8 p-0 text-sm',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'md',
    },
  },
);

/**
 * Props for `<Button>`.
 */
export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

/**
 * Semantic action button supporting primary, secondary, ghost, danger, and pill variants.
 */
export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      data-pochita="button"
      data-variant={variant ?? 'secondary'}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
