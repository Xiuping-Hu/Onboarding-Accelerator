import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DataTable } from './DataTable';
import { MetricGrid } from './MetricGrid';

void test('DataTable renders stable rows and a neutral empty state', () => {
  const populated = renderToStaticMarkup(
    <DataTable
      columns={[{ id: 'name', header: 'Name' }]}
      rows={[{ id: 'first', cells: ['First row'] }]}
    />,
  );
  const empty = renderToStaticMarkup(
    <DataTable columns={[{ id: 'name', header: 'Name' }]} rows={[]} />,
  );

  assert.match(populated, /<th scope="col">Name<\/th>/);
  assert.match(populated, /First row/);
  assert.match(empty, /No records\./);
});

void test('MetricGrid renders domain-neutral labels and values', () => {
  const markup = renderToStaticMarkup(
    <MetricGrid metrics={[{ id: 'total', label: 'Total', value: '12' }]} />,
  );

  assert.match(markup, /<small>Total<\/small>/);
  assert.match(markup, /<strong>12<\/strong>/);
});
