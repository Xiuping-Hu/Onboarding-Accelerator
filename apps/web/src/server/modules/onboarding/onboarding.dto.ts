import { z } from 'zod';

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
    tasks: z.array(TaskDefinitionSchema).max(200),
  })
  .strict();

export const OnboardingSessionParamsSchema = z.object({ sessionId: z.string().min(1) });
export const OnboardingTaskParamsSchema = z.object({
  sessionId: z.string().min(1),
  taskId: z.string().uuid(),
});
export const ActivateOnboardingPlanBodySchema = z
  .object({
    approved: z.literal(true),
    clientRequestId: z.string().trim().min(1).max(200),
    title: z.string().trim().min(1).max(200),
    definitionVersionId: z.string().uuid().optional(),
    startAt: z.string().datetime({ offset: true }).optional(),
    targetAt: z.string().datetime({ offset: true }).optional(),
    stages: z.array(StageDefinitionSchema).min(1).max(100),
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

export type ActivateOnboardingPlanBody = z.infer<typeof ActivateOnboardingPlanBodySchema>;
export type TransitionOnboardingTaskBody = z.infer<typeof TransitionOnboardingTaskBodySchema>;
