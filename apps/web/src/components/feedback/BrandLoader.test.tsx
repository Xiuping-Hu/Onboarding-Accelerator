import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BrandLoader } from './BrandLoader';

const loadingIcon = readFileSync(new URL('../../../public/loading-icon.png', import.meta.url));
const appIcon = readFileSync(new URL('../../app/icon.png', import.meta.url));

void test('brand loader exposes an accessible loading status and a purpose-sized mark', () => {
  const markup = renderToStaticMarkup(<BrandLoader fullScreen />);

  assert.match(markup, /data-slot="brand-loader"/);
  assert.match(markup, /role="status"/);
  assert.match(markup, /aria-busy="true"/);
  assert.match(markup, /src="\/loading-icon.png"/);
  assert.match(markup, /width="48"/);
  assert.match(markup, /height="48"/);
  assert.match(markup, /Onboarding Accelerator/);
  assert.match(markup, /Getting things ready/);
  assert.match(markup, /fixed inset-0/);
});

void test('keeps post-login icon assets within their network payload budgets', () => {
  assert.equal(loadingIcon.subarray(1, 4).toString(), 'PNG');
  assert.equal(loadingIcon.readUInt32BE(16), 64);
  assert.equal(loadingIcon.readUInt32BE(20), 64);
  assert.ok(loadingIcon.byteLength <= 8 * 1024);

  assert.equal(appIcon.subarray(1, 4).toString(), 'PNG');
  assert.equal(appIcon.readUInt32BE(16), 192);
  assert.equal(appIcon.readUInt32BE(20), 192);
  assert.ok(appIcon.byteLength <= 48 * 1024);
});

void test('brand loader accepts contextual copy and a shared layout class', () => {
  const markup = renderToStaticMarkup(
    <BrandLoader className="embedded-loader" message="Preparing your workspace" />,
  );

  assert.match(markup, /embedded-loader/);
  assert.match(markup, /Preparing your workspace/);
  assert.doesNotMatch(markup, /fixed inset-0/);
});
