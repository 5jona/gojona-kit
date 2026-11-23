import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn.ts';

/**
 * Semantic glass card surface bound to `--surface-card`, `--border-hairline`, and `--radius-card`.
 */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-pochita="card"
      className={cn(
        'pochita-card p-4 transition-[border-radius,border-color,background-color] duration-200',
        className,
      )}
      {...props}
    />
  );
}

/**
 * Header row container for `<Card>`, aligning title/description on the left and trailing actions on the right.
 */
export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-pochita="card-header"
      className={cn('mb-3 flex items-start justify-between gap-3', className)}
      {...props}
    />
  );
}

/**
 * Primary heading for a `<Card>` section.
 */
export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      data-pochita="card-title"
      className={cn('text-sm font-semibold tracking-tight text-[var(--text-primary)]', className)}
      {...props}
    />
  );
}

/**
 * Secondary subtitle or helper copy displayed beneath `<CardTitle>`.
 */
export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      data-pochita="card-description"
      className={cn('mt-0.5 text-xs leading-relaxed text-[var(--text-secondary)]', className)}
      {...props}
    />
  );
}

/**
 * Vertical flex content container for `<Card>` children.
 */
export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div data-pochita="card-content" className={cn('flex flex-col gap-3', className)} {...props} />
  );
}
