import { z } from 'zod';

const RoadmapIdentifierSchema = z.string().uuid();

export const StaticRoadmapTaskParamsSchema = z
  .object({
    taskId: RoadmapIdentifierSchema,
  })
  .strict();

export const StaticRoadmapNoticeParamsSchema = z
  .object({
    noticeId: RoadmapIdentifierSchema,
  })
  .strict();

export const StaticRoadmapEvidenceParamsSchema = z
  .object({
    evidenceId: z.string().trim().min(1).max(2_000),
  })
  .strict();

export const TransitionStaticRoadmapTaskBodySchema = z
  .object({
    status: z.enum(['not_started', 'in_progress', 'blocked', 'completed', 'waived']),
    expectedTaskRevision: z.number().int().nonnegative(),
    expectedStateRevision: z.number().int().nonnegative(),
    clientRequestId: z.string().trim().min(1).max(200),
  })
  .strict();

export const AcknowledgeStaticRoadmapNoticeBodySchema = z
  .object({
    read: z.literal(true),
  })
  .strict();

export type TransitionStaticRoadmapTaskBody = z.infer<typeof TransitionStaticRoadmapTaskBodySchema>;
