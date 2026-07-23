import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Button } from './button';

void test('Button applies shadcn variants and composes custom button primitives', () => {
  const outline = renderToStaticMarkup(
    <Button size="sm" variant="outline">
      Cancel
    </Button>,
  );
  const composed = renderToStaticMarkup(
    <Button asChild variant="destructive">
      <a href="/confirm">Confirm</a>
    </Button>,
  );

  assert.match(outline, /ui-button--outline/);
  assert.match(outline, /ui-button--sm/);
  assert.match(composed, /<a[^>]*data-slot="button"/);
  assert.match(composed, /ui-button--destructive/);
});
