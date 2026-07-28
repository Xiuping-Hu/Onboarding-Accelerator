import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BrandLoader } from './BrandLoader';

void test('brand loader exposes an accessible loading status and the favicon mark', () => {
  const markup = renderToStaticMarkup(<BrandLoader fullScreen />);

  assert.match(markup, /data-slot="brand-loader"/);
  assert.match(markup, /role="status"/);
  assert.match(markup, /aria-busy="true"/);
  assert.match(markup, /src="\/favicon.ico"/);
  assert.match(markup, /Onboarding Accelerator/);
  assert.match(markup, /Getting things ready/);
  assert.match(markup, /brand-loader--fullscreen/);
});

void test('brand loader accepts contextual copy and a shared layout class', () => {
  const markup = renderToStaticMarkup(
    <BrandLoader className="embedded-loader" message="Preparing your workspace" />,
  );

  assert.match(markup, /class="brand-loader embedded-loader"/);
  assert.match(markup, /Preparing your workspace/);
  assert.doesNotMatch(markup, /brand-loader--fullscreen/);
});
