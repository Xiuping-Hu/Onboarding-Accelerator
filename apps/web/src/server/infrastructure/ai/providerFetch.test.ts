import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveProviderProxyUrl } from './providerFetch';

void test('Vercel ignores proxy URLs that only exist on the developer machine', () => {
  assert.equal(resolveProviderProxyUrl('http://127.0.0.1:10808', true), undefined);
  assert.equal(resolveProviderProxyUrl('http://localhost:10808', true), undefined);
  assert.equal(resolveProviderProxyUrl('http://[::1]:10808', true), undefined);
});

void test('local development and remote proxies remain configurable', () => {
  assert.equal(resolveProviderProxyUrl('http://127.0.0.1:10808', false), 'http://127.0.0.1:10808');
  assert.equal(
    resolveProviderProxyUrl('https://proxy.example.com', true),
    'https://proxy.example.com',
  );
});
