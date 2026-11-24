import {
  blurStrandedTabTrigger,
  classifySwipeLock,
  computeReleaseVelocity,
  computeSettleDurationMs,
  hasScrollableHorizontalAncestor,
  isInEdgeGuardZone,
  isSwipeTargetOwnedByTabs,
  prefersReducedMotion,
  recordVelocitySample,
  resolveAdjacentTab,
  resolvePagerCommitStep,
  type SwipeLockState,
  shouldIgnoreSwipeStart,
  type VelocitySample,
} from '../lib/tabSwipe.ts';
import { createTabPagerCommitState } from './tabPagerCommitState.ts';
import {
  applyDragFrameState,
  clearPanelStyles,
  type DragFrameState,
  discoverTabsAndPanels,
  hidePeekPanel,
  type PanelSettleHandle,
  runPanelSettle,
  type TabIndicatorController,
} from './tabsContext.ts';

export type PagerInputSource = 'touch' | 'pointer';
const CANCEL_SETTLE_MS = 200;

interface SwipeSession extends DragFrameState {
  source: PagerInputSource;
  id: number;
  x0: number;
  y0: number;
  target: EventTarget | null;
  lock: SwipeLockState;
  appliedDx: number;
  samples: VelocitySample[];
  rafId: number | null;
}

export interface TabPagerEngineDeps {
  getRoot: () => HTMLDivElement | null;
  getSurface?: () => HTMLElement | null;
  getIndicator: () => TabIndicatorController | null;
  getCurrentValue: () => string | undefined;
  isSwipeable: () => boolean;
  getOrientation: () => 'horizontal' | 'vertical' | undefined;
  getTabOrder: () => readonly string[] | undefined;
  getEdgeGuardPx: () => number;
  onCommitTab: (nextTab: string) => void;
  onBeforeBegin?: () => void;
  now?: () => number;
  getWindowWidth?: () => number;
  getDocument?: () => { activeElement?: unknown } | null;
}

/**
 * Stateful DOM engine for the 1:1 dual-panel tab pager.
 * Coalesces active panel, neighbor peek, and indicator pill writes into a single rAF per frame,
 * and tracks logical commits across asynchronous React renders so rapid/reversed swipes never drift.
 */
export function createTabPagerEngine(deps: TabPagerEngineDeps) {
  const now =
    deps.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  const getViewportWindowWidth =
    deps.getWindowWidth ?? (() => (typeof window !== 'undefined' ? window.innerWidth : 0));

  let session: SwipeSession | null = null;
  let activeSettle: PanelSettleHandle | null = null;

  const commits = createTabPagerCommitState({
    getRoot: deps.getRoot,
    getIndicator: deps.getIndicator,
    getCurrentValue: deps.getCurrentValue,
    getInFlightPanels: () => session ?? activeSettle,
  });

  const applyDragFrame = (s: SwipeSession): boolean => {
    s.rafId = null;
    s.appliedDx = s.pendingDx;
    return applyDragFrameState(s, deps.getIndicator());
  };

  const abort = () => {
    const s = session;
    if (!s) return;
    if (s.rafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(s.rafId);
    }
    session = null;
    clearPanelStyles(s.activePanel);
    hidePeekPanel(s.peekPanel);
    deps.getIndicator()?.clearDragging();
    commits.rearmIdleReconcile();
  };

  const cancelInFlight = () => {
    abort();
    if (!activeSettle) return;
    activeSettle.cancel();
    activeSettle = null;
  };
  const flushPendingCommit = (committedValue?: string): boolean =>
    commits.flushPendingCommit(committedValue, cancelInFlight);

  const begin = (
    source: PagerInputSource,
    id: number,
    x0: number,
    y0: number,
    target: EventTarget,
  ) => {
    if (!deps.isSwipeable() || deps.getOrientation() === 'vertical') return;
    if (source === 'pointer' && session?.source === 'touch') return;
    const root = deps.getRoot();
    const surface = deps.getSurface?.() ?? root;
    const vw = getViewportWindowWidth();
    if (
      isInEdgeGuardZone(x0, vw, deps.getEdgeGuardPx()) ||
      !isSwipeTargetOwnedByTabs(target, root, surface) ||
      shouldIgnoreSwipeStart(target, surface)
    ) {
      return;
    }
    if (session) abort();
    commits.clearIdleReconcile();
    activeSettle?.finalize();
    commits.promoteForNewGesture();
    deps.onBeforeBegin?.();

    const discovered = discoverTabsAndPanels(root);
    const explicitOrder = deps.getTabOrder();
    const tabs = explicitOrder && explicitOrder.length > 0 ? explicitOrder : discovered.tabs;
    if (tabs.length < 2) {
      commits.rearmIdleReconcile();
      return;
    }
    const fallbackActive = deps.getCurrentValue() || discovered.active || tabs[0] || '';
    const active = commits.getEffectiveActive(tabs, fallbackActive);
    const activePanel = discovered.panels.get(active) ?? null;
    const viewportWidth = activePanel?.offsetWidth || root?.clientWidth || vw || 360;

    session = {
      source,
      id,
      x0,
      y0,
      target,
      lock: 'pending',
      appliedDx: 0,
      tabs,
      active,
      panels: discovered.panels,
      activePanel,
      viewportWidth,
      panelTop: activePanel?.offsetTop ?? 0,
      panelLeft: activePanel?.offsetLeft ?? 0,
      triggerRects: deps.getIndicator()?.snapshotRects() ?? new Map(),
      samples: [{ x: x0, t: now() }],
      pendingDx: 0,
      lastOffset: 0,
      rafId: null,
      peekTab: null,
      peekPanel: null,
      peekSign: 1,
    };
  };

  const move = (source: PagerInputSource, id: number, x: number, y: number): boolean => {
    const s = session;
    if (!s || s.source !== source || s.id !== id || s.lock === 'vertical') return false;
    recordVelocitySample(s.samples, x, now());
    const dx = x - s.x0;
    const dy = y - s.y0;
    if (s.lock === 'pending') {
      const nextLock = classifySwipeLock(dx, dy, { edgeGuardPx: deps.getEdgeGuardPx() });
      if (nextLock === 'pending') return false;
      const surface = deps.getSurface?.() ?? deps.getRoot();
      if (nextLock === 'vertical' || hasScrollableHorizontalAncestor(s.target, surface, dx)) {
        s.lock = 'vertical';
        deps.getIndicator()?.clearDragging();
        return false;
      }
      s.lock = 'horizontal';
    }
    s.pendingDx = dx;
    if (s.rafId === null) {
      if (typeof requestAnimationFrame === 'function') {
        s.rafId = requestAnimationFrame(() => {
          if (session === s) applyDragFrame(s);
        });
      } else {
        applyDragFrame(s);
      }
    }
    return true;
  };

  const end = (source: PagerInputSource, id: number, x: number, cancel: boolean, y?: number) => {
    const s = session;
    if (!s || s.source !== source || s.id !== id) return;
    const hadPendingRaf = s.rafId !== null;
    if (hadPendingRaf && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(s.rafId as number);
      s.rafId = null;
    }
    const tEnd = now();
    if (!cancel) recordVelocitySample(s.samples, x, tEnd);
    session = null;
    if (s.lock === 'pending' && !cancel && y !== undefined) {
      const dx = x - s.x0;
      const surface = deps.getSurface?.() ?? deps.getRoot();
      const finalLock = classifySwipeLock(dx, y - s.y0, { edgeGuardPx: deps.getEdgeGuardPx() });
      if (finalLock === 'horizontal' && !hasScrollableHorizontalAncestor(s.target, surface, dx)) {
        s.lock = 'horizontal';
      }
    }
    if (s.lock !== 'horizontal') {
      deps.getIndicator()?.clearDragging();
      commits.rearmIdleReconcile();
      return;
    }
    s.pendingDx = x - s.x0;
    const vRelease = cancel ? 0 : computeReleaseVelocity(s.samples, tEnd);
    const step = cancel ? 0 : resolvePagerCommitStep(s.pendingDx, vRelease, s.viewportWidth);
    const nextTab = step !== 0 ? resolveAdjacentTab(s.tabs, s.active, step) : null;
    const needsSync =
      hadPendingRaf || s.appliedDx !== s.pendingDx || (nextTab !== null && s.peekTab !== nextTab);
    if (needsSync) applyDragFrame(s);

    if (nextTab && nextTab !== s.active) {
      const remaining = Math.max(0, s.viewportWidth - Math.abs(s.lastOffset));
      const durationMs =
        remaining < 0.5 || prefersReducedMotion()
          ? 0
          : computeSettleDurationMs(remaining, vRelease);
      if (needsSync && durationMs > 0) void (s.peekPanel ?? s.activePanel)?.offsetWidth;
      activeSettle = runPanelSettle({
        activePanel: s.activePanel,
        peekPanel: s.peekPanel,
        durationMs,
        outgoingX: -step * s.viewportWidth,
        incomingX: 0,
        pillTarget: s.triggerRects.get(nextTab),
        indicator: deps.getIndicator(),
        onDone: () => {
          activeSettle = null;
          blurStrandedTabTrigger(deps.getRoot(), deps.getDocument?.());
          deps.getIndicator()?.markSettledFor(nextTab);
          commits.recordSwipeCommit(s.activePanel, s.peekPanel, nextTab);
          deps.onCommitTab(nextTab);
        },
      });
      return;
    }

    const cancelMs = Math.abs(s.lastOffset) < 0.5 || prefersReducedMotion() ? 0 : CANCEL_SETTLE_MS;
    if (needsSync && cancelMs > 0) void (s.peekPanel ?? s.activePanel)?.offsetWidth;
    activeSettle = runPanelSettle({
      activePanel: s.activePanel,
      peekPanel: s.peekPanel,
      durationMs: cancelMs,
      outgoingX: 0,
      incomingX: s.peekSign * s.viewportWidth,
      pillTarget: s.triggerRects.get(s.active),
      indicator: deps.getIndicator(),
      onDone: () => {
        activeSettle = null;
        clearPanelStyles(s.activePanel);
        hidePeekPanel(s.peekPanel);
        deps.getIndicator()?.clearDragging();
        commits.rearmIdleReconcile();
      },
    });
  };

  return {
    begin,
    move,
    end,
    abort,
    flushPendingCommit,
    getActiveInput: () => (session ? { source: session.source, id: session.id } : null),
    isHorizontallyLocked: () => session?.lock === 'horizontal',
    destroy() {
      abort();
      if (activeSettle) {
        activeSettle.cancel();
        clearPanelStyles(activeSettle.activePanel);
        hidePeekPanel(activeSettle.peekPanel);
        activeSettle = null;
      }
      commits.destroy();
    },
  };
}
