import assert from 'node:assert/strict';
import test, { after, afterEach } from 'node:test';
import type { OnboardingSession } from '@onboarding/shared';
import React, { type ReactNode } from 'react';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://onboarding.test/workspace',
});
let mobileViewport = false;
installDomGlobals(dom.window);

const { cleanup, render, screen, waitFor, within } = await import('@testing-library/react');
const userEvent = (await import('@testing-library/user-event')).default;
const { PathnameContext } =
  await import('next/dist/shared/lib/hooks-client-context.shared-runtime.js');
const { WorkspaceExperience } = await import('./WorkspaceExperience');
const { WorkspaceShell } = await import('./WorkspaceShell');

const originalFetch = globalThis.fetch;
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
  const firstPlanTab = within(tabList).getByRole('tab', { name: 'First plan' });
  const secondPlanTab = within(tabList).getByRole('tab', { name: 'Second plan' });
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

void test('keeps the routed workspace mounted when logout fails', async () => {
  installWorkspaceFetch([createSessionFixture('plan-1', 'First plan')], {
    failLogout: true,
  });
  const user = userEvent.setup({ document: dom.window.document });
  render(
    <PathnameContext.Provider value="/workspace">
      <WorkspaceExperience initialAccount={account}>
        <p>Persistent workspace content</p>
      </WorkspaceExperience>
    </PathnameContext.Provider>,
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
  const user = userEvent.setup({ document: dom.window.document });
  const { container } = render(shellAt('/workspace', <p>Overview route body</p>));
  const opener = await screen.findByRole('button', { name: 'Open navigation' });

  await user.click(opener);
  const navigationDialog = await screen.findByRole('dialog', { name: 'Workspace navigation' });
  const dashboard = container.querySelector('.workspace-dashboard-surface');
  assert.equal(dashboard?.getAttribute('aria-hidden'), 'true');
  assert.equal(dashboard?.hasAttribute('inert'), true);
  assert.deepEqual(
    within(navigationDialog)
      .getAllByRole('link')
      .map((link) => link.getAttribute('aria-label')),
    ['Overview', 'Tasks', 'Resources'],
  );

  await user.click(within(navigationDialog).getByRole('button', { name: 'Close navigation' }));
  await waitFor(() => {
    assert.equal(dashboard?.hasAttribute('inert'), false);
    assert.equal(dom.window.document.activeElement, opener);
  });
});

function shellAt(pathname: string, children: ReactNode) {
  return (
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
  );
}

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
  options: { failLogout?: boolean } = {},
) {
  const requests: string[] = [];
  globalThis.fetch = (async (input, init) => {
    const path = input instanceof Request ? new URL(input.url).pathname : String(input);
    const method = init?.method ?? 'GET';
    requests.push(`${method} ${path}`);

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
  Object.defineProperty(globalObject, 'PointerEvent', {
    configurable: true,
    value: window.MouseEvent,
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
