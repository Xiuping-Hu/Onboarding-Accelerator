import { createStep, createWorkflow } from '@mastra/core/workflows';
import type { SourceProvenance } from '@onboarding/shared';
import type { SessionRepository } from '../../sessionRepository';
import type { RagRetriever } from '../rag/rag.service';
import {
  CompletedPhaseSchema,
  PlanPartitionOutputSchema,
  PlanResumeSchema,
  PlanSuspendSchema,
  PlanningDataSchema,
  RefinementPartitionOutputSchema,
  RefinementResumeSchema,
  RefinementSuspendSchema,
  RunDataSchema,
  WorkflowOutputSchema,
  WorkflowRequestContextSchema,
  WorkflowStartInputSchema,
  WorkflowStateSchema,
  WORKFLOW_VERSION,
  type EvidenceReference,
  type FailurePacket,
  type WorkflowOutput,
  type WorkflowRequestContext,
} from './ragWorkflow.contracts';
import {
  buildPlan,
  correctPlanPhase,
  makeChoice,
  setGoal,
  validatePlan,
} from './ragWorkflow.planning';
import {
  buildRefinementContext,
  clarificationQuestions,
  refineInput,
  sha256,
} from './ragWorkflow.refinement';
import { WorkflowToolError, type WorkflowToolRegistry } from './ragWorkflow.tools';

export interface WorkflowAuditInput {
  runId: string;
  actorUserId: string;
  eventType: string;
  partition?: string;
  stepId?: string;
  phaseId?: string;
  planRevision?: number;
  reasonCode?: string;
  evidenceRefs?: string[];
  inputHash?: string;
  outputHash?: string;
  metadata?: Record<string, unknown>;
}

export interface RagWorkflowDependencies {
  sessions: SessionRepository;
  rag: RagRetriever;
  tools: WorkflowToolRegistry;
  refreshAuthorization?: (actor: WorkflowRequestContext) => Promise<WorkflowRequestContext>;
  audit?: (event: WorkflowAuditInput) => Promise<void>;
  onFinish?: (output: {
    runId: string;
    status: string;
    result?: WorkflowOutput;
    errorCode?: string;
  }) => Promise<void>;
}

export function createRagWorkflows(dependencies: RagWorkflowDependencies) {
  const resolveInput = createStep({
    id: 'resolve-input',
    inputSchema: WorkflowStartInputSchema,
    outputSchema: RefinementPartitionOutputSchema,
    requestContextSchema: WorkflowRequestContextSchema,
    execute: async ({ inputData, requestContext, runId }) => {
      const actor = actorContext(requestContext);
      const session = await dependencies.sessions.get(inputData.sessionId, actor.actorId);
      const refined = refineInput(inputData, buildRefinementContext(session, inputData));
      await safeAudit(dependencies, {
        runId,
        actorUserId: actor.actorId,
        eventType: 'refinement.resolved',
        partition: 'refinement',
        stepId: 'resolve-input',
        inputHash: refined.originalInputHash,
        metadata: {
          replacements: refined.resolvedReferences.length,
          termMappings: refined.termMappings.length,
          missingFields: refined.missingFields,
        },
      });
      return { input: inputData, refined };
    },
  });

  const refinementCheckpoint = createStep({
    id: 'refinement-checkpoint',
    inputSchema: RefinementPartitionOutputSchema,
    outputSchema: RefinementPartitionOutputSchema,
    suspendSchema: RefinementSuspendSchema,
    resumeSchema: RefinementResumeSchema,
    requestContextSchema: WorkflowRequestContextSchema,
    execute: async ({ inputData, requestContext, resumeData, suspend, runId }) => {
      if (inputData.refined.status === 'ready') return inputData;
      const actor = actorContext(requestContext);
      if (!resumeData) {
        const questions = clarificationQuestions(inputData.refined);
        await safeAudit(dependencies, {
          runId,
          actorUserId: actor.actorId,
          eventType: 'partition.suspended',
          partition: 'refinement',
          stepId: 'refinement-checkpoint',
          planRevision: 0,
          reasonCode: inputData.refined.missingFields.includes('referenced_entity')
            ? 'ambiguous_reference'
            : 'incomplete_context',
          metadata: { questions },
        });
        return suspend({
          step: 'refinement-checkpoint',
          reasonCode: inputData.refined.missingFields.includes('referenced_entity')
            ? 'ambiguous_reference'
            : 'incomplete_context',
          questions,
          refinementRevision: inputData.refined.revision,
        });
      }

      if (inputData.refined.revision >= 3) {
        return suspend({
          step: 'refinement-checkpoint',
          reasonCode: 'incomplete_context',
          questions: ['Please provide the unresolved target and desired result explicitly.'],
          refinementRevision: inputData.refined.revision,
        });
      }
      const session = await dependencies.sessions.get(inputData.input.sessionId, actor.actorId);
      const context = buildRefinementContext(session, inputData.input);
      const revised = refineInput(
        inputData.input,
        {
          ...context,
          referencedEntity: context.referencedEntity ?? {
            title: resumeData.clarification,
            evidenceRef: `clarification:${runId}:${inputData.refined.revision + 1}`,
          },
        },
        inputData.refined.revision + 1,
        resumeData.clarification,
      );
      await safeAudit(dependencies, {
        runId,
        actorUserId: actor.actorId,
        eventType: 'refinement.revised',
        partition: 'refinement',
        stepId: 'refinement-checkpoint',
        reasonCode: 'user_clarification',
        outputHash: sha256(revised.canonicalRequest),
        metadata: { refinementRevision: revised.revision },
      });
      return { input: inputData.input, refined: revised };
    },
  });

  const inputRefinementWorkflow = createWorkflow({
    id: 'input-refinement-v1',
    inputSchema: WorkflowStartInputSchema,
    outputSchema: RefinementPartitionOutputSchema,
    requestContextSchema: WorkflowRequestContextSchema,
    options: { shouldPersistSnapshot: () => true },
  })
    .then(resolveInput)
    .then(refinementCheckpoint)
    .commit();

  const goalStep = createStep({
    id: 'set-goal',
    inputSchema: RefinementPartitionOutputSchema,
    outputSchema: PlanningDataSchema,
    requestContextSchema: WorkflowRequestContextSchema,
    execute: async ({ inputData, requestContext, runId }) => {
      const actor = actorContext(requestContext);
      const goal = setGoal(inputData.refined);
      await safeAudit(dependencies, {
        runId,
        actorUserId: actor.actorId,
        eventType: 'goal.set',
        partition: 'plan',
        stepId: 'set-goal',
        outputHash: sha256(JSON.stringify(goal)),
      });
      return {
        ...inputData,
        goal,
        evidence: [],
        correctionCount: 0,
      };
    },
  });

  const checkContext = createStep({
    id: 'check-context',
    inputSchema: PlanningDataSchema,
    outputSchema: PlanningDataSchema,
    requestContextSchema: WorkflowRequestContextSchema,
    retries: 2,
    execute: async ({ inputData, requestContext, runId }) => {
      const actor = actorContext(requestContext);
      const retrieval = await dependencies.rag.retrieve(inputData.refined.canonicalRequest, {
        webSearchEnabled: inputData.input.webSearchEnabled,
        allowedAccessScopes: actor.accessScopes,
      });
      const evidence = retrieval.sources.map(toEvidenceReference);
      await safeAudit(dependencies, {
        runId,
        actorUserId: actor.actorId,
        eventType: 'context.retrieved',
        partition: 'plan',
        stepId: 'check-context',
        evidenceRefs: evidence.map((item) => item.id),
        metadata: { count: evidence.length, scopes: actor.accessScopes },
      });
      return { ...inputData, evidence };
    },
  });

  const chooseApproach = createStep({
    id: 'make-choice',
    inputSchema: PlanningDataSchema,
    outputSchema: PlanningDataSchema,
    requestContextSchema: WorkflowRequestContextSchema,
    execute: async ({ inputData, requestContext, runId }) => {
      const actor = actorContext(requestContext);
      const choice = makeChoice(inputData.refined, inputData.evidence);
      await safeAudit(dependencies, {
        runId,
        actorUserId: actor.actorId,
        eventType: 'choice.made',
        partition: 'plan',
        stepId: 'make-choice',
        evidenceRefs: choice.evidenceRefs,
        metadata: {
          approach: choice.approach,
          how: choice.how,
          why: choice.why,
        },
      });
      return { ...inputData, choice };
    },
  });

  const buildPhasePlan = createStep({
    id: 'build-phase-plan',
    inputSchema: PlanningDataSchema,
    outputSchema: PlanningDataSchema,
    requestContextSchema: WorkflowRequestContextSchema,
    execute: async ({ inputData }) => {
      if (!inputData.goal || !inputData.choice) {
        throw new Error('Goal and choice are required before plan construction.');
      }
      return {
        ...inputData,
        plan: buildPlan(inputData.refined, inputData.goal, inputData.evidence, inputData.choice),
      };
    },
  });

  const correctPhase = createStep({
    id: 'correct-phase',
    inputSchema: PlanningDataSchema,
    outputSchema: PlanningDataSchema,
    requestContextSchema: WorkflowRequestContextSchema,
    execute: async ({ inputData, requestContext, runId }) => {
      if (!inputData.failure) return inputData;
      if (!inputData.plan) throw new Error('A plan is required for phase correction.');
      if (inputData.correctionCount >= 3) {
        throw new Error('The phase correction limit was reached.');
      }
      const actor = actorContext(requestContext);
      const previousHash = inputData.plan.planHash;
      const plan = correctPlanPhase(inputData.plan, inputData.failure);
      await safeAudit(dependencies, {
        runId,
        actorUserId: actor.actorId,
        eventType: 'plan.corrected',
        partition: 'plan',
        stepId: 'correct-phase',
        phaseId: inputData.failure.phaseId,
        planRevision: plan.revision,
        reasonCode: inputData.failure.errorCode,
        evidenceRefs: inputData.failure.evidenceRefs,
        inputHash: previousHash,
        outputHash: plan.planHash,
      });
      return {
        ...inputData,
        plan,
        failure: undefined,
        correctionCount: inputData.correctionCount + 1,
      };
    },
  });

  const planCheckpoint = createStep({
    id: 'plan-checkpoint',
    inputSchema: PlanningDataSchema,
    outputSchema: PlanPartitionOutputSchema,
    suspendSchema: PlanSuspendSchema,
    resumeSchema: PlanResumeSchema,
    requestContextSchema: WorkflowRequestContextSchema,
    execute: async ({ inputData, requestContext, resumeData, suspend, runId }) => {
      if (!inputData.plan) throw new Error('Plan checkpoint requires a plan.');
      const actor = actorContext(requestContext);
      let plan = validatePlan(inputData.plan);

      if (!plan.contextAssessment.sufficient) {
        if (!resumeData?.clarification) {
          return suspend({
            step: 'plan-checkpoint',
            reasonCode: 'missing_evidence',
            questions: [
              'No current authorized evidence supports this request. Which approved source or additional context should be used?',
            ],
            planRevision: plan.revision,
          });
        }
        const retrieval = await dependencies.rag.retrieve(
          `${inputData.refined.canonicalRequest} ${resumeData.clarification}`,
          {
            webSearchEnabled: inputData.input.webSearchEnabled,
            allowedAccessScopes: actor.accessScopes,
          },
        );
        const evidence = retrieval.sources.map(toEvidenceReference);
        if (!evidence.length) {
          return suspend({
            step: 'plan-checkpoint',
            reasonCode: 'missing_evidence',
            questions: [
              'The clarification still has no authorized evidence. Provide an approved source.',
            ],
            planRevision: plan.revision,
          });
        }
        const goal = inputData.goal ?? setGoal(inputData.refined);
        const choice = makeChoice(inputData.refined, evidence);
        plan = buildPlan(inputData.refined, goal, evidence, choice);
      }

      const approvalRequired = plan.phases.some((phase) => phase.approval !== 'none');
      if (approvalRequired && resumeData?.approved !== true) {
        return suspend({
          step: 'plan-checkpoint',
          reasonCode: 'approval_required',
          questions: ['Approve the checked plan before the workflow invokes its protected tool.'],
          planRevision: plan.revision,
        });
      }

      await safeAudit(dependencies, {
        runId,
        actorUserId: actor.actorId,
        eventType: 'plan.checkpointed',
        partition: 'plan',
        stepId: 'plan-checkpoint',
        planRevision: plan.revision,
        evidenceRefs: plan.contextAssessment.evidenceRefs,
        outputHash: plan.planHash,
      });
      return {
        input: inputData.input,
        refined: inputData.refined,
        plan,
        correctionCount: inputData.correctionCount,
      };
    },
  });

  const planWorkflow = createWorkflow({
    id: 'plan-module-v1',
    inputSchema: RefinementPartitionOutputSchema,
    outputSchema: PlanPartitionOutputSchema,
    requestContextSchema: WorkflowRequestContextSchema,
    options: { shouldPersistSnapshot: () => true },
  })
    .then(goalStep)
    .then(checkContext)
    .then(chooseApproach)
    .then(buildPhasePlan)
    .then(correctPhase)
    .then(planCheckpoint)
    .commit();

  const preflight = createStep({
    id: 'preflight',
    inputSchema: PlanPartitionOutputSchema,
    outputSchema: RunDataSchema,
    requestContextSchema: WorkflowRequestContextSchema,
    execute: async ({ inputData, requestContext }) => {
      const actor = await refreshActor(dependencies, actorContext(requestContext));
      for (const phase of inputData.plan.phases) {
        const definition = dependencies.tools.definition(phase.toolId);
        if (!definition) throw new Error(`Unknown workflow tool: ${phase.toolId}`);
        if (!definition.allowedRoles.includes(actor.actorRole)) {
          throw new WorkflowToolError(
            'authorization',
            'tool_role_forbidden',
            'The current account cannot execute the plan.',
          );
        }
      }
      return RunDataSchema.parse({
        ...inputData,
        completedPhases: [],
        outputSummaries: [],
        status: 'running',
      });
    },
  });

  const executePhase = createStep({
    id: 'execute-phase',
    inputSchema: RunDataSchema,
    outputSchema: RunDataSchema,
    requestContextSchema: WorkflowRequestContextSchema,
    retries: 2,
    execute: async ({ inputData, requestContext, runId, retryCount }) => {
      if (inputData.status !== 'running') return inputData;
      const completedIds = new Set(inputData.completedPhases.map((phase) => phase.phaseId));
      const phase = inputData.plan.phases.find(
        (candidate) =>
          !completedIds.has(candidate.phaseId) &&
          candidate.dependsOn.every((dependency) => completedIds.has(dependency)),
      );
      if (!phase) {
        return RunDataSchema.parse({
          ...inputData,
          status: completedIds.size === inputData.plan.phases.length ? 'completed' : 'failed',
        });
      }

      const actor = await refreshActor(dependencies, actorContext(requestContext));
      const idempotencyKey = `${runId}:${phase.phaseId}:${phase.phaseRevision}`;
      await safeAudit(dependencies, {
        runId,
        actorUserId: actor.actorId,
        eventType: retryCount > 0 ? 'phase.retried' : 'phase.started',
        partition: 'run',
        stepId: 'execute-phase',
        phaseId: phase.phaseId,
        planRevision: inputData.plan.revision,
        inputHash: sha256(JSON.stringify(phase.input)),
        metadata: { retryCount, idempotencyKey },
      });

      try {
        const result = await dependencies.tools.execute(phase.toolId, phase.input, {
          runId,
          sessionId: inputData.input.sessionId,
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          accessScopes: actor.accessScopes,
          webSearchEnabled: inputData.input.webSearchEnabled,
          idempotencyKey,
          approved: phase.approval === 'none',
        });
        const outputHash = sha256(JSON.stringify(result.output));
        const completed = CompletedPhaseSchema.parse({
          phaseId: phase.phaseId,
          phaseRevision: phase.phaseRevision,
          idempotencyKey,
          outputHash,
          summary: result.summary,
          evidenceRefs: result.evidenceRefs,
        });
        await safeAudit(dependencies, {
          runId,
          actorUserId: actor.actorId,
          eventType: 'phase.completed',
          partition: 'run',
          stepId: 'execute-phase',
          phaseId: phase.phaseId,
          planRevision: inputData.plan.revision,
          evidenceRefs: result.evidenceRefs,
          outputHash,
        });
        const completedPhases = [...inputData.completedPhases, completed];
        return RunDataSchema.parse({
          ...inputData,
          completedPhases,
          outputSummaries: [...inputData.outputSummaries, result.summary],
          status: completedPhases.length === inputData.plan.phases.length ? 'completed' : 'running',
        });
      } catch (error) {
        if (error instanceof WorkflowToolError && error.failureClass === 'transient') {
          throw error;
        }
        const failure = failurePacket(error, {
          runId,
          planRevision: inputData.plan.revision,
          phaseId: phase.phaseId,
          phaseRevision: phase.phaseRevision,
          inputHash: sha256(JSON.stringify(phase.input)),
          completedPhaseIds: [...completedIds],
          evidenceRefs: phase.evidenceRefs,
        });
        await safeAudit(dependencies, {
          runId,
          actorUserId: actor.actorId,
          eventType: 'phase.failed',
          partition: 'run',
          stepId: 'execute-phase',
          phaseId: phase.phaseId,
          planRevision: inputData.plan.revision,
          reasonCode: failure.errorCode,
          evidenceRefs: failure.evidenceRefs,
        });
        return RunDataSchema.parse({
          ...inputData,
          failedPhase: failure,
          status:
            failure.failureClass === 'plan_defect' || failure.failureClass === 'verification'
              ? 'needs_correction'
              : 'failed',
        });
      }
    },
  });

  const synthesizeResult = createStep({
    id: 'synthesize-result',
    inputSchema: RunDataSchema,
    outputSchema: WorkflowOutputSchema,
    requestContextSchema: WorkflowRequestContextSchema,
    execute: async ({ inputData, runId }) =>
      WorkflowOutputSchema.parse({
        runId,
        status:
          inputData.status === 'completed'
            ? 'completed'
            : inputData.status === 'needs_correction'
              ? 'needs_correction'
              : 'failed',
        summary:
          inputData.outputSummaries.join('\n\n') ||
          inputData.failedPhase?.safeMessage ||
          'The workflow did not produce a result.',
        refined: inputData.refined,
        plan: inputData.plan,
        completedPhaseIds: inputData.completedPhases.map((phase) => phase.phaseId),
        evidenceRefs: [
          ...new Set(inputData.completedPhases.flatMap((phase) => phase.evidenceRefs)),
        ],
        corrections: inputData.correctionCount,
        ...(inputData.failedPhase ? { failure: inputData.failedPhase } : {}),
      }),
  });

  const runWorkflow = createWorkflow({
    id: 'run-module-v1',
    inputSchema: PlanPartitionOutputSchema,
    outputSchema: WorkflowOutputSchema,
    requestContextSchema: WorkflowRequestContextSchema,
    options: { shouldPersistSnapshot: () => true },
  })
    .then(preflight)
    .dowhile(
      executePhase,
      async ({ inputData }) =>
        inputData.status === 'running' &&
        inputData.completedPhases.length < inputData.plan.phases.length,
    )
    .then(synthesizeResult)
    .commit();

  const parentWorkflow = createWorkflow({
    id: WORKFLOW_VERSION,
    inputSchema: WorkflowStartInputSchema,
    outputSchema: WorkflowOutputSchema,
    stateSchema: WorkflowStateSchema,
    requestContextSchema: WorkflowRequestContextSchema,
    options: {
      shouldPersistSnapshot: () => true,
      onFinish: async (result) => {
        const output =
          result.status === 'success' ? WorkflowOutputSchema.safeParse(result.result) : undefined;
        await dependencies.onFinish?.({
          runId: result.runId,
          status: result.status,
          ...(output?.success ? { result: output.data } : {}),
          ...(result.error?.message ? { errorCode: 'workflow_execution_failed' } : {}),
        });
      },
    },
  })
    .then(inputRefinementWorkflow)
    .then(planWorkflow)
    .then(runWorkflow)
    .commit();

  return {
    parentWorkflow,
    inputRefinementWorkflow,
    planWorkflow,
    runWorkflow,
  };
}

function actorContext(requestContext: {
  get<T = unknown>(key: string): T;
}): WorkflowRequestContext {
  return WorkflowRequestContextSchema.parse({
    actorId: requestContext.get('actorId'),
    actorRole: requestContext.get('actorRole'),
    accessScopes: requestContext.get('accessScopes'),
    requestId: requestContext.get('requestId'),
  });
}

function toEvidenceReference(source: SourceProvenance): EvidenceReference {
  return {
    id: source.id,
    title: source.title,
    sourceType: source.sourceType ?? (source.kind === 'web' ? 'web' : 'knowledge_base'),
    sourceId: stringMetadata(source.metadata?.sourceId),
    sourceVersionId: stringMetadata(source.metadata?.sourceVersionId),
    sectionKey: stringMetadata(source.metadata?.sectionKey),
    score: source.score ?? source.confidence,
  };
}

function stringMetadata(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function failurePacket(
  error: unknown,
  base: Omit<FailurePacket, 'failureClass' | 'errorCode' | 'safeMessage'>,
): FailurePacket {
  if (error instanceof WorkflowToolError) {
    return {
      ...base,
      failureClass: error.failureClass,
      errorCode: error.code,
      safeMessage: error.message,
    };
  }
  return {
    ...base,
    failureClass: 'unexpected',
    errorCode: 'unexpected_tool_error',
    safeMessage: error instanceof Error ? error.message : 'Unexpected tool error.',
  };
}

async function safeAudit(
  dependencies: RagWorkflowDependencies,
  event: WorkflowAuditInput,
): Promise<void> {
  try {
    await dependencies.audit?.(event);
  } catch (error) {
    console.error('Failed to persist RAG workflow audit event.', error);
  }
}

async function refreshActor(
  dependencies: RagWorkflowDependencies,
  actor: WorkflowRequestContext,
): Promise<WorkflowRequestContext> {
  return dependencies.refreshAuthorization
    ? WorkflowRequestContextSchema.parse(await dependencies.refreshAuthorization(actor))
    : actor;
}
