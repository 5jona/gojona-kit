import type { RefObject } from 'react';
import { createContext, useContext } from 'react';
import {
  computeDragOffset,
  interpolateIndicatorRect,
  resolveAdjacentTab,
  type TabIndicatorRect,
} from '../lib/tabSwipe.ts';

/** Imperative bridge allowing `useTabPager` to drive the sliding indicator pill in the same rAF. */
export interface TabIndicatorController {
  /** Measures and snapshots all trigger `(x, width)` rects once at gesture start. */
  snapshotRects: () => Map<string, TabIndicatorRect>;
  /** Applies an indicator rect imperatively with optional GPU transition. */
  applyRect: (rect: TabIndicatorRect, animate: boolean, durationMs?: number) => void;
  /** Releases drag-lock and clears `will-change` after drag/settle finishes. */
  clearDragging: () => void;
  /** Marks that the pill already settled at `tabValue` via swipe so value sync skips re-animating. */
  markSettledFor: (tabValue: string) => void;
}

/** Shared internal context between `<Tabs>`, `<TabsList>`, `<TabsTrigger>`, and `<TabsContent>`. */
export interface TabsInternalContextValue {
  activeValue: string | undefined;
  unmountInactive: boolean;
  indicatorControllerRef: RefObject<TabIndicatorController | null>;
  markPointerInteraction: () => void;
  clearPointerInteraction: () => void;
  isPointerFocusActive: () => boolean;
}

export const TabsInternalContext = createContext<TabsInternalContextValue | null>(null);

export function useTabsInternalContext(): TabsInternalContextValue | null {
  return useContext(TabsInternalContext);
}

const attr = (el: HTMLElement, k: string): string | null => el.getAttribute(k);

/** Discovers enabled triggers and mounted panels belonging directly to `root` once per gesture. */
export function discoverTabsAndPanels(root: HTMLDivElement | null): {
  tabs: string[];
  active: string;
  panels: Map<string, HTMLElement>;
} {
  const tabs: string[] = [];
  const panels = new Map<string, HTMLElement>();
  let active = '';
  if (!root) return { tabs, active, panels };
  for (const el of root.querySelectorAll<HTMLElement>('[role="tab"]')) {
    if (el.closest('[data-pochita="tabs"]') !== root) continue;
    const val = attr(el, 'data-tab-value') ?? attr(el, 'data-value') ?? attr(el, 'value');
    if (!val) continue;
    if (attr(el, 'data-state') === 'active' || attr(el, 'aria-selected') === 'true') active = val;
    const off = el.hasAttribute('disabled') || el.hasAttribute('data-disabled');
    if (!off && attr(el, 'aria-disabled') !== 'true' && !tabs.includes(val)) tabs.push(val);
  }
  for (const panel of root.querySelectorAll<HTMLElement>('[data-pochita="tabs-content"]')) {
    if (panel.closest('[data-pochita="tabs"]') !== root) continue;
    const val = attr(panel, 'data-tab-value');
    if (val) panels.set(val, panel);
  }
  return { tabs, active, panels };
}

/** Clears all inline drag/peek styles from a tab panel element. */
export function clearPanelStyles(panel: HTMLElement | null): void {
  if (!panel) return;
  panel.style.transition = '';
  panel.style.transform = '';
  panel.style.willChange = '';
  panel.style.position = '';
  panel.style.top = '';
  panel.style.left = '';
  panel.style.width = '';
  panel.style.marginTop = '';
  panel.style.pointerEvents = '';
  panel.style.zIndex = '';
  panel.removeAttribute('data-swipe-visible');
}

/** Restores an inactive neighbor panel to hidden idle state after drag or cancel. */
export function hidePeekPanel(panel: HTMLElement | null): void {
  if (!panel) return;
  clearPanelStyles(panel);
  panel.hidden = true;
}

/** Reveals an inactive neighbor panel positioned adjacent to the active panel during drag. */
export function revealPeekPanel(
  panel: HTMLElement,
  top: number,
  left: number,
  width: number,
): void {
  panel.hidden = false;
  panel.setAttribute('data-swipe-visible', 'true');
  panel.style.position = 'absolute';
  panel.style.top = `${top}px`;
  panel.style.left = `${left}px`;
  panel.style.width = `${width}px`;
  panel.style.marginTop = '0px';
  panel.style.pointerEvents = 'none';
  panel.style.zIndex = '1';
  panel.style.willChange = 'transform';
  panel.style.transition = 'none';
}

/** Easing curve shared by sliding indicator pill and pager settle transitions. */
export const PAGER_SETTLE_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

/** Runs a synchronized GPU transform settle on outgoing/incoming panels and indicator pill. */
export function runPanelSettle(params: {
  activePanel: HTMLElement | null;
  peekPanel: HTMLElement | null;
  durationMs: number;
  outgoingX: number;
  incomingX: number;
  pillTarget: TabIndicatorRect | undefined;
  indicator: TabIndicatorController | null;
  onDone: () => void;
}): { finalize: () => void } | null {
  const {
    activePanel,
    peekPanel,
    durationMs,
    outgoingX,
    incomingX,
    pillTarget,
    indicator,
    onDone,
  } = params;
  const watchEl = peekPanel ?? activePanel;
  if (durationMs <= 0 || !watchEl) {
    if (pillTarget) indicator?.applyRect(pillTarget, false, 0);
    onDone();
    return null;
  }
  const transition = `transform ${durationMs}ms ${PAGER_SETTLE_EASING}`;
  if (activePanel) {
    activePanel.style.transition = transition;
    activePanel.style.transform = `translate3d(${outgoingX.toFixed(2)}px, 0, 0)`;
  }
  if (peekPanel) {
    peekPanel.style.transition = transition;
    peekPanel.style.transform = `translate3d(${incomingX.toFixed(2)}px, 0, 0)`;
  }
  if (pillTarget) indicator?.applyRect(pillTarget, true, durationMs);

  let finished = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const onEnd = (ev: TransitionEvent) => {
    if (ev.target === watchEl && ev.propertyName === 'transform') finalize();
  };
  const finalize = () => {
    if (finished) return;
    finished = true;
    watchEl.removeEventListener?.('transitionend', onEnd);
    if (timer !== null) clearTimeout(timer);
    onDone();
  };
  watchEl.addEventListener?.('transitionend', onEnd);
  timer = setTimeout(finalize, durationMs + 60);
  return { finalize };
}

/** Mutable geometry/peek subset updated inside a single rAF per drag frame. */
export interface DragFrameState {
  tabs: readonly string[];
  active: string;
  panels: Map<string, HTMLElement>;
  activePanel: HTMLElement | null;
  viewportWidth: number;
  panelTop: number;
  panelLeft: number;
  triggerRects: Map<string, TabIndicatorRect>;
  pendingDx: number;
  lastOffset: number;
  peekTab: string | null;
  peekPanel: HTMLElement | null;
  peekSign: -1 | 1;
}

/** Coalesced single-frame DOM writer for active panel, neighbor peek panel, and sliding pill. */
export function applyDragFrameState(
  s: DragFrameState,
  indicator: TabIndicatorController | null,
): boolean {
  const dx = s.pendingDx;
  const step: -1 | 1 = dx < 0 ? 1 : -1;
  const neighborTab = resolveAdjacentTab(s.tabs, s.active, step);
  const offset = computeDragOffset(dx, neighborTab !== null, s.viewportWidth);
  s.lastOffset = offset;

  if (s.activePanel) {
    s.activePanel.style.transition = 'none';
    s.activePanel.style.willChange = 'transform';
    s.activePanel.style.transform = `translate3d(${offset.toFixed(2)}px, 0, 0)`;
  }

  let revealedNewPeek = false;
  const neighborPanel = neighborTab ? (s.panels.get(neighborTab) ?? null) : null;
  if (s.peekTab !== neighborTab) {
    hidePeekPanel(s.peekPanel);
    s.peekTab = neighborTab;
    s.peekPanel = neighborPanel;
    s.peekSign = step;
    if (neighborPanel) {
      revealPeekPanel(neighborPanel, s.panelTop, s.panelLeft, s.viewportWidth);
      revealedNewPeek = true;
    }
  }
  if (s.peekPanel) {
    const peekX = offset + s.peekSign * s.viewportWidth;
    s.peekPanel.style.transform = `translate3d(${peekX.toFixed(2)}px, 0, 0)`;
  }

  const currentRect = s.triggerRects.get(s.active);
  if (currentRect) {
    const targetRect = neighborTab ? (s.triggerRects.get(neighborTab) ?? null) : null;
    const progress = Math.max(-1, Math.min(1, -offset / Math.max(1, s.viewportWidth)));
    indicator?.applyRect(interpolateIndicatorRect(currentRect, targetRect, progress), false);
  }
  return revealedNewPeek;
}
