import { randomUUID } from 'node:crypto';
import { RequestContext } from '@mastra/core/request-context';
import type {
  CorrectRagWorkflowRequest,
  RagWorkflowEventsResponse,
  RagWorkflowPlanSummary,
  RagWorkflowResponse,
  ResumeRagWorkflowRequest,
  StartRagWorkflowRequest,
} from '@onboarding/shared';
import type { AuthenticatedUser } from '../../auth';
import { AppError } from '../../core/errors/appError';
import type { SessionRepository } from '../../sessionRepository';
import {
  ExecutionPlanSchema,
  FailurePacketSchema,
  RefinedRequestSchema,
  WorkflowOutputSchema,
  WorkflowStartInputSchema,
  WORKFLOW_VERSION,
  type ExecutionPlan,
  type FailurePacket,
  type PlanningData,
  type WorkflowOutput,
  type WorkflowRequestContext,
} from './ragWorkflow.contracts';
import type { RagWorkflowRepository, RagWorkflowRunRecord } from './ragWorkflow.repository';
import type { RagWorkflowRuntime } from './ragWorkflow.runtime';

interface RagWorkflowServiceOptions {
  enabled: boolean;
  sessions: SessionRepository;
  repository: RagWorkflowRepository;
  runtime?: RagWorkflowRuntime;
  resolveAccessScopes(userId: string): Promise<string[]>;
}

type MastraResultLike =
  | {
      status: 'success';
      result: unknown;
    }
  | {
      status: 'suspended';
      suspendPayload?: unknown;
    }
  | {
      status: 'failed' | 'tripwire' | 'paused';
      error?: { message?: string } | Error;
    };

interface TimeTravelRun {
  timeTravel(args: {
    step: string[];
    inputData: PlanningData;
    requestContext: RequestContext<WorkflowRequestContext>;
  }): Promise<MastraResultLike>;
}

export class RagWorkflowService {
  constructor(private readonly options: RagWorkflowServiceOptions) {}

  async start(
    sessionId: string,
    request: StartRagWorkflowRequest,
    user: AuthenticatedUser,
    requestId: string,
  ): Promise<RagWorkflowResponse> {
    const runtime = this.requireRuntime();
    await this.options.sessions.get(sessionId, user.id);
    const input = WorkflowStartInputSchema.parse({ ...request, sessionId });
    const existing = await this.options.repository.findByClientRequest(
      user.id,
      sessionId,
      input.clientRequestId,
    );
    if (existing) return this.toResponse(existing);

    const now = new Date().toISOString();
    const runId = randomUUID();
    let record = await this.options.repository.create({
      id: runId,
      workflowVersion: WORKFLOW_VERSION,
      sessionId,
      ownerId: user.id,
      clientRequestId: input.clientRequestId,
      status: 'running',
      currentPartition: 'refinement',
      planRevision: 0,
      requestInput: input,
      createdAt: now,
      updatedAt: now,
    });
    await this.options.repository.appendAudit({
      runId,
      actorUserId: user.id,
      eventType: 'workflow.started',
      partition: 'refinement',
      evidenceRefs: [],
      metadata: { workflowVersion: WORKFLOW_VERSION, requestId },
    });

    const requestContext = await this.requestContext(user, requestId);
    const run = await runtime.workflows.parentWorkflow.createRun({
      runId,
      resourceId: sessionId,
    });
    const result = (await run.start({
      inputData: input,
      initialState: {
        workflowVersion: WORKFLOW_VERSION,
        currentPartition: 'refinement',
        status: 'running',
      },
      requestContext,
    })) as MastraResultLike;
    record = await this.persistResult(record, result, user.id);

    const output =
      result.status === 'success' ? WorkflowOutputSchema.safeParse(result.result) : null;
    if (
      output?.success &&
      output.data.status === 'needs_correction' &&
      output.data.failure &&
      output.data.corrections < 3
    ) {
      record = await this.timeTravelCorrection(
        record,
        output.data.failure,
        output.data,
        requestContext,
        user.id,
      );
    }
    return this.toResponse(record);
  }

  async get(
    sessionId: string,
    runId: string,
    user: AuthenticatedUser,
  ): Promise<RagWorkflowResponse> {
    return this.toResponse(await this.requireOwnedRun(sessionId, runId, user.id));
  }

  async events(
    sessionId: string,
    runId: string,
    user: AuthenticatedUser,
  ): Promise<RagWorkflowEventsResponse> {
    await this.requireOwnedRun(sessionId, runId, user.id);
    const events = await this.options.repository.listAudit(runId);
    return {
      events: events.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        partition: event.partition,
        stepId: event.stepId,
        phaseId: event.phaseId,
        planRevision: event.planRevision,
        reasonCode: event.reasonCode,
        eventAt: event.eventAt,
        metadata: event.metadata,
      })),
    };
  }

  async resume(
    sessionId: string,
    runId: string,
    request: ResumeRagWorkflowRequest,
    user: AuthenticatedUser,
    requestId: string,
  ): Promise<RagWorkflowResponse> {
    const runtime = this.requireRuntime();
    const record = await this.requireOwnedRun(sessionId, runId, user.id);
    if (record.status !== 'suspended') {
      throw AppError.conflict('Only a suspended workflow can be resumed.');
    }
    const stepPath =
      request.step === 'refinement-checkpoint'
        ? ['input-refinement-v1', request.step]
        : ['plan-module-v1', request.step];
    const requestContext = await this.requestContext(user, requestId);
    const run = await runtime.workflows.parentWorkflow.createRun({
      runId,
      resourceId: sessionId,
    });
    await this.options.repository.appendAudit({
      runId,
      actorUserId: user.id,
      eventType: 'workflow.resumed',
      partition: record.currentPartition,
      stepId: request.step,
      evidenceRefs: [],
      metadata: { requestId },
    });
    const result = (await run.resume({
      step: stepPath,
      resumeData:
        request.step === 'refinement-checkpoint'
          ? { clarification: request.clarification }
          : {
              clarification: request.clarification,
              approved: request.approved,
            },
      requestContext,
    })) as MastraResultLike;
    return this.toResponse(await this.persistResult(record, result, user.id));
  }

  async correct(
    sessionId: string,
    runId: string,
    request: CorrectRagWorkflowRequest,
    user: AuthenticatedUser,
    requestId: string,
  ): Promise<RagWorkflowResponse> {
    const record = await this.requireOwnedRun(sessionId, runId, user.id);
    if (!record.plan || !record.refinement) {
      throw AppError.conflict('The workflow has no checked plan to correct.');
    }
    const plan = ExecutionPlanSchema.parse(record.plan);
    const existingFailure = FailurePacketSchema.safeParse(record.lastFailure);
    const failedPhase = plan.phases.find((phase) => phase.phaseId === request.phaseId);
    if (!failedPhase) throw AppError.validation('The requested phase does not exist.');
    const output = WorkflowOutputSchema.safeParse(record.result);
    const failure: FailurePacket = existingFailure.success
      ? {
          ...existingFailure.data,
          safeMessage: request.reason,
        }
      : {
          runId,
          planRevision: plan.revision,
          phaseId: failedPhase.phaseId,
          phaseRevision: failedPhase.phaseRevision,
          failureClass: 'plan_defect',
          errorCode: 'user_requested_correction',
          safeMessage: request.reason,
          inputHash: '',
          completedPhaseIds: output.success ? output.data.completedPhaseIds : [],
          evidenceRefs: failedPhase.evidenceRefs,
        };
    const requestContext = await this.requestContext(user, requestId);
    return this.toResponse(
      await this.timeTravelCorrection(
        record,
        failure,
        output.success ? output.data : undefined,
        requestContext,
        user.id,
      ),
    );
  }

  private async timeTravelCorrection(
    record: RagWorkflowRunRecord,
    failure: FailurePacket,
    output: WorkflowOutput | undefined,
    requestContext: RequestContext<WorkflowRequestContext>,
    actorUserId: string,
  ): Promise<RagWorkflowRunRecord> {
    const runtime = this.requireRuntime();
    const input = WorkflowStartInputSchema.parse(record.requestInput);
    const refined = RefinedRequestSchema.parse(record.refinement ?? output?.refined);
    const plan = ExecutionPlanSchema.parse(record.plan ?? output?.plan);
    const planningData: PlanningData = {
      input,
      refined,
      evidence: [],
      plan,
      failure,
      correctionCount: output?.corrections ?? 0,
    };
    const run = (await runtime.workflows.parentWorkflow.createRun({
      runId: record.id,
      resourceId: record.sessionId,
    })) as unknown as TimeTravelRun;
    await this.options.repository.appendAudit({
      runId: record.id,
      actorUserId,
      eventType: 'workflow.time_travel',
      partition: 'plan',
      stepId: 'correct-phase',
      phaseId: failure.phaseId,
      planRevision: plan.revision,
      reasonCode: failure.errorCode,
      evidenceRefs: failure.evidenceRefs,
      metadata: {},
    });
    const result = await run.timeTravel({
      step: ['plan-module-v1', 'correct-phase'],
      inputData: planningData,
      requestContext,
    });
    return this.persistResult(record, result, actorUserId);
  }

  private async persistResult(
    record: RagWorkflowRunRecord,
    result: MastraResultLike,
    actorUserId: string,
  ): Promise<RagWorkflowRunRecord> {
    if (result.status === 'suspended') {
      const suspension = parseSuspension(result.suspendPayload);
      const partition = suspension?.step === 'refinement-checkpoint' ? 'refinement' : 'plan';
      return this.options.repository.update(record.id, {
        status: 'suspended',
        currentPartition: partition,
        result: suspension ? { suspension } : undefined,
      });
    }
    if (result.status === 'success') {
      const output = WorkflowOutputSchema.parse(result.result);
      const status = output.status === 'completed' ? 'completed' : 'failed';
      await this.options.repository.appendAudit({
        runId: record.id,
        actorUserId,
        eventType: output.status === 'completed' ? 'workflow.completed' : 'workflow.failed',
        partition: output.status === 'completed' ? 'complete' : 'run',
        phaseId: output.failure?.phaseId,
        planRevision: output.plan.revision,
        reasonCode: output.failure?.errorCode,
        evidenceRefs: output.evidenceRefs,
        metadata: { corrections: output.corrections },
      });
      return this.options.repository.update(record.id, {
        status,
        currentPartition: output.status === 'completed' ? 'complete' : 'run',
        planRevision: output.plan.revision,
        refinement: output.refined,
        plan: output.plan,
        result: output,
        lastFailure: output.failure,
        safeErrorCode: output.failure?.errorCode,
        ...(status === 'completed' ? { completedAt: new Date().toISOString() } : {}),
      });
    }

    const safeErrorCode = result.status === 'tripwire' ? 'workflow_tripwire' : 'workflow_failed';
    await this.options.repository.appendAudit({
      runId: record.id,
      actorUserId,
      eventType: 'workflow.failed',
      partition: record.currentPartition,
      reasonCode: safeErrorCode,
      evidenceRefs: [],
      metadata: {},
    });
    return this.options.repository.update(record.id, {
      status: 'failed',
      safeErrorCode,
    });
  }

  private async requireOwnedRun(
    sessionId: string,
    runId: string,
    ownerId: string,
  ): Promise<RagWorkflowRunRecord> {
    this.requireRuntime();
    const record = await this.options.repository.get(runId, ownerId, sessionId);
    if (!record) throw AppError.notFound('RAG workflow run not found.');
    return record;
  }

  private async requestContext(
    user: AuthenticatedUser,
    requestId: string,
  ): Promise<RequestContext<WorkflowRequestContext>> {
    const accessScopes = await this.options.resolveAccessScopes(user.id);
    return new RequestContext<WorkflowRequestContext>([
      ['actorId', user.id],
      ['actorRole', user.role === 'admin' ? 'admin' : 'user'],
      ['accessScopes', accessScopes.length ? accessScopes : ['all_users']],
      ['requestId', requestId],
    ]);
  }

  private requireRuntime(): RagWorkflowRuntime {
    if (!this.options.enabled || !this.options.runtime) {
      throw AppError.featureDisabled('Mastra RAG workflows are not enabled.');
    }
    return this.options.runtime;
  }

  private toResponse(record: RagWorkflowRunRecord): RagWorkflowResponse {
    const output = WorkflowOutputSchema.safeParse(record.result);
    const suspension = parseSuspension(
      record.result && typeof record.result === 'object' && 'suspension' in record.result
        ? record.result.suspension
        : undefined,
    );
    return {
      runId: record.id,
      status: record.status,
      currentPartition: record.currentPartition,
      ...(record.plan
        ? {
            plan: planSummary(
              ExecutionPlanSchema.parse(record.plan),
              output.success ? output.data : undefined,
            ),
          }
        : {}),
      ...(output.success
        ? {
            result: {
              summary: output.data.summary,
              completedPhaseIds: output.data.completedPhaseIds,
              evidenceRefs: output.data.evidenceRefs,
              corrections: output.data.corrections,
            },
          }
        : {}),
      ...(suspension ? { suspension } : {}),
      safeErrorCode: record.safeErrorCode,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}

function parseSuspension(
  value: unknown,
): { step: string; reasonCode: string; questions: string[] } | undefined {
  if (!value || typeof value !== 'object') return undefined;
  if (
    !('step' in value) ||
    typeof value.step !== 'string' ||
    !('reasonCode' in value) ||
    typeof value.reasonCode !== 'string' ||
    !('questions' in value) ||
    !Array.isArray(value.questions)
  ) {
    return undefined;
  }
  return {
    step: value.step,
    reasonCode: value.reasonCode,
    questions: value.questions.filter(
      (question): question is string => typeof question === 'string',
    ),
  };
}

function planSummary(plan: ExecutionPlan, output?: WorkflowOutput): RagWorkflowPlanSummary {
  const completed = new Set(output?.completedPhaseIds ?? []);
  return {
    revision: plan.revision,
    goal: plan.goal.statement,
    approach: plan.choice.approach,
    how: plan.choice.how,
    why: plan.choice.why,
    phases: plan.phases.map((phase) => ({
      phaseId: phase.phaseId,
      title: phase.title,
      status: completed.has(phase.phaseId)
        ? 'completed'
        : output?.failure?.phaseId === phase.phaseId
          ? 'failed'
          : 'pending',
    })),
  };
}
