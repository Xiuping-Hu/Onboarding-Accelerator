import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import React, { type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LoginScreen } from './LoginScreen';
import { MicrosoftSignInLink } from './MicrosoftSignInLink';

function renderDocument(node: ReactNode): Document {
  return new JSDOM(renderToStaticMarkup(node)).window.document;
}

function requireElement(root: ParentNode, selector: string): Element {
  const element = root.querySelector(selector);
  assert.ok(element, `Expected to find ${selector}`);
  return element;
}

function renderedText(root: Node): string {
  const textParts: string[] = [];

  function visit(node: Node): void {
    if (node.nodeType === node.TEXT_NODE) {
      const value = node.textContent?.replace(/\s+/g, ' ').trim();
      if (value) textParts.push(value);
      return;
    }

    node.childNodes.forEach(visit);
  }

  visit(root);
  return textParts.join(' ');
}

void test('renders the reference login copy in the expected landmark structure', () => {
  const document = renderDocument(<LoginScreen error={null} />);
  const main = requireElement(document, 'main[data-slot="login-shell"]');
  const background = requireElement(main, '[data-slot="login-background"][aria-hidden="true"]');
  const backgroundArt = requireElement(background, '[data-slot="login-background-art"]');
  const stage = requireElement(main, '[data-slot="login-stage"]');
  const layout = requireElement(stage, '[data-slot="login-layout"]');
  const brand = requireElement(layout, '[data-slot="login-brand"]');
  const panel = requireElement(layout, 'section[data-slot="login-panel"]');
  const heading = requireElement(panel, 'h1');
  const signInLink = requireElement(panel, 'a[href="/api/auth/microsoft/start"]');
  const pageText = renderedText(main);

  assert.equal(document.querySelectorAll('h1').length, 1);
  assert.equal(backgroundArt.children.length, 6);
  assert.equal(heading.textContent, 'Welcome back.');
  assert.equal(brand.getAttribute('aria-label'), 'Onboarding Accelerator');
  assert.equal(signInLink.textContent?.trim(), 'Continue with Microsoft');
  assert.match(
    pageText,
    /Sign in with your company Microsoft account to access Onboarding Accelerator\./,
  );
  assert.match(pageText, /Secure and trusted/);
  assert.match(pageText, /Secure sign-in with Microsoft/);
  assert.match(pageText, /Your organization’s data is protected\./);
});

void test('marks the people and security SVGs as decorative', () => {
  const document = renderDocument(<LoginScreen error={null} />);

  for (const selector of [
    'svg[data-slot="login-people-icon"]',
    'svg[data-slot="login-security-icon"]',
  ]) {
    const icon = requireElement(document, selector);
    assert.equal(icon.getAttribute('aria-hidden'), 'true');
    assert.equal(icon.getAttribute('focusable'), 'false');
  }
});

void test('preserves Microsoft routing while isolating the login presentation variant', () => {
  const loginDocument = renderDocument(<LoginScreen error={null} />);
  const loginLink = requireElement(loginDocument, 'a[href="/api/auth/microsoft/start"]');
  assert.equal(loginLink.getAttribute('data-auth-variant'), 'login');
  assert.ok(loginLink.hasAttribute('data-slot'));

  const reusableDocument = renderDocument(
    <MicrosoftSignInLink returnTo="/workspace/resources?scope=all" />,
  );
  const reusableLink = requireElement(reusableDocument, 'a');
  assert.equal(
    reusableLink.getAttribute('href'),
    '/api/auth/microsoft/start?returnTo=%2Fworkspace%2Fresources%3Fscope%3Dall',
  );
  assert.equal(reusableLink.getAttribute('data-auth-variant'), 'default');
  assert.ok(reusableLink.hasAttribute('data-slot'));
});

void test('renders the optional authentication error as an accessible alert', () => {
  const errorDocument = renderDocument(<LoginScreen error="Microsoft sign-in failed." />);
  const alert = requireElement(errorDocument, '[role="alert"]');
  assert.equal(alert.textContent, 'Microsoft sign-in failed.');

  const baselineDocument = renderDocument(<LoginScreen error={null} />);
  assert.equal(baselineDocument.querySelector('[role="alert"]'), null);
});

void test('renders the scalable scene and independent background artwork', () => {
  const document = renderDocument(<LoginScreen error={null} />);
  const backgroundArt = requireElement(document, '[data-slot="login-background-art"]');
  const layout = requireElement(document, '[data-slot="login-layout"]');

  assert.equal(backgroundArt.children.length, 6);
  assert.match(layout.className, /100cqw\/1536px/);
  assert.match(backgroundArt.className, /150dvh/);
});
