import assert from 'node:assert/strict';
import test from 'node:test';
import type { GuideGraph } from '@onboarding/shared';
import {
  clampCanvasScale,
  getAssistantDrawerToggleLabel,
  getSelectedGuideStep,
  getVisibleGraph,
  getZoomedCanvasView,
} from './app/workspace/App';

const graph: GuideGraph = {
  rootId: 'root',
  steps: [
    {
      id: 'root',
      title: 'Root',
      summary: 'Root',
      status: 'in-progress',
      depth: 0,
      childIds: ['a', 'b', 'c'],
    },
    {
      id: 'a',
      title: 'A',
      summary: 'A',
      status: 'ready',
      depth: 1,
      parentId: 'root',
      childIds: ['a1', 'a2', 'a3'],
    },
    {
      id: 'b',
      title: 'B',
      summary: 'B',
      status: 'ready',
      depth: 1,
      parentId: 'root',
      childIds: [],
    },
    {
      id: 'c',
      title: 'C',
      summary: 'C',
      status: 'ready',
      depth: 1,
      parentId: 'root',
      childIds: [],
    },
    {
      id: 'a1',
      title: 'A1',
      summary: 'A1',
      status: 'ready',
      depth: 2,
      parentId: 'a',
      childIds: ['a1a'],
    },
    {
      id: 'a2',
      title: 'A2',
      summary: 'A2',
      status: 'ready',
      depth: 2,
      parentId: 'a',
      childIds: [],
    },
    {
      id: 'a3',
      title: 'A3',
      summary: 'A3',
      status: 'ready',
      depth: 2,
      parentId: 'a',
      childIds: [],
    },
    {
      id: 'a1a',
      title: 'A1A',
      summary: 'A1A',
      status: 'ready',
      depth: 3,
      parentId: 'a1',
      childIds: [],
    },
  ],
  edges: [
    { id: 'root-a', from: 'root', to: 'a' },
    { id: 'root-b', from: 'root', to: 'b' },
    { id: 'root-c', from: 'root', to: 'c' },
    { id: 'a-a1', from: 'a', to: 'a1' },
    { id: 'a-a2', from: 'a', to: 'a2' },
    { id: 'a-a3', from: 'a', to: 'a3' },
    { id: 'a1-a1a', from: 'a1', to: 'a1a' },
  ],
  sources: [],
};

void test('selected root branch hides sibling branches', () => {
  const visible = getVisibleGraph(graph, 'a');

  assert.deepEqual(
    visible?.steps.map((step) => step.id),
    ['root', 'a', 'a1', 'a2', 'a3', 'a1a'],
  );
  assert.equal(
    visible?.steps.some((step) => step.id === 'b'),
    false,
  );
  assert.equal(
    visible?.steps.some((step) => step.id === 'c'),
    false,
  );
});

void test('selecting a child hides its sibling nodes while keeping ancestors and descendants', () => {
  const visible = getVisibleGraph(graph, 'a1');

  assert.deepEqual(
    visible?.steps.map((step) => step.id),
    ['root', 'a', 'a1', 'a1a'],
  );
  assert.equal(
    visible?.steps.some((step) => step.id === 'a2'),
    false,
  );
  assert.equal(
    visible?.steps.some((step) => step.id === 'a3'),
    false,
  );
});

void test('selected guide step resolves the agent drawer focus', () => {
  const selected = getSelectedGuideStep(graph, 'a1');

  assert.equal(selected?.id, 'a1');
  assert.equal(selected?.title, 'A1');
  assert.equal(getSelectedGuideStep(graph, 'missing'), null);
});

void test('assistant drawer toggle label reflects collapsed state', () => {
  assert.equal(getAssistantDrawerToggleLabel(true), 'Open agent drawer');
  assert.equal(getAssistantDrawerToggleLabel(false), 'Close agent drawer');
});

void test('canvas zoom is clamped to supported scale limits', () => {
  assert.equal(clampCanvasScale(0.1), 0.65);
  assert.equal(clampCanvasScale(1), 1);
  assert.equal(clampCanvasScale(4), 1.45);
});

void test('canvas zoom keeps the zoom anchor fixed in screen space', () => {
  const nextView = getZoomedCanvasView(
    { offsetX: 100, offsetY: 50, scale: 1 },
    { x: 300, y: 250 },
    1.25,
  );

  assert.deepEqual(nextView, {
    offsetX: 50,
    offsetY: 0,
    scale: 1.25,
  });
});
