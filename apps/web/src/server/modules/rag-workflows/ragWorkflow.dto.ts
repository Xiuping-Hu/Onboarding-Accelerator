import type {
  CorrectRagWorkflowRequest,
  RagWorkflowEventsResponse,
  RagWorkflowResponse,
  ResumeRagWorkflowRequest,
  StartRagWorkflowRequest,
} from '@onboarding/shared';
import { z } from 'zod';

export const RagWorkflowSessionParamsSchema = z
  .object({
    sessionId: z.string().min(1),
  })
  .strict();

export const RagWorkflowRunParamsSchema = RagWorkflowSessionParamsSchema.extend({
  runId: z.string().uuid(),
}).strict();

export const StartRagWorkflowBodySchema = z
  .object({
    message: z.string().trim().min(1).max(8_000),
    referencedNodeId: z.string().trim().min(1).optional(),
    webSearchEnabled: z.boolean().optional(),
    clientRequestId: z.string().trim().min(1).max(200),
  })
  .strict() satisfies z.ZodType<StartRagWorkflowRequest>;

export const ResumeRagWorkflowBodySchema = z
  .object({
    step: z.enum(['refinement-checkpoint', 'plan-checkpoint']),
    clarification: z.string().trim().min(1).max(4_000).optional(),
    approved: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.step === 'refinement-checkpoint' && !value.clarification) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['clarification'],
        message: 'Clarification is required for the refinement checkpoint.',
      });
    }
    if (value.step === 'plan-checkpoint' && value.approved === undefined && !value.clarification) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Approval or clarification is required for the plan checkpoint.',
      });
    }
  }) satisfies z.ZodType<ResumeRagWorkflowRequest>;

export const CorrectRagWorkflowBodySchema = z
  .object({
    phaseId: z.string().trim().min(1).max(200),
    reason: z.string().trim().min(1).max(2_000),
  })
  .strict() satisfies z.ZodType<CorrectRagWorkflowRequest>;

export function toRagWorkflowResponseDto(response: RagWorkflowResponse): RagWorkflowResponse {
  return response;
}

export function toRagWorkflowEventsResponseDto(
  response: RagWorkflowEventsResponse,
): RagWorkflowEventsResponse {
  return response;
}
