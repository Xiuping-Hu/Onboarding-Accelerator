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
      const text = node.textContent?.replace(/\s+/g, ' ').trim();
      if (text) {
        textParts.push(text);
      }
      return;
    }

    node.childNodes.forEach(visit);
  }

  visit(root);
  return textParts.join(' ');
}

void test('renders the reference login copy in the expected landmark structure', () => {
  const document = renderDocument(<LoginScreen error={null} />);
  const main = requireElement(document, 'main.login-shell');
  const brand = requireElement(main, '.login-brand');
  const panel = requireElement(main, 'section.login-panel');
  const heading = requireElement(panel, 'h1');
  const signInLink = requireElement(panel, 'a[href="/api/auth/microsoft/start"]');
  const pageText = renderedText(main);
  const brandName =
    brand.getAttribute('aria-label') ??
    brand.querySelector('[alt]')?.getAttribute('alt') ??
    renderedText(brand);

  assert.equal(document.querySelectorAll('h1').length, 1);
  assert.equal(heading.textContent, 'Welcome back.');
  assert.equal(brandName, 'Onboarding Accelerator');
  assert.equal(signInLink.textContent?.trim(), 'Continue with Microsoft');
  assert.match(
    pageText,
    /Sign in with your company Microsoft account to access Onboarding Accelerator\./,
  );
  assert.match(pageText, /Secure and trusted/);
  assert.match(pageText, /Secure sign-in with Microsoft/);
  assert.match(pageText, /Your organization’s data is protected\./);
  assert.doesNotMatch(pageText, /Sign in to your workspace/);
  assert.doesNotMatch(pageText, /Tax Consulting SA/);
});

void test('marks the people and security SVGs as decorative', () => {
  const document = renderDocument(<LoginScreen error={null} />);

  for (const selector of ['svg.login-people-icon', 'svg.login-security-icon']) {
    const icon = requireElement(document, selector);
    assert.equal(icon.getAttribute('aria-hidden'), 'true');
    assert.equal(icon.getAttribute('focusable'), 'false');
  }
});

void test('preserves Microsoft routing while isolating the login presentation variant', () => {
  const loginDocument = renderDocument(<LoginScreen error={null} />);
  const loginLink = requireElement(loginDocument, 'a[href="/api/auth/microsoft/start"]');
  assert.ok(loginLink.classList.contains('microsoft-login-button'));
  assert.ok(loginLink.classList.contains('microsoft-login-button--hero'));

  const reusableDocument = renderDocument(
    <MicrosoftSignInLink returnTo="/admin?tab=fees&scope=all" />,
  );
  const reusableLink = requireElement(reusableDocument, 'a');
  assert.equal(
    reusableLink.getAttribute('href'),
    '/api/auth/microsoft/start?returnTo=%2Fadmin%3Ftab%3Dfees%26scope%3Dall',
  );
  assert.ok(reusableLink.classList.contains('microsoft-login-button'));
  assert.ok(!reusableLink.classList.contains('microsoft-login-button--hero'));
});

void test('renders the optional authentication error as an accessible alert', () => {
  const errorDocument = renderDocument(<LoginScreen error="Microsoft sign-in failed." />);
  const alert = requireElement(errorDocument, '[role="alert"]');
  assert.equal(alert.textContent, 'Microsoft sign-in failed.');

  const baselineDocument = renderDocument(<LoginScreen error={null} />);
  assert.equal(baselineDocument.querySelector('[role="alert"]'), null);
});
