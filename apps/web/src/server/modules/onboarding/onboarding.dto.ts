import { z } from 'zod';
import { RoadmapCommandSchema } from './onboarding.agent';

const StableKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9][a-z0-9_-]*$/i);

const TaskDefinitionSchema = z
  .object({
    stableKey: StableKeySchema,
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2_000).optional(),
    completionCriteria: z.string().trim().max(2_000).optional(),
    required: z.boolean().optional(),
    countsTowardProgress: z.boolean().optional(),
    weight: z.number().positive().max(10_000).optional(),
    dueOffsetDays: z.number().int().min(0).max(3_650).optional(),
    dependsOnTaskKeys: z.array(StableKeySchema).max(100).optional(),
  })
  .strict();

const StageDefinitionSchema = z
  .object({
    stableKey: StableKeySchema,
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(4_000),
    position: z.number().int().positive().max(10_000),
    guideStepId: z.string().trim().min(1).max(200).optional(),
    dependsOnStageKeys: z.array(StableKeySchema).max(100).optional(),
    tasks: z.array(TaskDefinitionSchema).max(20),
  })
  .strict();

export const OnboardingSessionParamsSchema = z.object({ sessionId: z.string().min(1) });
export const OnboardingTaskParamsSchema = z.object({
  sessionId: z.string().min(1),
  taskId: z.string().uuid(),
});
export const OnboardingProposalParamsSchema = z.object({
  sessionId: z.string().min(1),
  proposalId: z.string().uuid(),
});
export const CreateOnboardingPlanBodySchema = z
  .object({
    clientRequestId: z.string().trim().min(1).max(200),
    title: z.string().trim().min(1).max(200),
    definitionVersionId: z.string().uuid().optional(),
    startAt: z.string().datetime({ offset: true }).optional(),
    targetAt: z.string().datetime({ offset: true }).optional(),
    stages: z.array(StageDefinitionSchema).max(12).default([]),
  })
  .strict();

export const GenerateOnboardingPlanBodySchema = z
  .object({
    clientRequestId: z.string().trim().min(1).max(200),
    goal: z.string().trim().min(3).max(2_000),
    role: z.string().trim().min(1).max(200).optional(),
    title: z.string().trim().min(1).max(200).optional(),
    startAt: z.string().datetime({ offset: true }).optional(),
    targetAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

export const RoadmapCommandBodySchema = z
  .object({
    expectedPlanRevision: z.number().int().nonnegative(),
    idempotencyKey: z.string().trim().min(1).max(200),
    command: RoadmapCommandSchema,
    destructiveImpactHash: z.string().length(64).optional(),
  })
  .strict();

export const RequestRoadmapAiProposalBodySchema = z
  .object({
    instruction: z.string().trim().min(3).max(2_000),
    selectedStageKey: StableKeySchema.optional(),
    selectedTaskKey: StableKeySchema.optional(),
  })
  .strict();

export const ApplyRoadmapAiProposalBodySchema = z
  .object({
    expectedPlanRevision: z.number().int().nonnegative(),
    proposalHash: z.string().length(64),
    idempotencyKey: z.string().trim().min(1).max(200),
    destructiveImpactHash: z.string().length(64).optional(),
  })
  .strict();

export const CancelOnboardingPlanBodySchema = z
  .object({
    expectedPlanRevision: z.number().int().nonnegative(),
    idempotencyKey: z.string().trim().min(1).max(200),
    impactHash: z.string().length(64),
    reason: z.string().trim().min(3).max(1_000),
  })
  .strict();

export const TransitionOnboardingTaskBodySchema = z
  .object({
    status: z.enum(['not_started', 'in_progress', 'blocked', 'completed', 'waived']),
    expectedRevision: z.number().int().nonnegative(),
    idempotencyKey: z.string().trim().min(1).max(200),
    source: z.enum(['tasks_ui', 'overview_ui', 'agent_confirmed']),
  })
  .strict();

export type CreateOnboardingPlanBody = z.infer<typeof CreateOnboardingPlanBodySchema>;
export type GenerateOnboardingPlanBody = z.infer<typeof GenerateOnboardingPlanBodySchema>;
export type RoadmapCommandBody = z.infer<typeof RoadmapCommandBodySchema>;
export type RequestRoadmapAiProposalBody = z.infer<typeof RequestRoadmapAiProposalBodySchema>;
export type ApplyRoadmapAiProposalBody = z.infer<typeof ApplyRoadmapAiProposalBodySchema>;
export type CancelOnboardingPlanBody = z.infer<typeof CancelOnboardingPlanBodySchema>;
export type TransitionOnboardingTaskBody = z.infer<typeof TransitionOnboardingTaskBodySchema>;
