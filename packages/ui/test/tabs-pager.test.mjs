import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../dist/components/Tabs.js';
import { createTabPagerEngine } from '../dist/components/tabPagerEngine.js';

function createFakeElement({
  attrs = {},
  offsetWidth = 360,
  offsetTop = 52,
  offsetLeft = 0,
  hidden = false,
  ownerRoot = null,
} = {}) {
  const attrMap = new Map(Object.entries(attrs));
  const listeners = new Map();
  let blurCalls = 0;
  const el = {
    tagName: 'DIV',
    style: {},
    hidden,
    offsetWidth,
    offsetTop,
    offsetLeft,
    clientWidth: offsetWidth,
    parentElement: ownerRoot,
    getAttribute(k) {
      return attrMap.has(k) ? attrMap.get(k) : null;
    },
    hasAttribute(k) {
      return attrMap.has(k);
    },
    setAttribute(k, v) {
      attrMap.set(k, String(v));
    },
    removeAttribute(k) {
      attrMap.delete(k);
    },
    closest(sel) {
      if (sel === '[data-pochita="tabs"]') return ownerRoot ?? el;
      return null;
    },
    addEventListener(type, fn) {
      const set = listeners.get(type) ?? new Set();
      set.add(fn);
      listeners.set(type, set);
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn);
    },
    dispatchTransitionEnd(propertyName = 'transform') {
      for (const fn of [...(listeners.get('transitionend') ?? [])]) {
        fn({ target: el, propertyName });
      }
    },
    blur() {
      blurCalls += 1;
    },
    get blurCount() {
      return blurCalls;
    },
  };
  return el;
}

function createFakeTabsFixture({ active = 'overview', viewportWidth = 360 } = {}) {
  const root = createFakeElement({ attrs: { 'data-pochita': 'tabs' }, offsetWidth: viewportWidth });
  const tabs = ['overview', 'rules', 'logs'];
  const triggers = tabs.map((val, idx) =>
    createFakeElement({
      attrs: {
        role: 'tab',
        'data-tab-value': val,
        'data-state': val === active ? 'active' : 'inactive',
        'aria-selected': val === active ? 'true' : 'false',
      },
      offsetLeft: 4 + idx * 104,
      offsetWidth: 100,
      ownerRoot: root,
    }),
  );
  const panels = new Map(
    tabs.map((val) => [
      val,
      createFakeElement({
        attrs: {
          'data-pochita': 'tabs-content',
          'data-tab-value': val,
          'data-state': val === active ? 'active' : 'inactive',
        },
        offsetWidth: viewportWidth,
        offsetTop: 52,
        offsetLeft: 0,
        hidden: val !== active,
        ownerRoot: root,
      }),
    ]),
  );

  root.querySelectorAll = (selector) => {
    if (selector === '[role="tab"]') return triggers;
    if (selector === '[data-pochita="tabs-content"]') return [...panels.values()];
    return [];
  };

  const pillEvents = [];
  let clearDraggingCalls = 0;
  let settledFor = null;
  const indicator = {
    snapshotRects() {
      return new Map(tabs.map((val, idx) => [val, { x: 4 + idx * 104, width: 100 }]));
    },
    applyRect(rect, animate, durationMs) {
      pillEvents.push({ rect, animate, durationMs });
    },
    clearDragging() {
      clearDraggingCalls += 1;
    },
    markSettledFor(tabVal) {
      settledFor = tabVal;
    },
  };

  return {
    root,
    triggers,
    panels,
    indicator,
    pillEvents,
    get clearDraggingCalls() {
      return clearDraggingCalls;
    },
    get settledFor() {
      return settledFor;
    },
  };
}

test('Tabs renders sliding indicator pill, overflow-x-clip viewport, keep-mounted panels by default, and supports unmountInactive', () => {
  const keepAliveHtml = renderToStaticMarkup(
    createElement(
      Tabs,
      { defaultValue: 'overview' },
      createElement(
        TabsList,
        null,
        createElement(TabsTrigger, { value: 'overview' }, '总览'),
        createElement(TabsTrigger, { value: 'logs' }, '日志'),
      ),
      createElement(TabsContent, { value: 'overview', className: 'flex flex-col' }, '总览面板'),
      createElement(TabsContent, { value: 'logs', className: 'flex flex-col' }, '日志面板'),
    ),
  );

  // Sliding pill exists inside TabsList; triggers stay above pill with no static active bg jump
  assert.ok(keepAliveHtml.includes('data-pochita="tabs-indicator"'));
  assert.ok(keepAliveHtml.includes('aria-hidden="true"'));
  assert.ok(keepAliveHtml.includes('overflow-x-clip'));
  assert.ok(keepAliveHtml.includes('relative z-[1]'));
  assert.ok(!keepAliveHtml.includes('data-[state=active]:bg-[var(--surface-card)]'));

  // Both panels are mounted (forceMount), with inactive panel marked hidden
  assert.ok(keepAliveHtml.includes('总览面板'));
  assert.ok(keepAliveHtml.includes('日志面板'));
  assert.match(
    keepAliveHtml,
    /data-tab-value="logs"[^>]*hidden=""|hidden=""[^>]*data-tab-value="logs"/,
  );

  // Optional unmountInactive={true} unmounts inactive panels
  const unmountHtml = renderToStaticMarkup(
    createElement(
      Tabs,
      { defaultValue: 'overview', unmountInactive: true },
      createElement(
        TabsList,
        null,
        createElement(TabsTrigger, { value: 'overview' }, '总览'),
        createElement(TabsTrigger, { value: 'logs' }, '日志'),
      ),
      createElement(TabsContent, { value: 'overview' }, '总览面板'),
      createElement(TabsContent, { value: 'logs' }, '日志面板'),
    ),
  );
  assert.ok(unmountHtml.includes('总览面板'));
  assert.ok(!unmountHtml.includes('日志面板'));
});

test('createTabPagerEngine tracks 1:1 finger drag, peeks neighbor, couples pill, commits on settle, and blurs stranded tab focus', () => {
  const fixture = createFakeTabsFixture({ active: 'overview', viewportWidth: 360 });
  const activeTabTrigger = fixture.triggers[0];
  let currentTab = 'overview';
  let committedTab = null;
  let now = 1000;
  const fakeDoc = { activeElement: activeTabTrigger };

  // Coalesce multiple move events into a single rAF frame
  const rafQueue = [];
  const origRaf = globalThis.requestAnimationFrame;
  const origCancelRaf = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = (cb) => {
    rafQueue.push(cb);
    return rafQueue.length;
  };
  globalThis.cancelAnimationFrame = () => {};

  try {
    const engine = createTabPagerEngine({
      getRoot: () => fixture.root,
      getIndicator: () => fixture.indicator,
      getCurrentValue: () => currentTab,
      isSwipeable: () => true,
      getOrientation: () => 'horizontal',
      getTabOrder: () => undefined,
      getEdgeGuardPx: () => 24,
      onCommitTab: (next) => {
        committedTab = next;
        currentTab = next;
      },
      now: () => now,
      getWindowWidth: () => 360,
      getDocument: () => fakeDoc,
    });

    const contentTarget = createFakeElement({ ownerRoot: fixture.root });
    engine.begin('touch', 1, 240, 200, contentTarget);

    // Move multiple times before rAF fires -> should schedule only ONE rAF
    now = 1016;
    assert.equal(engine.move('touch', 1, 180, 202), true);
    now = 1032;
    assert.equal(engine.move('touch', 1, 60, 204), true); // dx = -180 (exactly -50% of 360)
    assert.equal(rafQueue.length, 1);

    // Flush the single rAF frame
    rafQueue.shift()();

    const overviewPanel = fixture.panels.get('overview');
    const rulesPanel = fixture.panels.get('rules');
    assert.equal(overviewPanel.style.transform, 'translate3d(-180.00px, 0, 0)');
    assert.equal(rulesPanel.hidden, false);
    assert.equal(rulesPanel.getAttribute('data-swipe-visible'), 'true');
    assert.equal(rulesPanel.style.position, 'absolute');
    assert.equal(rulesPanel.style.top, '52px');
    assert.equal(rulesPanel.style.width, '360px');
    assert.equal(rulesPanel.style.pointerEvents, 'none');
    assert.equal(rulesPanel.style.transform, 'translate3d(180.00px, 0, 0)');

    // Sliding pill interpolated to 50% between tab 0 (x=4) and tab 1 (x=108) -> x=56
    assert.equal(fixture.pillEvents.length, 1);
    assert.deepEqual(fixture.pillEvents[0].rect, { x: 56, width: 100 });
    assert.equal(fixture.pillEvents[0].animate, false);

    // Release -> triggers velocity-scaled settle animation toward -360 / 0
    now = 1048;
    engine.end('touch', 1, 60, false);
    assert.equal(overviewPanel.style.transform, 'translate3d(-360.00px, 0, 0)');
    assert.equal(rulesPanel.style.transform, 'translate3d(0.00px, 0, 0)');
    assert.ok(rulesPanel.style.transition.includes('cubic-bezier(0.22, 1, 0.36, 1)'));
    assert.equal(committedTab, null);

    // Complete settle via transitionend -> blurs stranded activeElement & commits next tab
    rulesPanel.dispatchTransitionEnd('transform');
    assert.equal(committedTab, 'rules');
    assert.equal(activeTabTrigger.blurCount, 1);
    assert.equal(fixture.settledFor, 'rules');

    // React layoutEffect flush cleans inline styles on both panels
    assert.equal(engine.flushPendingCommit(), true);
    assert.equal(overviewPanel.style.transform, '');
    assert.equal(rulesPanel.style.position, '');
    assert.equal(rulesPanel.getAttribute('data-swipe-visible'), null);

    engine.destroy();
  } finally {
    globalThis.requestAnimationFrame = origRaf;
    globalThis.cancelAnimationFrame = origCancelRaf;
  }
});

test('createTabPagerEngine cancels sub-threshold swipe cleanly and yields to vertical scroll', () => {
  const fixture = createFakeTabsFixture({ active: 'overview', viewportWidth: 360 });
  let committed = null;
  let now = 2000;

  const engine = createTabPagerEngine({
    getRoot: () => fixture.root,
    getIndicator: () => fixture.indicator,
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

  const target = createFakeElement({ ownerRoot: fixture.root });

  // Vertical gesture yields immediately (move returns false -> touchmove never preventDefaults)
  engine.begin('touch', 2, 180, 100, target);
  now = 2016;
  assert.equal(engine.move('touch', 2, 182, 130), false);
  engine.end('touch', 2, 182, false);
  assert.equal(fixture.panels.get('overview').style.transform ?? '', '');

  // Short slow horizontal drag (< 28% and slow) springs back to 0 and hides peek panel
  engine.begin('touch', 3, 200, 100, target);
  now = 2100;
  assert.equal(engine.move('touch', 3, 160, 102), true); // dx = -40
  now = 2250; // paused > 80ms -> release velocity = 0
  engine.end('touch', 3, 160, false);

  const overviewPanel = fixture.panels.get('overview');
  const rulesPanel = fixture.panels.get('rules');
  assert.equal(overviewPanel.style.transform, 'translate3d(0.00px, 0, 0)');
  assert.equal(rulesPanel.style.transform, 'translate3d(360.00px, 0, 0)');
  assert.ok(rulesPanel.style.transition.includes('200ms'));

  rulesPanel.dispatchTransitionEnd('transform');
  assert.equal(committed, null);
  assert.equal(rulesPanel.hidden, true);
  assert.equal(rulesPanel.getAttribute('data-swipe-visible'), null);
  assert.equal(overviewPanel.style.transform, '');
  assert.ok(fixture.clearDraggingCalls >= 1);

  engine.destroy();
});

test('createTabPagerEngine handles boundary rubber-band, mid-drag peek reversal, and nested horizontal scroller yield', () => {
  // 1. Boundary rubber-band on first tab swiping right (dx > 0)
  const boundaryFixture = createFakeTabsFixture({ active: 'overview', viewportWidth: 360 });
  let now = 3000;
  const boundaryEngine = createTabPagerEngine({
    getRoot: () => boundaryFixture.root,
    getIndicator: () => boundaryFixture.indicator,
    getCurrentValue: () => 'overview',
    isSwipeable: () => true,
    getOrientation: () => 'horizontal',
    getTabOrder: () => undefined,
    getEdgeGuardPx: () => 24,
    onCommitTab: () => {
      assert.fail('Should never commit past boundary');
    },
    now: () => now,
    getWindowWidth: () => 360,
  });

  const target = createFakeElement({ ownerRoot: boundaryFixture.root });
  boundaryEngine.begin('touch', 10, 100, 100, target);
  now = 3016;
  assert.equal(boundaryEngine.move('touch', 10, 220, 100), true); // dx = +120
  const overviewPanel = boundaryFixture.panels.get('overview');
  const rulesPanel = boundaryFixture.panels.get('rules');
  // Smooth exponential damping (< 48px), NOT 120px
  const match = /^translate3d\(([-0-9.]+)px, 0, 0\)$/.exec(overviewPanel.style.transform);
  assert.ok(match);
  const appliedOffset = Number(match[1]);
  assert.ok(
    appliedOffset > 25 && appliedOffset < 35,
    `Unexpected rubber-band offset: ${appliedOffset}`,
  );
  assert.equal(rulesPanel.hidden, true);
  boundaryEngine.end('touch', 10, 220, false);
  overviewPanel.dispatchTransitionEnd('transform');
  assert.equal(overviewPanel.style.transform, '');
  boundaryEngine.destroy();

  // 2. Mid-drag direction reversal from middle tab ('rules') switches peek panel cleanly
  const midFixture = createFakeTabsFixture({ active: 'rules', viewportWidth: 360 });
  const midEngine = createTabPagerEngine({
    getRoot: () => midFixture.root,
    getIndicator: () => midFixture.indicator,
    getCurrentValue: () => 'rules',
    isSwipeable: () => true,
    getOrientation: () => 'horizontal',
    getTabOrder: () => undefined,
    getEdgeGuardPx: () => 24,
    onCommitTab: () => {},
    now: () => now,
    getWindowWidth: () => 360,
  });

  const midTarget = createFakeElement({ ownerRoot: midFixture.root });
  midEngine.begin('touch', 11, 180, 100, midTarget);
  now = 3100;
  midEngine.move('touch', 11, 120, 100); // dx = -60 -> peeks 'logs'
  assert.equal(midFixture.panels.get('logs').hidden, false);
  assert.equal(midFixture.panels.get('overview').hidden, true);

  now = 3116;
  midEngine.move('touch', 11, 240, 100); // dx = +60 -> hides 'logs', peeks 'overview'
  assert.equal(midFixture.panels.get('logs').hidden, true);
  assert.equal(midFixture.panels.get('overview').hidden, false);
  assert.equal(midFixture.panels.get('overview').style.transform, 'translate3d(-300.00px, 0, 0)');
  midEngine.abort();
  assert.equal(midFixture.panels.get('overview').hidden, true);

  // 3. Nested horizontal scroller yields once on axis lock without mutating panel styles
  const scroller = createFakeElement({ ownerRoot: midFixture.root });
  scroller.scrollWidth = 600;
  scroller.clientWidth = 200;
  scroller.scrollLeft = 0;
  const codeNode = createFakeElement({ ownerRoot: midFixture.root });
  codeNode.parentElement = scroller;

  midEngine.begin('touch', 12, 200, 100, codeNode);
  now = 3200;
  assert.equal(midEngine.move('touch', 12, 160, 100), false);
  assert.equal(midFixture.panels.get('rules').style.transform ?? '', '');
  midEngine.end('touch', 12, 160, false);
  midEngine.destroy();
});

test('createTabPagerEngine switches tabs when swiping blank AppShell body space outside Tabs box', () => {
  const fixture = createFakeTabsFixture({ active: 'overview', viewportWidth: 360 });
  const shellBody = {
    tagName: 'MAIN',
    querySelectorAll(sel) {
      return sel === '[data-pochita="tabs"][data-swipeable="true"]' ? [fixture.root] : [];
    },
  };
  fixture.root.parentElement = { closest: () => null };
  fixture.root.closest = (sel) => {
    if (sel === '[data-pochita="app-shell-body"]') return shellBody;
    if (sel === '[data-pochita="tabs"]') return fixture.root;
    return null;
  };

  let committed = null;
  let now = 4000;
  const engine = createTabPagerEngine({
    getRoot: () => fixture.root,
    getSurface: () => shellBody,
    getIndicator: () => fixture.indicator,
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

  // Target is bare <main> below Tabs (closest('[data-pochita="tabs"]') === null)
  const blankMainTarget = {
    tagName: 'MAIN',
    closest: () => null,
  };
  engine.begin('touch', 99, 260, 720, blankMainTarget);
  now = 4016;
  assert.equal(engine.move('touch', 99, 110, 722), true); // dx = -150 (> 28% of 360)
  now = 4032;
  engine.end('touch', 99, 110, false);
  fixture.panels.get('rules').dispatchTransitionEnd('transform');
  assert.equal(committed, 'rules');
  engine.destroy();
});
