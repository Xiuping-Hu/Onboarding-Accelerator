import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import React from 'react';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://onboarding.test/workspace',
});
installDomGlobals(dom.window);

const { cleanup, render, screen, within } = await import('@testing-library/react');
const userEvent = (await import('@testing-library/user-event')).default;
const { WorkspaceNavigation } = await import('./WorkspaceNavigation');

afterEach(() => cleanup());

void test('renders the exact workspace action inventory in the required order', () => {
  const { container } = render(
    <WorkspaceNavigation
      collapsed={false}
      onCollapsedChange={() => undefined}
      onSignOut={() => undefined}
      pathname="/workspace"
    />,
  );

  const navigation = screen.getByRole('navigation', { name: 'Primary navigation' });
  const destinationLinks = within(navigation).getAllByRole('link');
  assert.deepEqual(
    destinationLinks.map((link) => link.getAttribute('aria-label')),
    ['Overview', 'Tasks', 'Resources'],
  );
  assert.deepEqual(
    [...container.querySelectorAll('a, button')].map((action) => action.getAttribute('aria-label')),
    ['Overview', 'Tasks', 'Resources', 'Sign out', 'Collapse navigation'],
  );
  assert.equal(within(navigation).queryByRole('button', { name: 'Sign out' }), null);
  assert.ok(screen.getByRole('img', { name: 'Onboarding Accelerator' }));

  for (const removedLabel of [
    'My Onboarding',
    'People',
    'Analytics',
    'Settings',
    'Your plans',
    'New plan',
  ]) {
    assert.equal(screen.queryByText(removedLabel), null);
  }
});

void test('marks only the route-matching destination as the current page', () => {
  const rendered = render(
    <WorkspaceNavigation
      collapsed={false}
      onCollapsedChange={() => undefined}
      onSignOut={() => undefined}
      pathname="/workspace/tasks/assigned"
    />,
  );

  assert.equal(screen.getByRole('link', { name: 'Tasks' }).getAttribute('aria-current'), 'page');
  assert.equal(screen.getByRole('link', { name: 'Overview' }).getAttribute('aria-current'), null);
  assert.equal(screen.getByRole('link', { name: 'Resources' }).getAttribute('aria-current'), null);

  rendered.rerender(
    <WorkspaceNavigation
      collapsed={false}
      onCollapsedChange={() => undefined}
      onSignOut={() => undefined}
      pathname="/workspace/resources/"
    />,
  );

  assert.equal(
    screen.getByRole('link', { name: 'Resources' }).getAttribute('aria-current'),
    'page',
  );
  assert.equal(screen.getByRole('link', { name: 'Tasks' }).getAttribute('aria-current'), null);
});

void test('invokes the supplied sign-out action once', async () => {
  const user = userEvent.setup({ document: dom.window.document });
  let signOutCalls = 0;
  render(
    <WorkspaceNavigation
      collapsed={false}
      onCollapsedChange={() => undefined}
      onSignOut={() => {
        signOutCalls += 1;
      }}
      pathname="/workspace"
    />,
  );

  await user.click(screen.getByRole('button', { name: 'Sign out' }));

  assert.equal(signOutCalls, 1);
});

void test('exposes controlled collapse semantics and preserves toggle focus', async () => {
  const user = userEvent.setup({ document: dom.window.document });
  const requestedStates: boolean[] = [];
  const rendered = render(
    <WorkspaceNavigation
      collapsed={false}
      navigationId="employee-workspace-navigation"
      onCollapsedChange={(collapsed) => requestedStates.push(collapsed)}
      onSignOut={() => undefined}
      pathname="/workspace"
    />,
  );

  const collapseButton = screen.getByRole('button', { name: 'Collapse navigation' });
  assert.equal(collapseButton.getAttribute('aria-expanded'), 'true');
  assert.equal(collapseButton.getAttribute('aria-controls'), 'employee-workspace-navigation');
  collapseButton.focus();
  await user.keyboard('{Enter}');
  assert.deepEqual(requestedStates, [true]);
  assert.equal(dom.window.document.activeElement, collapseButton);

  rendered.rerender(
    <WorkspaceNavigation
      collapsed
      navigationId="employee-workspace-navigation"
      onCollapsedChange={(collapsed) => requestedStates.push(collapsed)}
      onSignOut={() => undefined}
      pathname="/workspace"
    />,
  );

  const expandButton = screen.getByRole('button', { name: 'Expand navigation' });
  assert.equal(expandButton.getAttribute('aria-expanded'), 'false');
  assert.equal(expandButton.textContent, '');
  await user.click(expandButton);
  assert.deepEqual(requestedStates, [true, false]);
});

void test('keeps collapsed actions named and provides tooltips for their hidden labels', async () => {
  const user = userEvent.setup({ document: dom.window.document });
  render(
    <WorkspaceNavigation
      collapsed
      onCollapsedChange={() => undefined}
      onSignOut={() => undefined}
      pathname="/workspace"
    />,
  );

  const overviewLink = screen.getByRole('link', { name: 'Overview' });
  const signOutButton = screen.getByRole('button', { name: 'Sign out' });
  assert.equal(overviewLink.getAttribute('aria-label'), 'Overview');
  assert.equal(signOutButton.getAttribute('aria-label'), 'Sign out');

  await user.hover(overviewLink);
  assert.equal((await screen.findByRole('tooltip')).textContent, 'Overview');
});

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
  globalObject.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.matchMedia = (query) => ({
    matches: false,
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
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.setPointerCapture = () => undefined;
  window.HTMLElement.prototype.releasePointerCapture = () => undefined;
}
