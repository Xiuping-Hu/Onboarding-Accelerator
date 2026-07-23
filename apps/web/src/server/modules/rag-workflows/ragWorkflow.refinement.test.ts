import assert from 'node:assert/strict';
import test from 'node:test';
import type { OnboardingSession } from '@onboarding/shared';
import { buildRefinementContext, refineInput } from './ragWorkflow.refinement';

const baseSession: OnboardingSession = {
  id: '00000000-0000-4000-8000-000000000001',
  title: 'Test',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  settings: { webSearchEnabled: false },
  chatHistory: [],
  guide: {
    rootNodeIds: ['node-1'],
    expandedNodeIds: [],
    nodes: {
      'node-1': {
        id: 'node-1',
        title: 'Wayfinder onboarding checklist',
        summary: 'Checklist',
        children: [],
        depth: 0,
        status: 'generated',
        sources: [],
        canExpand: false,
        maxDepth: 2,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    },
  },
};

void test('refinement replaces pronouns and normalizes approved terminology', () => {
  const input = {
    sessionId: baseSession.id,
    message: 'Use it to update my training plan in the way-finder.',
    referencedNodeId: 'node-1',
    webSearchEnabled: false,
    clientRequestId: 'request-1',
  };
  const refined = refineInput(input, buildRefinementContext(baseSession, input));

  assert.equal(refined.status, 'ready');
  assert.match(refined.canonicalRequest, /Wayfinder onboarding checklist/);
  assert.match(refined.canonicalRequest, /onboarding plan/);
  assert.match(refined.canonicalRequest, /Wayfinder/);
  assert.equal(refined.resolvedReferences[0]?.evidenceRef, 'guide-node:node-1');
  assert.ok(refined.termMappings.some((mapping) => mapping.canonical === 'onboarding plan'));
});

void test('refinement suspends rather than guessing an unresolved pronoun', () => {
  const refined = refineInput(
    {
      sessionId: baseSession.id,
      message: 'Update it.',
      webSearchEnabled: false,
      clientRequestId: 'request-2',
    },
    {},
  );

  assert.equal(refined.status, 'needs_input');
  assert.ok(refined.missingFields.includes('referenced_entity'));
});
