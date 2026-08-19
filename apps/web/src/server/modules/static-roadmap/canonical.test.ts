import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canonicalizeGeneratedRoadmap,
  hashRoadmapContent,
  StaticRoadmapValidationError,
} from './canonical';
import type { StaticRoadmapEvidence } from './types';

const evidence: StaticRoadmapEvidence[] = [
  {
    id: 'evidence-1',
    chunkId: 'version-1:chunk-1',
    sourceId: 'tax-consulting-sharepoint',
    sourceVersionId: 'version-1',
    embeddingProfileId: 'local:hash-v1:1536',
    title: 'Workflow guide',
    excerpt: 'Complete the review checklist before delivery.',
    queryIndex: 0,
    rank: 1,
    score: 0.9,
  },
];

function generated(completionCriteria = 'Complete the review checklist.') {
  return {
    title: 'Consulting onboarding',
    stages: [
      {
        stableKey: 'delivery',
        title: 'Delivery',
        description: 'Learn the delivery workflow.',
        position: 1,
        tasks: [
          {
            stableKey: 'review-checklist',
            title: 'Run the review',
            completionCriteria,
            sourceReferenceIds: ['evidence-1'],
          },
        ],
      },
    ],
    sourceReferences: ['evidence-1'],
  };
}

void test('canonicalization reuses lineage item IDs and hashes only user-visible semantics', () => {
  const first = canonicalizeGeneratedRoadmap({ generated: generated(), evidence });
  const second = canonicalizeGeneratedRoadmap({
    generated: { ...generated(), summary: 'A model-only summary is derivation metadata.' },
    evidence: [{ ...evidence[0]!, excerpt: 'New evidence wording.' }],
    lineageBase: first,
    priorSemanticsByKey: new Map([['review-checklist', first.stages[0]!.tasks[0]!.semanticsHash]]),
  });

  assert.equal(second.stages[0]?.id, first.stages[0]?.id);
  assert.equal(second.stages[0]?.tasks[0]?.id, first.stages[0]?.tasks[0]?.id);
  assert.equal(hashRoadmapContent(second), hashRoadmapContent(first));
  assert.match(second.sourceReferences[0]?.href ?? '', /^\/api\/onboarding\/evidence\//);
});

void test('content hashing treats dependency sets as unordered', () => {
  const first = canonicalizeGeneratedRoadmap({ generated: generated(), evidence });
  const left = structuredClone(first);
  const right = structuredClone(first);
  left.stages[0]!.dependsOnStageKeys = ['beta', 'alpha'];
  right.stages[0]!.dependsOnStageKeys = ['alpha', 'beta'];
  left.stages[0]!.tasks[0]!.dependsOnTaskKeys = ['task-b', 'task-a'];
  right.stages[0]!.tasks[0]!.dependsOnTaskKeys = ['task-a', 'task-b'];

  assert.equal(hashRoadmapContent(left), hashRoadmapContent(right));
});

void test('a historical task key cannot be reused with changed completion semantics', () => {
  const lineageBase = canonicalizeGeneratedRoadmap({ generated: generated(), evidence });
  const prior = lineageBase.stages[0]!.tasks[0]!.semanticsHash;

  assert.throws(
    () =>
      canonicalizeGeneratedRoadmap({
        generated: generated('Pass a certification exam.'),
        evidence,
        priorSemanticsByKey: new Map([['review-checklist', prior]]),
        lineageBase,
      }),
    (error) =>
      error instanceof StaticRoadmapValidationError && /use a new key/i.test(error.message),
  );
});

void test('removed task and stage keys cannot be recycled from canonical history', () => {
  const historical = canonicalizeGeneratedRoadmap({ generated: generated(), evidence });
  const current = canonicalizeGeneratedRoadmap({
    generated: {
      ...generated(),
      stages: [
        {
          ...generated().stages[0]!,
          stableKey: 'current-delivery',
          tasks: [
            {
              ...generated().stages[0]!.tasks[0]!,
              stableKey: 'current-review',
            },
          ],
        },
      ],
    },
    evidence,
  });

  assert.throws(
    () =>
      canonicalizeGeneratedRoadmap({
        generated: generated(),
        evidence,
        lineageBase: current,
        priorSemanticsByKey: new Map([
          ['review-checklist', historical.stages[0]!.tasks[0]!.semanticsHash],
        ]),
        priorStageKeys: new Set(['delivery', 'current-delivery']),
      }),
    (error) =>
      error instanceof StaticRoadmapValidationError &&
      /Stage key delivery.*cannot be recycled/i.test(error.message),
  );

  assert.throws(
    () =>
      canonicalizeGeneratedRoadmap({
        generated: {
          ...generated(),
          stages: [
            {
              ...generated().stages[0]!,
              stableKey: 'current-delivery',
            },
          ],
        },
        evidence,
        lineageBase: current,
        priorSemanticsByKey: new Map([
          ['review-checklist', historical.stages[0]!.tasks[0]!.semanticsHash],
        ]),
        priorStageKeys: new Set(['delivery', 'current-delivery']),
      }),
    (error) =>
      error instanceof StaticRoadmapValidationError &&
      /Task key review-checklist.*cannot be recycled/i.test(error.message),
  );
});
