import * as TabsPrimitive from '@radix-ui/react-tabs';
import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '../lib/cn.ts';

/**
 * Accessible tabbed navigation root container built on `@radix-ui/react-tabs`.
 */
export function Tabs(props: ComponentPropsWithoutRef<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-pochita="tabs" {...props} />;
}

/**
 * Horizontally scrollable tab trigger bar with narrow-screen (`<=320px`) overflow protection.
 */
export function TabsList({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-pochita="tabs-list"
      className={cn(
        'inline-flex w-full min-w-0 max-w-full items-center gap-1 overflow-x-auto rounded-[var(--radius-control)] border border-[var(--border-hairline)] bg-[var(--surface-elevated)] p-1 [scrollbar-width:none]',
        className,
      )}
      {...props}
    />
  );
}

/**
 * Individual tab trigger button inside `<TabsList>`.
 */
export function TabsTrigger({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-pochita="tabs-trigger"
      className={cn(
        'inline-flex min-w-0 flex-1 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-[calc(var(--radius-control)-3px)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)] hover:text-[var(--text-primary)] data-[state=active]:bg-[var(--surface-card)] data-[state=active]:text-[var(--text-primary)] data-[state=active]:shadow-sm',
        className,
      )}
      {...props}
    />
  );
}

/**
 * Tab panel content container associated with a matching `<TabsTrigger>` value.
 */
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
