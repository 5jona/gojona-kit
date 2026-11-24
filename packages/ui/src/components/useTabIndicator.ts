import type { RefObject } from 'react';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { prefersReducedMotion, type TabIndicatorRect } from '../lib/tabSwipe.ts';
import type { TabIndicatorController } from './tabsContext.ts';
import { useTabsInternalContext } from './tabsContext.ts';

const PILL_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
const PILL_GLIDE_MS = 220;
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

function readTriggerValue(el: HTMLElement): string | null {
  return (
    el.getAttribute('data-tab-value') ?? el.getAttribute('data-value') ?? el.getAttribute('value')
  );
}

function listOwnTriggers(list: HTMLElement): HTMLElement[] {
  const result: HTMLElement[] = [];
  for (const el of list.querySelectorAll<HTMLElement>('[role="tab"]')) {
    if (el.closest('[role="tablist"]') === list) {
      result.push(el);
    }
  }
  return result;
}

function findActiveTrigger(list: HTMLElement, activeValue: string | undefined): HTMLElement | null {
  let fallback: HTMLElement | null = null;
  for (const el of listOwnTriggers(list)) {
    const val = readTriggerValue(el);
    if (activeValue !== undefined && val === activeValue) return el;
    if (el.getAttribute('data-state') === 'active' || el.getAttribute('aria-selected') === 'true') {
      fallback = el;
    }
  }
  return fallback;
}

function applyIndicatorStyle(
  el: HTMLElement,
  rect: TabIndicatorRect,
  animate: boolean,
  durationMs: number = PILL_GLIDE_MS,
): void {
  if (rect.width <= 0) {
    el.style.opacity = '0';
    return;
  }
  const useTransition = animate && durationMs > 0 && !prefersReducedMotion();
  el.style.transition = useTransition
    ? `transform ${durationMs}ms ${PILL_EASING}, width ${durationMs}ms ${PILL_EASING}`
    : 'none';
  el.style.transform = `translate3d(${rect.x.toFixed(2)}px, 0, 0)`;
  el.style.width = `${rect.width.toFixed(2)}px`;
  el.style.opacity = '1';
}

function scrollTriggerIfOverflowing(list: HTMLElement, trigger: HTMLElement): void {
  if (list.scrollWidth <= list.clientWidth + 1) return;
  if (typeof trigger.scrollIntoView !== 'function') return;
  try {
    trigger.scrollIntoView({
      inline: 'nearest',
      block: 'nearest',
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  } catch {
    // Some minimal DOM environments throw on ScrollIntoViewOptions objects.
  }
}

export interface UseTabIndicatorResult {
  listRef: RefObject<HTMLDivElement | null>;
  indicatorRef: RefObject<HTMLSpanElement | null>;
}

/**
 * Measures and animates the GPU-composited sliding active indicator pill inside `<TabsList>`,
 * and exposes an imperative controller so `useTabPager` can interpolate the pill in the same rAF.
 */
export function useTabIndicator(): UseTabIndicatorResult {
  const ctx = useTabsInternalContext();
  const activeValue = ctx?.activeValue;
  const listRef = useRef<HTMLDivElement | null>(null);
  const indicatorRef = useRef<HTMLSpanElement | null>(null);
  const initializedRef = useRef(false);
  const draggingRef = useRef(false);
  const settledForTabRef = useRef<string | null>(null);
  const activeValueRef = useRef<string | undefined>(activeValue);
  activeValueRef.current = activeValue;

  const indicatorControllerRef = ctx?.indicatorControllerRef;

  // Register imperative controller for finger-coupled pill tracking during swipe drags.
  useEffect(() => {
    if (!indicatorControllerRef) return;
    const controller: TabIndicatorController = {
      snapshotRects() {
        const rects = new Map<string, TabIndicatorRect>();
        const list = listRef.current;
        if (!list) return rects;
        draggingRef.current = true;
        for (const el of listOwnTriggers(list)) {
          const val = readTriggerValue(el);
          if (val) rects.set(val, { x: el.offsetLeft, width: el.offsetWidth });
        }
        return rects;
      },
      applyRect(rect, animate, durationMs) {
        const indicator = indicatorRef.current;
        if (!indicator) return;
        indicator.style.willChange = animate ? '' : 'transform, width';
        applyIndicatorStyle(indicator, rect, animate, durationMs ?? PILL_GLIDE_MS);
      },
      clearDragging() {
        draggingRef.current = false;
        const indicator = indicatorRef.current;
        if (indicator) indicator.style.willChange = '';
      },
      markSettledFor(tabValue) {
        draggingRef.current = false;
        settledForTabRef.current = tabValue;
        const indicator = indicatorRef.current;
        if (indicator) indicator.style.willChange = '';
      },
      syncActive(animate = true) {
        const list = listRef.current;
        const indicator = indicatorRef.current;
        if (!list || !indicator) return;
        settledForTabRef.current = null;
        const activeTrigger = findActiveTrigger(list, activeValueRef.current);
        if (!activeTrigger) {
          indicator.style.opacity = '0';
          return;
        }
        const rect: TabIndicatorRect = {
          x: activeTrigger.offsetLeft,
          width: activeTrigger.offsetWidth,
        };
        applyIndicatorStyle(indicator, rect, animate && initializedRef.current, PILL_GLIDE_MS);
        if (rect.width > 0) initializedRef.current = true;
      },
    };
    indicatorControllerRef.current = controller;
    return () => {
      if (indicatorControllerRef.current === controller) {
        indicatorControllerRef.current = null;
      }
    };
  }, [indicatorControllerRef]);

  // Synchronize pill geometry whenever activeValue changes.
  useIsomorphicLayoutEffect(() => {
    if (draggingRef.current) return;
    const list = listRef.current;
    const indicator = indicatorRef.current;
    if (!list || !indicator) return;
    const activeTrigger = findActiveTrigger(list, activeValue);
    if (!activeTrigger) {
      indicator.style.opacity = '0';
      return;
    }
    const rect: TabIndicatorRect = {
      x: activeTrigger.offsetLeft,
      width: activeTrigger.offsetWidth,
    };
    const alreadySettled =
      settledForTabRef.current !== null && settledForTabRef.current === activeValue;
    settledForTabRef.current = null;

    const shouldAnimate = initializedRef.current && !alreadySettled;
    applyIndicatorStyle(indicator, rect, shouldAnimate, PILL_GLIDE_MS);
    if (initializedRef.current) {
      scrollTriggerIfOverflowing(list, activeTrigger);
    }
    if (rect.width > 0) {
      initializedRef.current = true;
    }
  }, [activeValue]);

  // Keep pill aligned across container / trigger resizes via ResizeObserver.
  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === 'undefined') return;
    const syncNow = () => {
      if (draggingRef.current) return;
      const indicator = indicatorRef.current;
      if (!indicator) return;
      const activeTrigger = findActiveTrigger(list, activeValueRef.current);
      if (!activeTrigger) return;
      const rect: TabIndicatorRect = {
        x: activeTrigger.offsetLeft,
        width: activeTrigger.offsetWidth,
      };
      applyIndicatorStyle(indicator, rect, false);
      if (rect.width > 0) initializedRef.current = true;
    };
    const observer = new ResizeObserver(syncNow);
    observer.observe(list);
    for (const trigger of listOwnTriggers(list)) {
      observer.observe(trigger);
    }
    return () => observer.disconnect();
  }, []);

  return { listRef, indicatorRef };
}
