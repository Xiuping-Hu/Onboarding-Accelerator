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

const sources = [
  {
    id: 'handbook',
    title: 'Employee handbook',
    excerpt: 'Read the handbook.',
    href: '/api/sources/handbook',
  },
  {
    id: 'policy',
    title: 'Security policy',
    excerpt: 'Follow the security policy.',
    href: '/api/sources/policy',
  },
];

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

void test('places each source icon immediately after its referenced content', () => {
  const output = renderToStaticMarkup(
    <TypedMarkdown
      animate={false}
      content="Read the handbook. [[1]] Then complete security training. [[2]]"
      onComplete={() => undefined}
      sources={sources}
    />,
  );

  const firstContent = output.indexOf('Read the handbook.');
  const firstIcon = output.indexOf('Show 1 source for the preceding content');
  const secondContent = output.indexOf('Then complete security training.');
  const secondIcon = output.indexOf('Show 1 source for the preceding content', firstIcon + 1);

  assert.ok(firstContent < firstIcon);
  assert.ok(firstIcon < secondContent);
  assert.ok(secondContent < secondIcon);
  assert.doesNotMatch(output, /\[\[[12]\]\]/);
});

void test('supports multiple sources on one inline reference', () => {
  const output = renderToStaticMarkup(
    <TypedMarkdown
      animate={false}
      content="This step is supported by both policies. [[1, 2]]"
      onComplete={() => undefined}
      sources={sources}
    />,
  );

  assert.match(output, /Show 2 sources for the preceding content/);
});

void test('fails closed when an inline reference points to a missing source', () => {
  const output = renderToStaticMarkup(
    <TypedMarkdown
      animate={false}
      content="This claim has an invalid source. [[3]]"
      onComplete={() => undefined}
      sources={sources}
    />,
  );

  assert.match(output, /Sources are temporarily unavailable/);
  assert.doesNotMatch(output, /\[\[3\]\]/);
});
