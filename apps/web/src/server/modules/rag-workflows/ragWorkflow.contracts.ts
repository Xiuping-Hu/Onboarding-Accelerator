import { z } from 'zod';

export const WORKFLOW_VERSION = 'onboarding-rag-action-v1' as const;

export const WorkflowStartInputSchema = z
  .object({
    sessionId: z.string().min(1),
    message: z.string().trim().min(1).max(8_000),
    referencedNodeId: z.string().trim().min(1).optional(),
    webSearchEnabled: z.boolean().default(false),
    clientRequestId: z.string().trim().min(1).max(200),
  })
  .strict();

export const WorkflowRequestContextSchema = z
  .object({
    actorId: z.string().min(1),
    actorRole: z.enum(['user', 'admin']),
    accessScopes: z.array(z.string().min(1)).min(1),
    requestId: z.string().min(1),
  })
  .strict();

export const ResolvedReferenceSchema = z.object({
  original: z.string(),
  replacement: z.string(),
  evidenceRef: z.string(),
  confidence: z.number().min(0).max(1),
});

export const TermMappingSchema = z.object({
  original: z.string(),
  canonical: z.string(),
  glossaryRef: z.string().optional(),
});

export const RefinedRequestSchema = z.object({
  revision: z.number().int().nonnegative(),
  originalInputHash: z.string(),
  canonicalRequest: z.string(),
  intent: z.enum(['answer', 'navigate', 'draft', 'execute']),
  resolvedReferences: z.array(ResolvedReferenceSchema),
  termMappings: z.array(TermMappingSchema),
  knownContextRefs: z.array(z.string()),
  missingFields: z.array(z.string()),
  assumptions: z.array(z.string()),
  status: z.enum(['ready', 'needs_input']),
});

export const RefinementPartitionOutputSchema = z.object({
  input: WorkflowStartInputSchema,
  refined: RefinedRequestSchema,
});

export const RefinementSuspendSchema = z.object({
  step: z.literal('refinement-checkpoint'),
  reasonCode: z.enum(['ambiguous_reference', 'incomplete_context']),
  questions: z.array(z.string()).min(1).max(5),
  refinementRevision: z.number().int().nonnegative(),
});

export const RefinementResumeSchema = z
  .object({
    clarification: z.string().trim().min(1).max(4_000),
  })
  .strict();

export const EvidenceReferenceSchema = z.object({
  id: z.string(),
  title: z.string(),
  sourceType: z.enum(['knowledge_base', 'web']),
  sourceId: z.string().optional(),
  sourceVersionId: z.string().optional(),
  sectionKey: z.string().optional(),
  score: z.number().optional(),
});

export const GoalSchema = z.object({
  statement: z.string(),
  successCriteria: z.array(z.string()).min(1),
  constraints: z.array(z.string()),
  nonGoals: z.array(z.string()),
});

export const ChoiceSchema = z.object({
  approach: z.string(),
  how: z.string(),
  why: z.string(),
  evidenceRefs: z.array(z.string()),
  rejectedAlternatives: z.array(
    z.object({
      approach: z.string(),
      reason: z.string(),
    }),
  ),
});

export const FailurePacketSchema = z.object({
  runId: z.string(),
  planRevision: z.number().int().nonnegative(),
  phaseId: z.string(),
  phaseRevision: z.number().int().nonnegative(),
  failureClass: z.enum([
    'transient',
    'plan_defect',
    'verification',
    'context_gap',
    'authorization',
    'unexpected',
  ]),
  errorCode: z.string(),
  safeMessage: z.string(),
  inputHash: z.string(),
  outputHash: z.string().optional(),
  completedPhaseIds: z.array(z.string()),
  evidenceRefs: z.array(z.string()),
});

export const PlanPhaseSchema = z.object({
  phaseId: z.string(),
  phaseRevision: z.number().int().nonnegative(),
  title: z.string(),
  dependsOn: z.array(z.string()),
  toolId: z.string(),
  input: z.record(z.unknown()),
  expectedOutputSchemaRef: z.string(),
  preconditions: z.array(z.string()),
  successChecks: z.array(z.string()).min(1),
  evidenceRefs: z.array(z.string()),
  impact: z.enum(['read_only', 'reversible', 'externally_visible', 'destructive']),
  approval: z.enum(['none', 'user', 'admin']),
  retryPolicy: z.enum(['never', 'transient_only']),
});

export const ExecutionPlanSchema = z.object({
  planId: z.string(),
  revision: z.number().int().nonnegative(),
  goal: GoalSchema,
  contextAssessment: z.object({
    sufficient: z.boolean(),
    evidenceRefs: z.array(z.string()),
    conflicts: z.array(z.string()),
    missingCoverage: z.array(z.string()),
  }),
  choice: ChoiceSchema,
  phases: z.array(PlanPhaseSchema).min(1).max(20),
  planHash: z.string(),
});

export const PlanningDataSchema = z.object({
  input: WorkflowStartInputSchema,
  refined: RefinedRequestSchema,
  goal: GoalSchema.optional(),
  evidence: z.array(EvidenceReferenceSchema).default([]),
  choice: ChoiceSchema.optional(),
  plan: ExecutionPlanSchema.optional(),
  failure: FailurePacketSchema.optional(),
  correctionCount: z.number().int().nonnegative().default(0),
});

export const PlanPartitionOutputSchema = z.object({
  input: WorkflowStartInputSchema,
  refined: RefinedRequestSchema,
  plan: ExecutionPlanSchema,
  correctionCount: z.number().int().nonnegative(),
});

export const PlanSuspendSchema = z.object({
  step: z.literal('plan-checkpoint'),
  reasonCode: z.enum(['missing_evidence', 'conflicting_evidence', 'approval_required']),
  questions: z.array(z.string()).min(1).max(5),
  planRevision: z.number().int().nonnegative(),
});

export const PlanResumeSchema = z
  .object({
    clarification: z.string().trim().min(1).max(4_000).optional(),
    approved: z.boolean().optional(),
  })
  .strict();

export const CompletedPhaseSchema = z.object({
  phaseId: z.string(),
  phaseRevision: z.number().int().nonnegative(),
  idempotencyKey: z.string(),
  outputHash: z.string(),
  summary: z.string(),
  evidenceRefs: z.array(z.string()),
});

export const RunDataSchema = z.object({
  input: WorkflowStartInputSchema,
  refined: RefinedRequestSchema,
  plan: ExecutionPlanSchema,
  completedPhases: z.array(CompletedPhaseSchema),
  failedPhase: FailurePacketSchema.optional(),
  outputSummaries: z.array(z.string()),
  correctionCount: z.number().int().nonnegative(),
  status: z.enum(['running', 'completed', 'needs_correction', 'failed']),
});

export const WorkflowOutputSchema = z.object({
  runId: z.string(),
  status: z.enum(['completed', 'needs_correction', 'failed']),
  summary: z.string(),
  refined: RefinedRequestSchema,
  plan: ExecutionPlanSchema,
  completedPhaseIds: z.array(z.string()),
  evidenceRefs: z.array(z.string()),
  corrections: z.number().int().nonnegative(),
  failure: FailurePacketSchema.optional(),
});

export const WorkflowStateSchema = z.object({
  workflowVersion: z.literal(WORKFLOW_VERSION),
  currentPartition: z.enum(['refinement', 'plan', 'run', 'complete']),
  status: z.enum(['running', 'suspended', 'failed', 'completed']),
});

export type WorkflowStartInput = z.infer<typeof WorkflowStartInputSchema>;
export type WorkflowRequestContext = z.infer<typeof WorkflowRequestContextSchema>;
export type RefinedRequest = z.infer<typeof RefinedRequestSchema>;
export type RefinementPartitionOutput = z.infer<typeof RefinementPartitionOutputSchema>;
export type EvidenceReference = z.infer<typeof EvidenceReferenceSchema>;
export type Goal = z.infer<typeof GoalSchema>;
export type Choice = z.infer<typeof ChoiceSchema>;
export type FailurePacket = z.infer<typeof FailurePacketSchema>;
export type PlanPhase = z.infer<typeof PlanPhaseSchema>;
export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;
export type PlanningData = z.infer<typeof PlanningDataSchema>;
export type PlanPartitionOutput = z.infer<typeof PlanPartitionOutputSchema>;
export type CompletedPhase = z.infer<typeof CompletedPhaseSchema>;
export type RunData = z.infer<typeof RunDataSchema>;
export type WorkflowOutput = z.infer<typeof WorkflowOutputSchema>;
