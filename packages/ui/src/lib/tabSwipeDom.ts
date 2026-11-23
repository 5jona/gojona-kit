const IGNORED_TAGS = new Set(['input', 'textarea', 'select']);
const IGNORED_ROLES = new Set(['slider', 'switch', 'tablist']);
const IGNORE_SELECTOR =
  '[data-swipe-ignore], input, textarea, select, [role="slider"], [role="switch"], [role="tablist"], [contenteditable="true"]';

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
