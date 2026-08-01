import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import React from 'react';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://onboarding.test/workspace',
});
installDomGlobals(dom.window);

const { cleanup, render, screen } = await import('@testing-library/react');
const userEvent = (await import('@testing-library/user-event')).default;
const { AssistantSourcesPopover } = await import('./AssistantSourcesPopover');

afterEach(() => cleanup());

void test('opens the source popover with keyboard focus and restores focus on Escape', async () => {
  const user = userEvent.setup({ document: dom.window.document });
  render(
    <AssistantSourcesPopover
      sources={[
        {
          id: 'handbook',
          title: 'Employee handbook',
          excerpt: 'Read the handbook.',
          href: '/api/sources/handbook',
          sourceType: 'knowledge_base',
        },
        {
          id: 'policy',
          title: 'Public policy',
          excerpt: 'Read the policy.',
          href: 'https://example.com/policy',
          sourceType: 'web',
        },
      ]}
    />,
  );

  const trigger = screen.getByRole('button', { name: 'Show 2 sources for this response' });
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  assert.ok(trigger.getAttribute('aria-controls'));

  trigger.focus();
  await user.keyboard('{Enter}');

  const links = screen.getAllByRole('link');
  assert.equal(trigger.getAttribute('aria-expanded'), 'true');
  assert.equal(screen.getByRole('heading').textContent, 'Sources for this response');
  assert.equal(dom.window.document.activeElement, links[0]);
  assert.equal(links[0]?.getAttribute('target'), '_blank');
  assert.equal(links[0]?.getAttribute('rel'), 'noopener noreferrer');

  await user.keyboard('{Escape}');

  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(dom.window.document.activeElement, trigger);
});

void test('closes without trapping focus when Tab leaves the final source link', async () => {
  const user = userEvent.setup({ document: dom.window.document });
  render(
    <>
      <AssistantSourcesPopover
        sources={[
          {
            id: 'handbook',
            title: 'Employee handbook',
            excerpt: 'Read the handbook.',
            href: '/api/sources/handbook',
          },
        ]}
      />
      <button type="button">After sources</button>
    </>,
  );

  const trigger = screen.getByRole('button', { name: 'Show 1 source for this response' });
  await user.click(trigger);
  await user.tab();

  assert.equal(dom.window.document.activeElement?.textContent, 'After sources');
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
});

void test('renders a generic error instead of partial source metadata', () => {
  render(
    <AssistantSourcesPopover
      sources={[{ id: 'missing', title: 'Private title', excerpt: 'Private excerpt' }]}
    />,
  );

  assert.equal(screen.getByRole('status').textContent, 'Sources are temporarily unavailable.');
  assert.equal(screen.queryByText('Private title'), null);
  assert.equal(screen.queryByRole('button'), null);
});

void test('renders nothing for an empty source set', () => {
  const { container } = render(<AssistantSourcesPopover sources={[]} />);

  assert.equal(container.textContent, '');
  assert.equal(screen.queryByRole('button'), null);
  assert.equal(screen.queryByRole('dialog'), null);
});

void test('supports Space, outside-click close, and message unmount cleanup', async () => {
  const user = userEvent.setup({ document: dom.window.document });
  const rendered = render(
    <AssistantSourcesPopover
      sources={[
        {
          id: 'handbook',
          title: 'Employee handbook',
          href: '/api/sources/handbook',
          excerpt: 'Read the handbook.',
        },
      ]}
    />,
  );

  const trigger = screen.getByRole('button', { name: 'Show 1 source for this response' });
  trigger.focus();
  await user.keyboard(' ');
  assert.ok(screen.getByRole('dialog'));

  await user.click(dom.window.document.body);
  assert.equal(screen.queryByRole('dialog'), null);
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');

  await user.click(trigger);
  assert.ok(screen.getByRole('dialog'));
  rendered.unmount();
  assert.equal(screen.queryByRole('dialog'), null);
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
  window.HTMLElement.prototype.scrollIntoView = () => undefined;
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.setPointerCapture = () => undefined;
  window.HTMLElement.prototype.releasePointerCapture = () => undefined;
}
