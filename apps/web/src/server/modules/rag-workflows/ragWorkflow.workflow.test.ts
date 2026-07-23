import assert from 'node:assert/strict';
import test from 'node:test';
import { Mastra } from '@mastra/core';
import { RequestContext } from '@mastra/core/request-context';
import type { OnboardingSession, SourceProvenance } from '@onboarding/shared';
import type { SessionRepository } from '../../sessionRepository';
import type { RagRetriever } from '../rag/rag.service';
import { WORKFLOW_VERSION, type WorkflowRequestContext } from './ragWorkflow.contracts';
import { createRagWorkflows } from './ragWorkflow.workflow';
import { createWorkflowToolRegistry } from './ragWorkflow.tools';

const session: OnboardingSession = {
  id: '00000000-0000-4000-8000-000000000010',
  title: 'Workflow test',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  settings: { webSearchEnabled: false },
  chatHistory: [],
  guide: { rootNodeIds: [], nodes: {}, expandedNodeIds: [] },
};

const source: SourceProvenance = {
  id: 'source-1',
  title: 'Approved onboarding source',
  excerpt: 'The approved onboarding process.',
  sourceType: 'knowledge_base',
  score: 0.95,
  metadata: {
    sourceId: 'root-source-1',
    sourceVersionId: 'source-version-1',
    sectionKey: 'overview',
  },
};

const sessions = {
  get: async () => structuredClone(session),
} as unknown as SessionRepository;

const rag: RagRetriever = {
  retrieve: async (query) => ({
    query,
    sources: [source],
    knowledgeBaseSources: [source],
    webSources: [],
  }),
};

function fixture() {
  const tools = createWorkflowToolRegistry({
    rag,
    answers: {
      answer: async () => ({ content: 'Grounded workflow answer.' }),
    },
  });
  const workflows = createRagWorkflows({ sessions, rag, tools });
  const mastra = new Mastra({
    logger: false,
    workflows: { onboardingRagAction: workflows.parentWorkflow },
  });
  return {
    workflow: mastra.getWorkflow('onboardingRagAction'),
    context: new RequestContext<WorkflowRequestContext>([
      ['actorId', 'user-1'],
      ['actorRole', 'user'],
      ['accessScopes', ['all_users']],
      ['requestId', 'request-1'],
    ]),
  };
}

void test('Mastra workflow executes all three partitions', async () => {
  const { workflow, context } = fixture();
  const run = await workflow.createRun();
  const result = await run.start({
    inputData: {
      sessionId: session.id,
      message: 'What is the approved onboarding process?',
      webSearchEnabled: false,
      clientRequestId: 'workflow-complete',
    },
    initialState: {
      workflowVersion: WORKFLOW_VERSION,
      currentPartition: 'refinement',
      status: 'running',
    },
    requestContext: context,
  });

  assert.equal(result.status, 'success');
  if (result.status !== 'success') return;
  assert.equal(result.result.status, 'completed');
  assert.deepEqual(result.result.completedPhaseIds, ['phase-grounded-answer']);
  assert.match(result.result.summary, /Grounded workflow answer/);
});

void test('Mastra workflow suspends and resumes at incomplete input', async () => {
  const { workflow, context } = fixture();
  const run = await workflow.createRun();
  const initial = await run.start({
    inputData: {
      sessionId: session.id,
      message: 'Update it.',
      webSearchEnabled: false,
      clientRequestId: 'workflow-suspend',
    },
    initialState: {
      workflowVersion: WORKFLOW_VERSION,
      currentPartition: 'refinement',
      status: 'running',
    },
    requestContext: context,
  });

  assert.equal(initial.status, 'suspended');
  const resumed = await run.resume({
    step: ['input-refinement-v1', 'refinement-checkpoint'],
    resumeData: { clarification: 'the approved onboarding process' },
    requestContext: context,
  });
  assert.equal(resumed.status, 'success');
});

void test('Mastra time travel corrects only the failed plan phase', async () => {
  const { workflow, context } = fixture();
  const run = await workflow.createRun();
  const initial = await run.start({
    inputData: {
      sessionId: session.id,
      message: 'Find the approved onboarding process.',
      webSearchEnabled: false,
      clientRequestId: 'workflow-correction',
    },
    initialState: {
      workflowVersion: WORKFLOW_VERSION,
      currentPartition: 'refinement',
      status: 'running',
    },
    requestContext: context,
  });

  assert.equal(initial.status, 'success');
  if (initial.status !== 'success') return;
  assert.equal(initial.result.status, 'needs_correction');
  assert.equal(initial.result.failure?.errorCode, 'knowledge_map_unavailable');

  const corrected = await run.timeTravel({
    step: ['plan-module-v1', 'correct-phase'],
    inputData: {
      input: initial.input,
      refined: initial.result.refined,
      evidence: [],
      plan: initial.result.plan,
      failure: initial.result.failure,
      correctionCount: initial.result.corrections,
    },
    requestContext: context,
  });

  assert.equal(corrected.status, 'success');
  if (corrected.status !== 'success') return;
  assert.equal(corrected.result.status, 'completed');
  assert.equal(corrected.result.plan.revision, 1);
  assert.deepEqual(corrected.result.completedPhaseIds, ['phase-knowledge-map-search']);
});
