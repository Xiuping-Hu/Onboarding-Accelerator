import { Mastra } from '@mastra/core';
import { PostgresStore } from '@mastra/pg';
import type { ServerConfig } from '../../config';
import type { RagWorkflowRepository } from './ragWorkflow.repository';
import { createRagWorkflows, type RagWorkflowDependencies } from './ragWorkflow.workflow';

interface CreateRagWorkflowRuntimeOptions {
  config: ServerConfig;
  repository: RagWorkflowRepository;
  dependencies: Omit<RagWorkflowDependencies, 'audit' | 'onFinish'>;
}

export function createRagWorkflowRuntime(options: CreateRagWorkflowRuntimeOptions) {
  if (!options.config.databaseUrl) {
    throw new Error('Mastra RAG workflows require DATABASE_URL.');
  }

  const workflows = createRagWorkflows({
    ...options.dependencies,
    audit: async (event) => {
      await options.repository.appendAudit({
        runId: event.runId,
        actorUserId: event.actorUserId,
        eventType: event.eventType,
        partition: event.partition,
        stepId: event.stepId,
        phaseId: event.phaseId,
        planRevision: event.planRevision,
        reasonCode: event.reasonCode,
        evidenceRefs: event.evidenceRefs ?? [],
        inputHash: event.inputHash,
        outputHash: event.outputHash,
        metadata: event.metadata ?? {},
      });
    },
    onFinish: async ({ runId, status, result, errorCode }) => {
      if (status === 'success' && result) {
        await options.repository.update(runId, {
          status: result.status === 'completed' ? 'completed' : 'failed',
          currentPartition: result.status === 'completed' ? 'complete' : 'run',
          planRevision: result.plan.revision,
          refinement: result.refined,
          plan: result.plan,
          result,
          lastFailure: result.failure,
          safeErrorCode: result.failure?.errorCode,
          ...(result.status === 'completed' ? { completedAt: new Date().toISOString() } : {}),
        });
      } else if (status === 'failed' || status === 'tripwire') {
        await options.repository.update(runId, {
          status: 'failed',
          currentPartition: 'run',
          safeErrorCode: errorCode ?? 'workflow_execution_failed',
        });
      }
    },
  });

  const storage = new PostgresStore({
    id: 'onboarding-rag-workflow-storage',
    connectionString: options.config.databaseUrl,
    schemaName: options.config.mastraStorageSchema,
    ssl: options.config.postgresSsl,
    max: options.config.mastraPostgresPoolMax,
    disableInit: options.config.mastraStorageDisableInit,
    retention: {
      workflows: {
        workflowSnapshot: {
          maxAge: `${options.config.mastraSnapshotRetentionDays}d`,
        },
      },
    },
  });
  const mastra = new Mastra({
    storage,
    logger: false,
    workflows: {
      onboardingRagAction: workflows.parentWorkflow,
      inputRefinement: workflows.inputRefinementWorkflow,
      planModule: workflows.planWorkflow,
      runModule: workflows.runWorkflow,
    },
  });

  return { mastra, storage, workflows };
}

export type RagWorkflowRuntime = ReturnType<typeof createRagWorkflowRuntime>;
