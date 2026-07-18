import type {
  CreateSessionResponse,
  GetSessionResponse,
  ListSessionsResponse,
  OnboardingSession,
  UpdateSessionResponse,
} from '@onboarding/shared';
import { z } from 'zod';

export const UserSettingsSchema = z.object({
  webSearchEnabled: z.boolean().optional(),
});

export const CreateSessionBodySchema = z.object({
  title: z.string().optional(),
  settings: UserSettingsSchema.optional(),
});

export const SessionIdParamsSchema = z.object({
  sessionId: z.string().min(1),
});

export const UpdateSessionBodySchema = z.object({
  title: z.string().optional(),
  settings: UserSettingsSchema.optional(),
  selectedNodeId: z.string().nullable().optional(),
  expandedNodeIds: z.array(z.string()).optional(),
});

export type CreateSessionBody = z.infer<typeof CreateSessionBodySchema>;
export type UpdateSessionBody = z.infer<typeof UpdateSessionBodySchema>;

export function toListSessionsResponseDto(sessions: OnboardingSession[]): ListSessionsResponse {
  return { sessions };
}

export function toCreateSessionResponseDto(session: OnboardingSession): CreateSessionResponse {
  return { session };
}

export function toGetSessionResponseDto(session: OnboardingSession): GetSessionResponse {
  return session;
}

export function toUpdateSessionResponseDto(session: OnboardingSession): UpdateSessionResponse {
  return session;
}
