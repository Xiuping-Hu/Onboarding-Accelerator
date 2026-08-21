import assert from 'node:assert/strict';
import test, { after, afterEach } from 'node:test';
import type { OnboardingSession, WorkspaceOnboardingState } from '@onboarding/shared';
import React, { type ReactNode } from 'react';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://onboarding.test/workspace',
});
let mobileViewport = false;
installDomGlobals(dom.window);

const { cleanup, fireEvent, render, screen, waitFor, within } =
  await import('@testing-library/react');
const userEvent = (await import('@testing-library/user-event')).default;
const { PathnameContext } =
  await import('next/dist/shared/lib/hooks-client-context.shared-runtime.js');
const { AppRouterContext } =
  await import('next/dist/shared/lib/app-router-context.shared-runtime.js');
const { WorkspaceExperience } = await import('./WorkspaceExperience');
const { WorkspaceShell } = await import('./WorkspaceShell');

const originalFetch = globalThis.fetch;
let pushedPaths: string[] = [];
const account = {
  userId: 'employee-1',
  displayName: 'Alex Morgan',
  role: 'user',
} as const;

after(() => {
  dom.window.close();
});

afterEach(() => {
  cleanup();
  mobileViewport = false;
  pushedPaths = [];
  globalThis.fetch = originalFetch;
});

void test('keeps assistant state across routed workspace pages', async () => {
  const firstPlan = createSessionFixture('plan-1', 'First plan');
  const secondPlan = createSessionFixture('plan-2', 'Second plan');
  installWorkspaceFetch([firstPlan, secondPlan]);
  const user = userEvent.setup({ document: dom.window.document });
  const view = render(shellAt('/workspace', <p>Overview route body</p>));

  await screen.findByRole('tab', { name: 'First plan' });
  await user.click(screen.getByRole('button', { name: 'Minimize onboarding assistant' }));
  assert.ok(screen.getByRole('button', { name: 'Open onboarding assistant' }));

  view.rerender(shellAt('/workspace/tasks', <p>Tasks route body</p>));
  assert.ok(await screen.findByRole('heading', { level: 1, name: 'Tasks' }));
  assert.ok(screen.getByRole('button', { name: 'Open onboarding assistant' }));
  assert.equal(screen.getByRole('link', { name: 'Tasks' }).getAttribute('aria-current'), 'page');

  view.rerender(shellAt('/workspace/resources', <p>Resources route body</p>));
  assert.ok(await screen.findByRole('heading', { level: 1, name: 'Resources' }));
  assert.ok(screen.getByRole('button', { name: 'Open onboarding assistant' }));
  assert.equal(
    screen.getByRole('link', { name: 'Resources' }).getAttribute('aria-current'),
    'page',
  );
});

void test('keeps session controls and content inside the assistant without reloading the workspace', async () => {
  const firstPlan = createSessionFixture('plan-1', 'First plan');
  const secondPlan = createSessionFixture('plan-2', 'Second plan');
  const requests = installWorkspaceFetch([firstPlan, secondPlan]);
  const user = userEvent.setup({ document: dom.window.document });
  render(shellAt('/workspace', <p>Overview route body</p>));

  const assistant = screen.getByRole('complementary', { name: 'Onboarding assistant' });
  const tabList = await within(assistant).findByRole('tablist', { name: 'Onboarding sessions' });
  const firstPlanTab = await within(tabList).findByRole('tab', { name: 'First plan' });
  const secondPlanTab = await within(tabList).findByRole('tab', { name: 'Second plan' });
  assert.equal(firstPlanTab.getAttribute('aria-selected'), 'true');
  assert.ok(within(assistant).getByRole('tabpanel', { name: 'First plan' }));
  assert.equal(screen.getByText('Overview route body').closest('[role="tabpanel"]'), null);

  await user.click(secondPlanTab);
  assert.equal(secondPlanTab.getAttribute('aria-selected'), 'true');
  assert.ok(within(assistant).getByRole('tabpanel', { name: 'Second plan' }));
  assert.equal(requests.includes('POST /api/sessions/plan-2/guide/root'), false);

  await user.click(within(tabList).getByRole('button', { name: 'New session' }));
  const createdPlanTab = await within(tabList).findByRole('tab', { name: 'Chat 3' });
  assert.equal(createdPlanTab.getAttribute('aria-selected'), 'true');
  assert.equal(requests.includes('POST /api/sessions/plan-3/guide/root'), false);

  await user.click(within(tabList).getByRole('button', { name: 'Delete Second plan' }));
  const deleteDialog = await screen.findByRole('alertdialog');
  await user.click(within(deleteDialog).getByRole('button', { name: 'Delete Second plan' }));

  await waitFor(() => {
    assert.ok(requests.includes('POST /api/sessions'));
    assert.ok(requests.includes('DELETE /api/sessions/plan-2'));
  });
});

void test('keeps the header in the main column and removes the account icon above the assistant', async () => {
  installWorkspaceFetch([createSessionFixture('plan-1', 'First plan')]);
  const { container } = render(shellAt('/workspace', <p>Overview route body</p>));

  await screen.findByRole('tab', { name: 'First plan' });
  const grid = container.querySelector('[data-slot="workspace-dashboard-grid"]');
  const mainColumn = container.querySelector('[data-slot="workspace-main-column"]');
  const assistant = screen.getByRole('complementary', { name: 'Onboarding assistant' });

  assert.equal(grid?.children.length, 2);
  assert.equal(grid?.children[0], mainColumn);
  assert.equal(grid?.children[1], assistant);
  assert.equal(mainColumn?.contains(screen.getByRole('banner')), true);
  assert.equal(assistant.parentElement, grid);
  assert.equal(screen.queryByRole('img', { name: 'Alex Morgan, Member' }), null);
});

void test('expands and restores the onboarding assistant from its left-edge handle', async () => {
  installWorkspaceFetch([createSessionFixture('plan-1', 'First plan')]);
  const user = userEvent.setup({ document: dom.window.document });
  render(shellAt('/workspace', <p>Overview route body</p>));

  const assistant = screen.getByRole('complementary', { name: 'Onboarding assistant' });
  const frame = assistant.closest('[data-assistant-expanded]');
  const resizeSeparator = await screen.findByRole('separator', {
    name: 'Resize onboarding assistant',
  });
  const toggleHandle = screen.getByRole('button', {
    name: 'Toggle onboarding assistant width',
  });

  assert.equal(toggleHandle.getAttribute('aria-pressed'), 'false');
  assert.equal(resizeSeparator.getAttribute('aria-valuenow'), '360');
  assert.equal(frame?.getAttribute('data-assistant-expanded'), 'false');

  await user.click(toggleHandle);

  assert.equal(toggleHandle.getAttribute('aria-pressed'), 'true');
  assert.equal(resizeSeparator.getAttribute('aria-valuenow'), '560');
  assert.equal(frame?.getAttribute('data-assistant-expanded'), 'true');

  await user.click(toggleHandle);

  assert.equal(toggleHandle.getAttribute('aria-pressed'), 'false');
  assert.equal(resizeSeparator.getAttribute('aria-valuenow'), '360');
  assert.equal(frame?.getAttribute('data-assistant-expanded'), 'false');
});

void test('drags the assistant within its bounds and remembers the last expanded width', async () => {
  installWorkspaceFetch([createSessionFixture('plan-1', 'First plan')]);
  const user = userEvent.setup({ document: dom.window.document });
  render(shellAt('/workspace', <p>Overview route body</p>));

  const resizeSeparator = await screen.findByRole('separator', {
    name: 'Resize onboarding assistant',
  });
  const toggleHandle = screen.getByRole('button', {
    name: 'Toggle onboarding assistant width',
  });
  const frame = resizeSeparator.closest('[data-assistant-resizing]');

  fireEvent.pointerDown(resizeSeparator, { button: 0, clientX: 900, pointerId: 1 });
  assert.equal(frame?.getAttribute('data-assistant-resizing'), 'true');

  fireEvent.pointerMove(resizeSeparator, { clientX: 660, pointerId: 1 });
  assert.equal(resizeSeparator.getAttribute('aria-valuenow'), '600');

  fireEvent.pointerMove(resizeSeparator, { clientX: 0, pointerId: 1 });
  assert.equal(resizeSeparator.getAttribute('aria-valuenow'), '720');

  fireEvent.pointerMove(resizeSeparator, { clientX: 660, pointerId: 1 });
  fireEvent.pointerUp(resizeSeparator, { clientX: 660, pointerId: 1 });
  assert.equal(frame?.getAttribute('data-assistant-resizing'), 'false');
  assert.equal(resizeSeparator.getAttribute('aria-valuenow'), '600');

  await user.click(toggleHandle);
  assert.equal(resizeSeparator.getAttribute('aria-valuenow'), '360');

  await user.click(toggleHandle);
  assert.equal(resizeSeparator.getAttribute('aria-valuenow'), '600');
});

void test('supports keyboard resizing from the assistant separator', async () => {
  installWorkspaceFetch([createSessionFixture('plan-1', 'First plan')]);
  render(shellAt('/workspace', <p>Overview route body</p>));

  const resizeSeparator = await screen.findByRole('separator', {
    name: 'Resize onboarding assistant',
  });

  assert.equal(resizeSeparator.getAttribute('aria-orientation'), 'vertical');
  assert.equal(resizeSeparator.getAttribute('aria-controls'), 'onboarding-assistant-panel-body');
  assert.equal(resizeSeparator.getAttribute('aria-valuemin'), '300');
  assert.equal(resizeSeparator.getAttribute('aria-valuemax'), '720');

  fireEvent.keyDown(resizeSeparator, { key: 'ArrowLeft' });
  assert.equal(resizeSeparator.getAttribute('aria-valuenow'), '376');

  fireEvent.keyDown(resizeSeparator, { key: 'ArrowRight' });
  assert.equal(resizeSeparator.getAttribute('aria-valuenow'), '360');

  fireEvent.keyDown(resizeSeparator, { key: 'Home' });
  assert.equal(resizeSeparator.getAttribute('aria-valuenow'), '300');

  fireEvent.keyDown(resizeSeparator, { key: 'End' });
  assert.equal(resizeSeparator.getAttribute('aria-valuenow'), '720');

  fireEvent.keyDown(resizeSeparator, { key: 'Enter' });
  assert.equal(resizeSeparator.getAttribute('aria-valuenow'), '360');
});

void test('keeps the routed workspace mounted when logout fails', async () => {
  installWorkspaceFetch([createSessionFixture('plan-1', 'First plan')], {
    failLogout: true,
  });
  const user = userEvent.setup({ document: dom.window.document });
  render(
    <AppRouterContext.Provider value={appRouter}>
      <PathnameContext.Provider value="/workspace">
        <WorkspaceExperience initialAccount={account}>
          <p>Persistent workspace content</p>
        </WorkspaceExperience>
      </PathnameContext.Provider>
    </AppRouterContext.Provider>,
  );

  await user.click(await screen.findByRole('button', { name: 'Sign out' }));
  const alert = await screen.findByRole('alert');
  assert.match(alert.textContent ?? '', /Could not sign out\. Please try again\./u);
  assert.ok(screen.getByText('Persistent workspace content'));
  assert.equal(screen.getByRole('button', { name: 'Sign out' }).hasAttribute('disabled'), false);
});

void test('isolates the dashboard while the mobile navigation dialog is open', async () => {
  mobileViewport = true;
  installWorkspaceFetch([createSessionFixture('plan-1', 'First plan')]);
  const { container } = render(shellAt('/workspace', <p>Overview route body</p>));
  const opener = await screen.findByRole('button', { name: 'Open navigation' });

  fireEvent.click(opener);
  const navigationDialog = await screen.findByRole('dialog', { name: 'Workspace navigation' });
  const dashboard = container.querySelector('[data-slot="workspace-dashboard-surface"]');
  assert.equal(dashboard?.getAttribute('aria-hidden'), 'true');
  assert.deepEqual(
    within(navigationDialog)
      .getAllByRole('link')
      .map((link) => link.getAttribute('aria-label')),
    ['Overview', 'Tasks', 'Resources'],
  );
  const firstNavigationLink = within(navigationDialog).getByRole('link', { name: 'Overview' });
  await waitFor(() => assert.equal(dom.window.document.activeElement, firstNavigationLink));

  fireEvent.click(within(navigationDialog).getByRole('button', { name: 'Close navigation' }));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 20));
  assert.equal(dashboard?.hasAttribute('aria-hidden'), false);
  assert.equal(dom.window.document.activeElement, opener);
});

void test('discovers durable roadmap notices on mount, focus, and visibility return', async () => {
  const ready = createReadyOnboardingState('notice-2', 'version-2', 2);
  const requests = installWorkspaceFetch([createSessionFixture('plan-1', 'First plan')], {
    onboardingState: ready,
  });
  render(shellAt('/workspace', <p>Overview route body</p>));

  assert.ok(await screen.findByText(/Your roadmap now reflects the latest knowledge base/u));
  assert.equal(countRequests(requests, 'GET /api/onboarding'), 1);

  fireEvent(window, new Event('focus'));
  await waitFor(() => assert.equal(countRequests(requests, 'GET /api/onboarding'), 2));

  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  fireEvent(document, new Event('visibilitychange'));
  await waitFor(() => assert.equal(countRequests(requests, 'GET /api/onboarding'), 3));
});

void test('View refetches, focuses the exact newest version, then acknowledges it', async () => {
  const stale = createReadyOnboardingState('notice-2', 'version-2', 2);
  const latest = createReadyOnboardingState('notice-3', 'version-3', 3);
  const requests = installWorkspaceFetch([createSessionFixture('plan-1', 'First plan')], {
    onboardingStates: [stale, latest],
  });
  const user = userEvent.setup({ document: dom.window.document });
  render(
    shellAt(
      '/workspace/tasks',
      <h2 data-roadmap-version-id="version-3" id="onboarding-roadmap" tabIndex={-1}>
        Tax consultant onboarding
      </h2>,
    ),
  );

  await user.click(await screen.findByRole('button', { name: 'View latest roadmap' }));
  await waitFor(() => {
    assert.deepEqual(pushedPaths, ['/workspace#onboarding-roadmap']);
    assert.equal(dom.window.document.activeElement?.id, 'onboarding-roadmap');
    assert.ok(requests.includes('PATCH /api/onboarding/notices/notice-3'));
    assert.equal(requests.includes('PATCH /api/onboarding/notices/notice-2'), false);
  });
});

void test('Dismiss acknowledges a notice without navigating and hides it after success', async () => {
  const requests = installWorkspaceFetch([createSessionFixture('plan-1', 'First plan')], {
    onboardingState: createReadyOnboardingState('notice-2', 'version-2', 2),
  });
  const user = userEvent.setup({ document: dom.window.document });
  render(shellAt('/workspace/resources', <p>Resources route body</p>));

  await user.click(await screen.findByRole('button', { name: 'Dismiss' }));
  await waitFor(() => {
    assert.ok(requests.includes('PATCH /api/onboarding/notices/notice-2'));
    assert.equal(screen.queryByRole('button', { name: 'Dismiss' }), null);
    assert.deepEqual(pushedPaths, []);
  });
});

void test('a failed notice acknowledgment retains the durable banner with retry feedback', async () => {
  installWorkspaceFetch([createSessionFixture('plan-1', 'First plan')], {
    failNoticeAck: true,
    onboardingState: createReadyOnboardingState('notice-2', 'version-2', 2),
  });
  const user = userEvent.setup({ document: dom.window.document });
  render(shellAt('/workspace', <p>Overview route body</p>));

  await user.click(await screen.findByRole('button', { name: 'Dismiss' }));
  assert.match((await screen.findByRole('alert')).textContent ?? '', /Could not dismiss/u);
  assert.ok(screen.getByRole('button', { name: 'View latest roadmap' }));
  assert.ok(screen.getByRole('button', { name: 'Dismiss' }));
});

function shellAt(pathname: string, children: ReactNode) {
  return (
    <AppRouterContext.Provider value={appRouter}>
      <PathnameContext.Provider value={pathname}>
        <WorkspaceShell
          account={account}
          isSigningOut={false}
          logoutError={null}
          onLogout={() => undefined}
        >
          {children}
        </WorkspaceShell>
      </PathnameContext.Provider>
    </AppRouterContext.Provider>
  );
}

const appRouter = {
  back: () => undefined,
  forward: () => undefined,
  refresh: () => undefined,
  push(href: string) {
    pushedPaths.push(href);
  },
  replace: () => undefined,
  prefetch: () => undefined,
};

function createSessionFixture(id: string, title: string): OnboardingSession {
  return {
    id,
    title,
    createdAt: '2026-07-29T12:00:00.000Z',
    updatedAt: '2026-07-29T12:00:00.000Z',
    settings: { webSearchEnabled: false },
    chatHistory: [],
    guide: {
      rootNodeIds: [],
      nodes: {},
      expandedNodeIds: [],
    },
  };
}

function installWorkspaceFetch(
  sessions: OnboardingSession[],
  options: {
    failLogout?: boolean;
    failNoticeAck?: boolean;
    onboardingState?: WorkspaceOnboardingState;
    onboardingStates?: WorkspaceOnboardingState[];
  } = {},
) {
  const requests: string[] = [];
  const onboardingStates = options.onboardingStates ? [...options.onboardingStates] : [];
  let onboardingState = options.onboardingState ?? createEmptyOnboardingState();
  globalThis.fetch = (async (input, init) => {
    const path = input instanceof Request ? new URL(input.url).pathname : String(input);
    const method = init?.method ?? 'GET';
    requests.push(`${method} ${path}`);

    if (path === '/api/onboarding' && method === 'GET') {
      onboardingState = onboardingStates.shift() ?? onboardingState;
      return jsonResponse(onboardingState);
    }
    if (/^\/api\/onboarding\/notices\/[^/]+$/u.test(path) && method === 'PATCH') {
      if (options.failNoticeAck) return jsonResponse({ error: 'notice failed' }, 500);
      if (onboardingState.status === 'ready') {
        onboardingState = { ...onboardingState, newestUnreadNotice: null, unreadNoticeCount: 0 };
      }
      return new Response(null, { status: 204 });
    }
    if (path === '/api/sessions' && method === 'GET') {
      return jsonResponse({ sessions });
    }
    if (path === '/api/sessions' && method === 'POST') {
      const body = JSON.parse(String(init?.body ?? '{}')) as { title?: string };
      return jsonResponse({
        session: createSessionFixture('plan-3', body.title ?? 'Onboarding plan 3'),
      });
    }
    if (/^\/api\/sessions\/[^/]+\/guide\/root$/u.test(path) && method === 'POST') {
      const sessionId = path.split('/')[3] ?? 'plan-1';
      const session =
        sessions.find((candidate) => candidate.id === sessionId) ??
        createSessionFixture(sessionId, 'Onboarding plan 3');
      return jsonResponse({
        rootNodeIds: [],
        nodes: [],
        session,
        sources: [],
        knowledgeMapEnabled: false,
      });
    }
    if (/^\/api\/sessions\/[^/]+$/u.test(path) && method === 'DELETE') {
      return new Response(null, { status: 204 });
    }
    if (path === '/api/auth/logout' && method === 'POST') {
      return options.failLogout
        ? jsonResponse({ error: 'logout failed' }, 500)
        : new Response(null, { status: 204 });
    }

    return jsonResponse({ error: `Unhandled test request: ${method} ${path}` }, 500);
  }) as typeof fetch;
  return requests;
}

function createEmptyOnboardingState(): WorkspaceOnboardingState {
  return {
    status: 'empty',
    message: 'Roadmap is being prepared from the latest knowledge base.',
    newestUnreadNotice: null,
    unreadNoticeCount: 0,
  };
}

function createReadyOnboardingState(
  noticeId: string,
  versionId: string,
  versionNumber: number,
): WorkspaceOnboardingState {
  return {
    status: 'ready',
    roadmap: {
      roadmapId: 'roadmap-1',
      versionId,
      versionNumber,
      title: 'Tax consultant onboarding',
      stages: [],
      sourceReferences: [],
    },
    userState: {
      appliedVersionId: versionId,
      stateRevision: versionNumber,
      syncStatus: 'current',
      progress: {
        percentComplete: 0,
        completedWeight: 0,
        totalWeight: 1,
        completedTaskCount: 0,
        totalTaskCount: 1,
        currentStageId: null,
      },
      tasks: [],
      upcomingTasks: [],
    },
    newestUnreadNotice: {
      id: noticeId,
      userId: 'employee-1',
      roadmapVersionId: versionId,
      roadmapVersionNumber: versionNumber,
      ingestionRunId: 'ingestion-1',
      retainedItemCount: 14,
      addedItemCount: 2,
      retiredItemCount: 1,
      preservedCompletedCount: 3,
      createdAt: '2026-08-13T12:00:00.000Z',
      readAt: null,
    },
    unreadNoticeCount: 1,
  };
}

function countRequests(requests: string[], request: string) {
  return requests.filter((candidate) => candidate === request).length;
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function installDomGlobals(window: JSDOM['window']): void {
  const globalObject = globalThis as typeof globalThis & Record<string, unknown>;
  for (const key of [
    'document',
    'navigator',
    'Node',
    'NodeFilter',
    'Element',
    'HTMLElement',
    'HTMLAnchorElement',
    'HTMLButtonElement',
    'HTMLInputElement',
    'HTMLSelectElement',
    'HTMLTextAreaElement',
    'SVGElement',
    'MutationObserver',
    'DOMRect',
    'Event',
    'CustomEvent',
    'FocusEvent',
    'KeyboardEvent',
    'MouseEvent',
    'getComputedStyle',
  ]) {
    Object.defineProperty(globalObject, key, {
      configurable: true,
      value: window[key as keyof typeof window],
      writable: true,
    });
  }
  Object.defineProperty(globalObject, 'window', {
    configurable: true,
    value: window,
    writable: true,
  });
  Object.defineProperty(globalObject, 'self', {
    configurable: true,
    value: window,
    writable: true,
  });
  class TestPointerEvent extends window.MouseEvent {
    readonly isPrimary: boolean;
    readonly pointerId: number;
    readonly pointerType: string;

    constructor(
      type: string,
      init: MouseEventInit & { isPrimary?: boolean; pointerId?: number; pointerType?: string } = {},
    ) {
      super(type, init);
      this.isPrimary = init.isPrimary ?? true;
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? 'mouse';
    }
  }
  Object.defineProperty(window, 'PointerEvent', {
    configurable: true,
    value: TestPointerEvent,
    writable: true,
  });
  Object.defineProperty(globalObject, 'PointerEvent', {
    configurable: true,
    value: TestPointerEvent,
    writable: true,
  });
  globalObject.IS_REACT_ACT_ENVIRONMENT = true;
  globalObject.React = React;
  Object.defineProperty(globalObject, 'MessageChannel', {
    configurable: true,
    value: class TestMessageChannel {
      port1: { onmessage: (() => void) | null } = { onmessage: null };
      port2 = {
        postMessage: () => queueMicrotask(() => this.port1.onmessage?.()),
      };
    },
    writable: true,
  });
  globalObject.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.matchMedia = (query) => ({
    matches: query === '(max-width: 767px)' ? mobileViewport : false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    },
  });
  window.requestAnimationFrame = (callback) => window.setTimeout(() => callback(Date.now()), 0);
  window.cancelAnimationFrame = (handle) => window.clearTimeout(handle);
  Object.defineProperty(globalObject, 'requestAnimationFrame', {
    configurable: true,
    value: window.requestAnimationFrame.bind(window),
    writable: true,
  });
  Object.defineProperty(globalObject, 'cancelAnimationFrame', {
    configurable: true,
    value: window.cancelAnimationFrame.bind(window),
    writable: true,
  });
  window.HTMLElement.prototype.scrollIntoView = () => undefined;
  window.HTMLElement.prototype.scrollTo = () => undefined;
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.setPointerCapture = () => undefined;
  window.HTMLElement.prototype.releasePointerCapture = () => undefined;
}
