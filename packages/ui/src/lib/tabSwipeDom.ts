const IGNORED_TAGS = new Set(['input', 'textarea', 'select']);
const IGNORED_ROLES = new Set(['slider', 'switch', 'tablist']);
const IGNORE_SELECTOR =
  '[data-swipe-ignore], input, textarea, select, [role="slider"], [role="switch"], [role="tablist"], [contenteditable="true"]';
const NON_DELEGATED_REGION_SELECTOR =
  'header, footer, nav, [role="dialog"], [aria-modal="true"], [data-pochita="toast-viewport"]';

interface InspectableNode {
  tagName?: string;
  nodeName?: string;
  role?: string;
  contentEditable?: string;
  isContentEditable?: boolean;
  dataset?: Record<string, string | undefined>;
  style?: { overflowX?: string };
  scrollWidth?: number;
  clientWidth?: number;
  scrollLeft?: number;
  parentElement?: InspectableNode | null;
  parentNode?: InspectableNode | null;
  getAttribute?: (name: string) => string | null;
  hasAttribute?: (name: string) => boolean;
  closest?: (selector: string) => unknown;
  contains?: (node: unknown) => boolean;
  blur?: () => void;
}

function readAttr(node: InspectableNode, name: string): string | null {
  return typeof node.getAttribute === 'function' ? node.getAttribute(name) : null;
}

/** Blurs `document.activeElement` when it is a `[role="tab"]` belonging to `root`. */
export function blurStrandedTabTrigger(
  root: HTMLElement | null,
  doc?: { activeElement?: unknown } | null,
): boolean {
  const targetDoc = doc ?? (typeof document !== 'undefined' ? document : null);
  if (!root || !targetDoc) return false;
  const activeEl = targetDoc.activeElement as InspectableNode | null | undefined;
  if (!activeEl || typeof activeEl.blur !== 'function') return false;
  if (readAttr(activeEl, 'role') !== 'tab') return false;
  const rootNode = root as unknown as InspectableNode;
  const belongsToRoot =
    typeof activeEl.closest === 'function'
      ? activeEl.closest('[data-pochita="tabs"]') === root
      : typeof rootNode.contains === 'function' && rootNode.contains(activeEl);
  if (!belongsToRoot) return false;
  activeEl.blur();
  return true;
}

/** Returns `true` when the user has requested reduced motion via OS/browser media query. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function isIgnoredSwipeNode(node: InspectableNode): boolean {
  const rawTag = node.tagName ?? node.nodeName ?? '';
  if (typeof rawTag === 'string' && IGNORED_TAGS.has(rawTag.toLowerCase())) return true;
  const attr = readAttr(node, 'data-swipe-ignore');
  const hasIgnore =
    (typeof node.hasAttribute === 'function' && node.hasAttribute('data-swipe-ignore')) ||
    attr !== null ||
    node.dataset?.swipeIgnore !== undefined;
  if (hasIgnore && attr !== 'false' && node.dataset?.swipeIgnore !== 'false') return true;
  const role = (readAttr(node, 'role') ?? node.role ?? '').toLowerCase();
  if (IGNORED_ROLES.has(role)) return true;
  const editable = (readAttr(node, 'contenteditable') ?? node.contentEditable ?? '').toLowerCase();
  return editable === 'true' || node.isContentEditable === true;
}

/** Returns `true` when a gesture originates inside an interactive control or `[data-swipe-ignore]` subtree. */
export function shouldIgnoreSwipeStart(
  target: EventTarget | null,
  root: HTMLElement | null,
): boolean {
  let current = target as InspectableNode | null;
  const rootNode = root as unknown as InspectableNode | null;
  while (current && typeof current === 'object') {
    if (isIgnoredSwipeNode(current)) return true;
    if (current === rootNode) break;
    const next = current.parentElement ?? current.parentNode ?? null;
    if (!next && typeof current.closest === 'function') {
      return Boolean(current.closest(IGNORE_SELECTOR));
    }
    current = next;
  }
  return false;
}

/** Returns `true` when an ancestor between `target` and `root` can scroll horizontally in `dx`. */
export function hasScrollableHorizontalAncestor(
  target: EventTarget | null,
  root: HTMLElement | null,
  dx: number,
): boolean {
  if (!Number.isFinite(dx) || dx === 0) return false;
  let current = target as InspectableNode | null;
  const rootNode = root as unknown as InspectableNode | null;
  while (current && typeof current === 'object' && current !== rootNode) {
    const scrollWidth = current.scrollWidth ?? 0;
    const clientWidth = current.clientWidth ?? 0;
    if (scrollWidth > clientWidth + 2) {
      let overflowX = current.style?.overflowX ?? '';
      if (
        !overflowX &&
        typeof window !== 'undefined' &&
        typeof window.getComputedStyle === 'function'
      ) {
        try {
          overflowX = window.getComputedStyle(current as unknown as Element).overflowX;
        } catch {
          overflowX = '';
        }
      }
      if (overflowX !== 'hidden' && overflowX !== 'clip') {
        const scrollLeft = current.scrollLeft ?? 0;
        if (dx < 0 && scrollLeft < scrollWidth - clientWidth - 1) return true;
        if (dx > 0 && scrollLeft > 0) return true;
      }
    }
    current = current.parentElement ?? current.parentNode ?? null;
  }
  return false;
}

/**
 * Resolves the gesture listener surface for `root` (`[data-pochita="tabs"]`).
 * Top-level `<Tabs>` attach to their enclosing `[data-pochita="app-shell-body"]` (or fallback
 * `<main>` / `document.body`) so horizontal swipes in empty vertical/horizontal margins work
 * regardless of intermediate wrapper heights or max-width gutters. Nested `<Tabs>` stay scoped
 * strictly to their own `root`.
 */
export function resolveSwipeSurface(root: HTMLElement | null): HTMLElement | null {
  if (!root) return null;
  const rootNode = root as unknown as InspectableNode & {
    ownerDocument?: { body?: HTMLElement | null };
  };
  const parentEl = rootNode.parentElement ?? null;
  if (
    parentEl &&
    typeof parentEl.closest === 'function' &&
    parentEl.closest('[data-pochita="tabs"]')
  ) {
    return root;
  }
  if (typeof rootNode.closest === 'function') {
    const shellBody = rootNode.closest('[data-pochita="app-shell-body"]') as HTMLElement | null;
    if (shellBody) return shellBody;
    const mainEl = rootNode.closest('main') as HTMLElement | null;
    if (mainEl) return mainEl;
  }
  return rootNode.ownerDocument?.body ?? root;
}

/**
 * Checks whether a touch/pointer start `target` belongs to `root` (`[data-pochita="tabs"]`),
 * either directly inside `root` (and not inside a deeper nested `<Tabs>`) or via delegated
 * blank-space capture on `surface` when `root` is the sole visible top-level swipeable `<Tabs>`.
 */
export function isSwipeTargetOwnedByTabs(
  target: EventTarget | null,
  root: HTMLElement | null,
  surface?: HTMLElement | null,
): boolean {
  if (!root || !target || typeof target !== 'object') return false;
  const targetNode = target as InspectableNode;

  let nearestTabs: unknown = null;
  if (typeof targetNode.closest === 'function') {
    nearestTabs = targetNode.closest('[data-pochita="tabs"]');
  } else {
    let cur: InspectableNode | null = targetNode;
    while (cur && typeof cur === 'object') {
      if (
        readAttr(cur, 'data-pochita') === 'tabs' ||
        cur === (root as unknown as InspectableNode)
      ) {
        nearestTabs = cur;
        break;
      }
      cur = cur.parentElement ?? cur.parentNode ?? null;
    }
  }

  if (nearestTabs === root) return true;
  if (nearestTabs !== null && nearestTabs !== undefined) return false;

  const activeSurface = surface ?? root;
  if (activeSurface === root) return false;

  if (typeof targetNode.closest === 'function') {
    const excluded = targetNode.closest(NON_DELEGATED_REGION_SELECTOR) as InspectableNode | null;
    if (excluded && !(typeof excluded.contains === 'function' && excluded.contains(root))) {
      return false;
    }
  }

  const surfaceNode = activeSurface as unknown as InspectableNode & {
    querySelectorAll?: (selector: string) => Iterable<InspectableNode>;
  };
  if (typeof surfaceNode.querySelectorAll !== 'function') return false;

  let topLevelVisibleCount = 0;
  let matchesRoot = false;
  for (const candidate of surfaceNode.querySelectorAll(
    '[data-pochita="tabs"][data-swipeable="true"]',
  )) {
    const parent = candidate.parentElement ?? candidate.parentNode ?? null;
    if (parent && typeof parent.closest === 'function' && parent.closest('[data-pochita="tabs"]')) {
      continue;
    }
    if (typeof candidate.closest === 'function' && candidate.closest('[hidden]')) {
      continue;
    }
    topLevelVisibleCount += 1;
    if (candidate === (root as unknown as InspectableNode)) {
      matchesRoot = true;
    }
  }

  return topLevelVisibleCount === 1 && matchesRoot;
}
