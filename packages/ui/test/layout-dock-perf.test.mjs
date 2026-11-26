import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppShell } from '../dist/components/AppShell.js';
import { BottomNav, Tabs, TabsContent, TabsList, TabsTrigger } from '../dist/components/Tabs.js';
import { ToastProvider } from '../dist/components/Toast.js';
import { createTabPagerEngine } from '../dist/components/tabPagerEngine.js';
import {
  applyIndicatorStyle,
  INDICATOR_BASE_WIDTH_PX,
} from '../dist/components/useTabIndicator.js';
import {
  isSwipeTargetOwnedByTabs,
  resolveSwipeSurface,
  shouldIgnoreSwipeStart,
} from '../src/lib/tabSwipe.ts';

const UI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('AppShell supports fullBleed, viewportMode="fill", bottomSlot, and safe-area chrome classes', () => {
  const fillHtml = renderToStaticMarkup(
    createElement(
      AppShell,
      {
        title: '控制台',
        variant: 'page',
        fullBleed: true,
        viewportMode: 'fill',
        bottomSlot: createElement('div', { 'data-testid': 'dock-bar' }, '底部停靠'),
      },
      createElement('div', null, '主体'),
    ),
  );

  assert.ok(fillHtml.includes('data-viewport-mode="fill"'));
  assert.ok(fillHtml.includes('data-full-bleed="true"'));
  assert.ok(fillHtml.includes('max-w-none'));
  assert.ok(!fillHtml.includes('max-w-5xl'));
  assert.ok(fillHtml.includes('h-dvh'));
  assert.ok(fillHtml.includes('overflow-hidden'));
  assert.ok(fillHtml.includes('overflow-y-auto'));
  assert.ok(fillHtml.includes('pochita-shell-sticky-header'));
  assert.ok(!fillHtml.includes('backdrop-blur-md'));
  assert.ok(fillHtml.includes('data-pochita="app-shell-bottom"'));
  assert.ok(fillHtml.includes('pochita-shell-bottom'));
  assert.ok(fillHtml.includes('shrink-0'));
  assert.ok(fillHtml.includes('底部停靠'));

  // Default page scroll mode keeps max-w-5xl and sticky bottomSlot
  const scrollHtml = renderToStaticMarkup(
    createElement(
      AppShell,
      {
        title: '滚动页',
        variant: 'page',
        bottomSlot: createElement('div', null, '停靠栏'),
      },
      createElement('div', null, '内容'),
    ),
  );
  assert.ok(scrollHtml.includes('data-viewport-mode="scroll"'));
  assert.ok(scrollHtml.includes('data-full-bleed="false"'));
  assert.ok(scrollHtml.includes('max-w-5xl'));
  assert.ok(scrollHtml.includes('sticky bottom-0'));
});

test('Tabs wrapping AppShell with BottomNav / TabsList variant="dock" renders accessible dock chrome', () => {
  const html = renderToStaticMarkup(
    createElement(
      Tabs,
      { defaultValue: 'overview' },
      createElement(
        AppShell,
        {
          title: '模块控制台',
          variant: 'page',
          fullBleed: true,
          viewportMode: 'fill',
          bottomSlot: createElement(
            BottomNav,
            { 'aria-label': '主模块导航' },
            createElement(
              TabsTrigger,
              { value: 'overview', icon: createElement('span', null, 'O') },
              '总览',
            ),
            createElement(TabsTrigger, { value: 'rules' }, '规则'),
            createElement(TabsTrigger, { value: 'logs' }, '日志'),
          ),
        },
        createElement(TabsContent, { value: 'overview' }, '总览面板'),
        createElement(TabsContent, { value: 'rules' }, '规则面板'),
        createElement(TabsContent, { value: 'logs' }, '日志面板'),
      ),
    ),
  );

  assert.ok(html.includes('data-pochita="tabs-list"'));
  assert.ok(html.includes('data-variant="dock"'));
  assert.ok(html.includes('pochita-tabs-dock'));
  assert.ok(html.includes('pochita-tabs-dock-trigger'));
  assert.ok(html.includes('min-h-[56px]'));
  assert.ok(html.includes('w-[100px]'));
  assert.ok(html.includes('origin-left'));
  assert.ok(html.includes('aria-label="主模块导航"'));

  // Direct TabsList variant="dock" matches BottomNav output contract
  const directHtml = renderToStaticMarkup(
    createElement(
      Tabs,
      { defaultValue: 'a' },
      createElement(
        TabsList,
        { variant: 'dock' },
        createElement(TabsTrigger, { value: 'a' }, '模块A'),
        createElement(TabsTrigger, { value: 'b' }, '模块B'),
      ),
      createElement(TabsContent, { value: 'a' }, '内容A'),
    ),
  );
  assert.ok(directHtml.includes('data-variant="dock"'));
  assert.ok(directHtml.includes('min-h-[56px]'));
});

function createDockCompositionFixture({ active = 'overview', viewportWidth = 360 } = {}) {
  const tabs = ['overview', 'rules', 'logs'];
  const listeners = new Map();
  const makeEl = ({
    tagName = 'DIV',
    attrs = {},
    offsetWidth = viewportWidth,
    offsetTop = 0,
    offsetLeft = 0,
    hidden = false,
    parent = null,
  } = {}) => {
    const attrMap = new Map(Object.entries(attrs));
    const elListeners = new Map();
    const el = {
      tagName,
      style: {},
      hidden,
      offsetWidth,
      offsetTop,
      offsetLeft,
      clientWidth: offsetWidth,
      scrollWidth: offsetWidth,
      scrollLeft: 0,
      parentElement: parent,
      getAttribute: (k) => (attrMap.has(k) ? attrMap.get(k) : null),
      hasAttribute: (k) => attrMap.has(k),
      setAttribute: (k, v) => attrMap.set(k, String(v)),
      removeAttribute: (k) => attrMap.delete(k),
      closest(sel) {
        let cur = el;
        while (cur) {
          if (sel === '[data-pochita="tabs"]' && cur.getAttribute('data-pochita') === 'tabs') {
            return cur;
          }
          if (
            sel === '[data-pochita="app-shell-body"]' &&
            cur.getAttribute('data-pochita') === 'app-shell-body'
          ) {
            return cur;
          }
          if (
            sel === '[data-pochita="tabs-content"]' &&
            cur.getAttribute('data-pochita') === 'tabs-content'
          ) {
            return cur;
          }
          if (sel === 'main' && cur.tagName === 'MAIN') return cur;
          cur = cur.parentElement;
        }
        return null;
      },
      addEventListener(type, fn) {
        const set = elListeners.get(type) ?? new Set();
        set.add(fn);
        elListeners.set(type, set);
      },
      removeEventListener(type, fn) {
        elListeners.get(type)?.delete(fn);
      },
      dispatchTransitionEnd(propertyName = 'transform') {
        for (const fn of [...(elListeners.get('transitionend') ?? [])]) {
          fn({ target: el, propertyName });
        }
      },
    };
    listeners.set(el, elListeners);
    return el;
  };

  // <Tabs> -> <AppShell> -> (<header>, <main data-pochita="app-shell-body">, <div data-pochita="app-shell-bottom"> -> <TabsList>)
  const tabsRoot = makeEl({
    attrs: { 'data-pochita': 'tabs', 'data-swipeable': 'true' },
  });
  const shellSection = makeEl({
    tagName: 'SECTION',
    attrs: { 'data-pochita': 'app-shell' },
    parent: tabsRoot,
  });
  const shellHeader = makeEl({ tagName: 'HEADER', parent: shellSection });
  const shellBody = makeEl({
    tagName: 'MAIN',
    attrs: { 'data-pochita': 'app-shell-body' },
    parent: shellSection,
  });
  const shellBottom = makeEl({
    attrs: { 'data-pochita': 'app-shell-bottom' },
    parent: shellSection,
  });
  const dockList = makeEl({
    attrs: { role: 'tablist', 'data-pochita': 'tabs-list', 'data-variant': 'dock' },
    parent: shellBottom,
  });

  const triggers = tabs.map((val, idx) =>
    makeEl({
      tagName: 'BUTTON',
      attrs: {
        role: 'tab',
        'data-tab-value': val,
        'data-state': val === active ? 'active' : 'inactive',
        'aria-selected': val === active ? 'true' : 'false',
      },
      offsetLeft: 4 + idx * 116,
      offsetWidth: 112,
      parent: dockList,
    }),
  );

  const panels = new Map(
    tabs.map((val) => [
      val,
      makeEl({
        attrs: {
          'data-pochita': 'tabs-content',
          'data-tab-value': val,
          'data-state': val === active ? 'active' : 'inactive',
        },
        offsetWidth: viewportWidth,
        offsetTop: 16,
        offsetLeft: 0,
        hidden: val !== active,
        parent: shellBody,
      }),
    ]),
  );

  // Nested AppShell inside a tab panel must NOT hijack resolveSwipeSurface
  const nestedShellBody = makeEl({
    tagName: 'DIV',
    attrs: { 'data-pochita': 'app-shell-body' },
    parent: panels.get('overview'),
  });

  tabsRoot.querySelectorAll = (sel) => {
    if (sel === '[data-pochita="app-shell-body"]') return [shellBody, nestedShellBody];
    if (sel === '[role="tab"]') return triggers;
    if (sel === '[data-pochita="tabs-content"]') return [...panels.values()];
    return [];
  };

  const indicatorEl = makeEl({ tagName: 'SPAN', attrs: { 'data-pochita': 'tabs-indicator' } });
  const appliedRects = [];
  const indicator = {
    snapshotRects() {
      return new Map(tabs.map((val, idx) => [val, { x: 4 + idx * 116, width: 112 }]));
    },
    applyRect(rect, animate, durationMs) {
      appliedRects.push({ rect, animate, durationMs });
      applyIndicatorStyle(indicatorEl, rect, animate, durationMs);
    },
    clearDragging() {},
    markSettledFor() {},
  };

  return {
    tabsRoot,
    shellHeader,
    shellBody,
    shellBottom,
    dockList,
    triggers,
    panels,
    nestedShellBody,
    indicatorEl,
    indicator,
    appliedRects,
    makeEl,
  };
}

test('Tabs wrapping AppShell resolves swipe surface to owned app-shell-body and preserves 1:1 swipe + dock indicator sync', () => {
  const fx = createDockCompositionFixture({ active: 'overview', viewportWidth: 360 });

  // 1. resolveSwipeSurface selects the direct AppShell body (not header, not bottomSlot, not nested panel AppShell)
  assert.equal(resolveSwipeSurface(fx.tabsRoot), fx.shellBody);

  // 2. Touches inside app-shell-body (content OR blank space) are owned by Tabs
  assert.equal(isSwipeTargetOwnedByTabs(fx.shellBody, fx.tabsRoot, fx.shellBody), true);
  assert.equal(
    isSwipeTargetOwnedByTabs(fx.panels.get('overview'), fx.tabsRoot, fx.shellBody),
    true,
  );

  // 3. Touches on dock tablist are ignored by shouldIgnoreSwipeStart (defense in depth)
  assert.equal(shouldIgnoreSwipeStart(fx.triggers[0], fx.tabsRoot), true);
  assert.equal(shouldIgnoreSwipeStart(fx.dockList, fx.tabsRoot), true);

  let committed = null;
  let now = 1000;
  const engine = createTabPagerEngine({
    getRoot: () => fx.tabsRoot,
    getSurface: () => fx.shellBody,
    getIndicator: () => fx.indicator,
    getCurrentValue: () => 'overview',
    isSwipeable: () => true,
    getOrientation: () => 'horizontal',
    getTabOrder: () => undefined,
    getEdgeGuardPx: () => 24,
    onCommitTab: (next) => {
      committed = next;
    },
    now: () => now,
    getWindowWidth: () => 360,
  });

  // 4. 24px edge guard protects system back gesture
  engine.begin('touch', 1, 18, 200, fx.shellBody);
  assert.equal(engine.getActiveInput(), null);

  // 5. [data-swipe-ignore] inside panel isolates horizontal widgets
  const ignoredWidget = fx.makeEl({
    attrs: { 'data-swipe-ignore': '' },
    parent: fx.panels.get('overview'),
  });
  engine.begin('touch', 2, 180, 200, ignoredWidget);
  assert.equal(engine.getActiveInput(), null);

  // 6. Nested horizontal scroller yields without moving panels
  const hScroller = fx.makeEl({ parent: fx.panels.get('overview') });
  hScroller.scrollWidth = 720;
  hScroller.clientWidth = 300;
  hScroller.style.overflowX = 'auto';
  const scrollerChild = fx.makeEl({ parent: hScroller });
  engine.begin('touch', 3, 220, 200, scrollerChild);
  now = 1016;
  assert.equal(engine.move('touch', 3, 180, 202), false);
  engine.end('touch', 3, 180, false);
  assert.equal(committed, null);

  // 7. 1:1 drag in blank app-shell-body space moves active + peek panel AND interpolates dock indicator via scaleX
  engine.begin('touch', 4, 260, 480, fx.shellBody);
  now = 1032;
  assert.equal(engine.move('touch', 4, 140, 482), true); // dx = -120 -> 1/3 progress
  assert.equal(fx.panels.get('overview').style.transform, 'translate3d(-120.00px, 0, 0)');
  assert.equal(fx.panels.get('rules').hidden, false);
  assert.equal(fx.panels.get('rules').style.transform, 'translate3d(240.00px, 0, 0)');
  assert.ok(fx.appliedRects.length > 0);
  assert.equal(fx.indicatorEl.style.width, `${INDICATOR_BASE_WIDTH_PX}px`);
  assert.equal(fx.indicatorEl.style.transformOrigin, 'left center');
  assert.match(fx.indicatorEl.style.transform, /^translate3d\([\d.-]+px, 0, 0\) scaleX\([\d.]+\)$/);

  // Release commits 'rules' and settles dock indicator with transform-only transition
  now = 1048;
  engine.end('touch', 4, 110, false, 482);
  assert.ok(fx.indicatorEl.style.transition.includes('transform'));
  assert.ok(!fx.indicatorEl.style.transition.includes('width'));
  fx.panels.get('rules').dispatchTransitionEnd('transform');
  assert.equal(committed, 'rules');

  engine.destroy();
});

test('applyIndicatorStyle uses fixed base width and transform-only translate3d + scaleX with zero pixel drift', () => {
  const el = { style: {} };

  applyIndicatorStyle(el, { x: 12.5, width: 148 }, true, 220);
  assert.equal(el.style.width, `${INDICATOR_BASE_WIDTH_PX}px`);
  assert.equal(el.style.transformOrigin, 'left center');
  assert.equal(el.style.opacity, '1');
  assert.equal(el.style.transition, 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)');
  assert.equal(el.style.transform, 'translate3d(12.50px, 0, 0) scaleX(1.480000)');

  // Simulated ResizeObserver update: width stays fixed, transform updates with exact scaleX
  applyIndicatorStyle(el, { x: 164, width: 82.5 }, false, 0);
  assert.equal(el.style.width, `${INDICATOR_BASE_WIDTH_PX}px`);
  assert.equal(el.style.transition, 'none');
  const match = /^translate3d\(([\d.-]+)px, 0, 0\) scaleX\(([\d.]+)\)$/.exec(el.style.transform);
  assert.ok(match);
  assert.ok(Math.abs(Number(match[1]) - 164) < 0.01);
  assert.ok(Math.abs(Number(match[2]) * INDICATOR_BASE_WIDTH_PX - 82.5) < 0.01);

  // Zero width hides indicator
  applyIndicatorStyle(el, { x: 0, width: 0 }, false, 0);
  assert.equal(el.style.opacity, '0');
});

test('P1 performance invariants: native-glass disables redundant blur, zero transition-all, and sideEffects declared', () => {
  const nativeGlassCss = fs.readFileSync(
    path.join(UI_ROOT, 'src/styles/surfaces/native-glass.css'),
    'utf8',
  );
  assert.ok(nativeGlassCss.includes('.pochita-shell-sticky-header'));
  assert.ok(nativeGlassCss.includes('.pochita-shell-bottom'));
  assert.ok(nativeGlassCss.includes('.pochita-toast'));
  assert.ok(nativeGlassCss.includes('backdrop-filter: none'));

  // Toast renders semantic class without Tailwind backdrop-blur-md utility override
  const toastSource = fs.readFileSync(path.join(UI_ROOT, 'src/components/Toast.tsx'), 'utf8');
  assert.ok(toastSource.includes('pochita-toast'));
  assert.ok(!toastSource.includes('backdrop-blur-md'));
  const toastHtml = renderToStaticMarkup(
    createElement(ToastProvider, null, createElement('span', null, 'ok')),
  );
  assert.ok(toastHtml.includes('data-pochita="toast-viewport"'));

  // Zero transition-all across all UI components
  const componentsDir = path.join(UI_ROOT, 'src/components');
  for (const entry of fs.readdirSync(componentsDir)) {
    if (!entry.endsWith('.tsx')) continue;
    const src = fs.readFileSync(path.join(componentsDir, entry), 'utf8');
    assert.ok(
      !src.includes('transition-all'),
      `${entry} must not use transition-all; use explicit transition-[...] properties`,
    );
  }

  // Tree-shaking sideEffects manifest
  const pkg = JSON.parse(fs.readFileSync(path.join(UI_ROOT, 'package.json'), 'utf8'));
  assert.deepEqual(pkg.sideEffects, ['./dist/styles.css', '**/*.css']);
});
