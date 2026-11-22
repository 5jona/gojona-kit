import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn.ts';

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

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-pochita="card-header"
      className={cn('mb-3 flex items-start justify-between gap-3', className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      data-pochita="card-title"
      className={cn('text-sm font-semibold tracking-tight text-[var(--text-primary)]', className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      data-pochita="card-description"
      className={cn('mt-0.5 text-xs leading-relaxed text-[var(--text-secondary)]', className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div data-pochita="card-content" className={cn('space-y-3', className)} {...props} />;
}
