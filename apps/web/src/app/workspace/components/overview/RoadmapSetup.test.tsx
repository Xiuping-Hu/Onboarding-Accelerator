import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WorkspaceRouteProvider, type WorkspaceRouteState } from '../WorkspaceRouteContext';
import { RoadmapSection } from './RoadmapSection';
import { RoadmapSetup } from './RoadmapSetup';

Object.assign(globalThis, { React });

void test('offers AI generation without a manual roadmap creation path', () => {
  const html = renderToStaticMarkup(
    <WorkspaceRouteProvider
      value={
        {
          onGenerateRoadmap: async () => undefined,
          roadmapIsMutating: false,
        } as WorkspaceRouteState
      }
    >
      <RoadmapSetup />
    </WorkspaceRouteProvider>,
  );

  assert.match(html, /Generate your live roadmap/);
  assert.match(html, /Generate with AI/);
  assert.doesNotMatch(html, /Create manually|Manual roadmap title/);
});

void test('shows AI setup instead of the editor for a legacy empty active roadmap', () => {
  const html = renderToStaticMarkup(
    <WorkspaceRouteProvider
      value={
        {
          onGenerateRoadmap: async () => undefined,
          roadmapIsMutating: false,
        } as WorkspaceRouteState
      }
    >
      <RoadmapSection
        isLoading={false}
        onReferenceStep={() => undefined}
        roadmap={{ status: 'empty', stages: [], reason: 'no-roadmap-content' }}
      />
    </WorkspaceRouteProvider>,
  );

  assert.match(html, /Generate with AI/);
  assert.doesNotMatch(html, /Live roadmap editor|Add stage|Cancel process/);
});
