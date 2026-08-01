import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TypedMarkdown } from './TypedMarkdown';

function render(content: string) {
  return renderToStaticMarkup(
    <TypedMarkdown animate={false} content={content} onComplete={() => undefined} />,
  );
}

void test('renders Markdown and GFM HTTP links as safe new-tab anchors', () => {
  const markdown = render('[Handbook](https://example.com/handbook)');
  const bareUrl = render('See https://example.com/policy for details.');

  assert.match(markdown, /href="https:\/\/example\.com\/handbook"/);
  assert.match(markdown, /target="_blank"/);
  assert.match(markdown, /rel="noopener noreferrer"/);
  assert.match(markdown, /opens in a new tab/);
  assert.match(bareUrl, /href="https:\/\/example\.com\/policy"/);
});

void test('renders disallowed Markdown destinations as plain readable text', () => {
  const unsafe = render('[Unsafe](javascript:alert(1))');
  const relative = render('[Workspace](/workspace)');

  assert.doesNotMatch(unsafe, /<a/);
  assert.match(unsafe, />Unsafe</);
  assert.doesNotMatch(relative, /<a/);
  assert.match(relative, />Workspace</);
});
