import {
  clearPanelStyles,
  reconcilePanelsToActive,
  type TabIndicatorController,
} from './tabsContext.ts';

const PENDING_COMMIT_FALLBACK_MS = 120;

interface PendingCommitCleanup {
  outgoing: HTMLElement | null;
  incoming: HTMLElement | null;
  targetTab: string;
  fallbackTimer: ReturnType<typeof setTimeout> | null;
}

export interface InFlightPanels {
  activePanel: HTMLElement | null;
  peekPanel: HTMLElement | null;
}

export interface TabPagerCommitStateDeps {
  getRoot: () => HTMLDivElement | null;
  getIndicator: () => TabIndicatorController | null;
  getCurrentValue: () => string | undefined;
  getInFlightPanels: () => InFlightPanels | null;
}

/**
 * Tracks logical swipe commits across asynchronous React renders so consecutive or reversed
 * swipes never read a stale active tab, never let a delayed render hide an in-flight panel,
 * and cleanly cancel in-flight animations on external (click/keyboard) tab changes.
 */
export function createTabPagerCommitState(deps: TabPagerCommitStateDeps) {
  let pendingCommit: PendingCommitCleanup | null = null;
  let logicalActiveTab: string | null = null;
  let idleReconcileTimer: ReturnType<typeof setTimeout> | null = null;
  const pendingReactCommits: string[] = [];

  const clearIdleReconcile = () => {
    if (idleReconcileTimer !== null) {
      clearTimeout(idleReconcileTimer);
      idleReconcileTimer = null;
    }
  };

  const clearPendingTimer = () => {
    if (pendingCommit?.fallbackTimer !== null && pendingCommit?.fallbackTimer !== undefined) {
      clearTimeout(pendingCommit.fallbackTimer);
      pendingCommit.fallbackTimer = null;
    }
  };

  const reconcileToReact = () => {
    clearIdleReconcile();
    if (deps.getInFlightPanels()) return;
    const pending = pendingCommit;
    clearPendingTimer();
    pendingCommit = null;
    const currentVal = deps.getCurrentValue();
    const rejected =
      logicalActiveTab !== null && currentVal !== undefined && logicalActiveTab !== currentVal;
    logicalActiveTab = null;
    pendingReactCommits.length = 0;
    if (pending) {
      clearPanelStyles(pending.outgoing);
      clearPanelStyles(pending.incoming);
    }
    reconcilePanelsToActive(deps.getRoot(), currentVal);
    if (rejected) {
      deps.getIndicator()?.clearDragging();
      deps.getIndicator()?.syncActive?.(true);
    }
  };

  const rearmIdleReconcile = () => {
    clearIdleReconcile();
    if (deps.getInFlightPanels() || pendingCommit) return;
    const currentVal = deps.getCurrentValue();
    if (logicalActiveTab !== null && logicalActiveTab !== currentVal) {
      idleReconcileTimer = setTimeout(reconcileToReact, PENDING_COMMIT_FALLBACK_MS);
    }
  };

  const promoteForNewGesture = () => {
    clearIdleReconcile();
    const pending = pendingCommit;
    if (!pending) return;
    clearPendingTimer();
    pendingCommit = null;
    clearPanelStyles(pending.outgoing);
    clearPanelStyles(pending.incoming);
    if (pending.outgoing && pending.outgoing !== pending.incoming) {
      pending.outgoing.hidden = true;
    }
    if (pending.incoming) {
      pending.incoming.hidden = false;
    }
  };

  const recordSwipeCommit = (
    outgoing: HTMLElement | null,
    incoming: HTMLElement | null,
    targetTab: string,
  ) => {
    logicalActiveTab = targetTab;
    pendingReactCommits.push(targetTab);
    clearPendingTimer();
    pendingCommit = {
      outgoing,
      incoming,
      targetTab,
      fallbackTimer: setTimeout(reconcileToReact, PENDING_COMMIT_FALLBACK_MS),
    };
  };

  const getEffectiveActive = (tabs: readonly string[], fallback: string): string => {
    if (logicalActiveTab !== null && tabs.includes(logicalActiveTab)) {
      return logicalActiveTab;
    }
    return fallback;
  };

  const flushPendingCommit = (
    committedValue: string | undefined,
    cancelInFlight: () => void,
  ): boolean => {
    if (committedValue === undefined) {
      const pending = pendingCommit;
      if (!pending) return false;
      clearPendingTimer();
      pendingCommit = null;
      const currentVal = deps.getCurrentValue();
      if (logicalActiveTab === currentVal) {
        logicalActiveTab = null;
        pendingReactCommits.length = 0;
        clearIdleReconcile();
      }
      clearPanelStyles(pending.outgoing);
      clearPanelStyles(pending.incoming);
      if (
        pending.outgoing &&
        pending.outgoing !== pending.incoming &&
        pending.targetTab === currentVal
      ) {
        pending.outgoing.hidden = true;
      }
      if (pending.incoming && pending.targetTab !== currentVal) {
        pending.incoming.hidden = true;
      }
      return true;
    }

    const commitIdx = pendingReactCommits.indexOf(committedValue);
    const isSwipeCommit = commitIdx !== -1 || pendingCommit?.targetTab === committedValue;
    if (!isSwipeCommit) {
      const hadInFlight = Boolean(
        deps.getInFlightPanels() || pendingCommit || logicalActiveTab !== null,
      );
      if (!hadInFlight) return false;
      cancelInFlight();
      clearPendingTimer();
      pendingCommit = null;
      logicalActiveTab = null;
      pendingReactCommits.length = 0;
      clearIdleReconcile();
      reconcilePanelsToActive(deps.getRoot(), committedValue);
      deps.getIndicator()?.clearDragging();
      deps.getIndicator()?.syncActive?.(true);
      return false;
    }

    if (commitIdx !== -1) pendingReactCommits.splice(0, commitIdx + 1);
    if (pendingReactCommits.length === 0 && logicalActiveTab === committedValue) {
      logicalActiveTab = null;
      clearIdleReconcile();
    }

    const inFlight = deps.getInFlightPanels();
    if (inFlight) {
      if (inFlight.activePanel) inFlight.activePanel.hidden = false;
      if (inFlight.peekPanel) inFlight.peekPanel.hidden = false;
      return true;
    }

    if (logicalActiveTab !== null && logicalActiveTab !== committedValue) {
      reconcilePanelsToActive(deps.getRoot(), logicalActiveTab);
      return true;
    }

    promoteForNewGesture();
    return true;
  };

  const destroy = () => {
    clearIdleReconcile();
    clearPendingTimer();
    if (pendingCommit) {
      clearPanelStyles(pendingCommit.outgoing);
      clearPanelStyles(pendingCommit.incoming);
      pendingCommit = null;
    }
    logicalActiveTab = null;
    pendingReactCommits.length = 0;
  };

  return {
    clearIdleReconcile,
    rearmIdleReconcile,
    promoteForNewGesture,
    recordSwipeCommit,
    getEffectiveActive,
    flushPendingCommit,
    destroy,
  };
}
