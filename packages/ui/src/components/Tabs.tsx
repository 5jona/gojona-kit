import * as TabsPrimitive from '@radix-ui/react-tabs';
import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '../lib/cn.ts';

export function Tabs(props: ComponentPropsWithoutRef<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-pochita="tabs" {...props} />;
}

export function TabsList({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-pochita="tabs-list"
      className={cn(
        'inline-flex w-full items-center gap-1 rounded-[var(--radius-control)] border border-[var(--border-hairline)] bg-[var(--surface-elevated)] p-1',
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-pochita="tabs-trigger"
      className={cn(
        'inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-[calc(var(--radius-control)-3px)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)] hover:text-[var(--text-primary)] data-[state=active]:bg-[var(--surface-card)] data-[state=active]:text-[var(--text-primary)] data-[state=active]:shadow-sm',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-pochita="tabs-content"
      className={cn('mt-3.5 focus-visible:outline-none', className)}
      {...props}
    />
  );
}
