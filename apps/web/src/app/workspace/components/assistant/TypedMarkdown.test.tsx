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
      citationSegments={[
        { markdown: 'Read the handbook.', sourceIds: ['handbook'] },
        { markdown: 'Then complete security training.', sourceIds: ['policy'] },
      ]}
      content="Read the handbook.\n\nThen complete security training."
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
});

void test('supports multiple sources on one inline reference', () => {
  const output = renderToStaticMarkup(
    <TypedMarkdown
      animate={false}
      citationSegments={[
        {
          markdown: 'This step is supported by both policies.',
          sourceIds: ['handbook', 'policy'],
        },
      ]}
      content="This step is supported by both policies."
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
      citationSegments={[{ markdown: 'This claim has an invalid source.', sourceIds: ['missing'] }]}
      content="This claim has an invalid source."
      onComplete={() => undefined}
      sources={sources}
    />,
  );

  assert.match(output, /Sources are temporarily unavailable/);
});

void test('keeps an aggregate source control for a legacy unstructured answer', () => {
  const output = renderToStaticMarkup(
    <TypedMarkdown
      animate={false}
      content="Historical answer without structured citations. [[1]]"
      onComplete={() => undefined}
      sources={sources}
    />,
  );

  assert.ok(
    output.indexOf('Historical answer without structured citations.') <
      output.indexOf('Show 2 sources for this response'),
  );
  assert.doesNotMatch(output, /\[\[1\]\]/);
});
