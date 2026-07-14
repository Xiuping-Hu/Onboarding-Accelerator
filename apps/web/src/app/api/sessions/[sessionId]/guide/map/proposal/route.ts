import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import type { MapProjectionProposal } from '@onboarding/shared';
import { handleApiRoute } from '@/server/routeHandler';

const proposalSchema = z.object({
  goal: z.string().trim().min(1).max(500),
  onboardingRoleKey: z.string().trim().min(1).max(120).optional(),
  teamKey: z.string().trim().min(1).max(120).optional(),
  mapId: z.string().uuid().optional(),
});

type RouteContext = { params: Promise<{ sessionId: string }> };

export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  const { sessionId } = await context.params;
  return handleApiRoute(request, async ({ request: apiRequest, services, user }) => {
    if (!services.knowledgeMaps)
      return new Response('Knowledge maps are disabled', { status: 404 });
    const payload = proposalSchema.parse(await apiRequest.json());
    const scopes = await services.knowledgeMaps.accessScopesFor(user.id);
    const map = await services.knowledgeMaps.getPublished(scopes, payload.mapId);
    const session = await services.sessions.get(sessionId, user.id);
    const now = new Date();
    const proposal: MapProjectionProposal = {
      id: randomUUID(),
      sessionRevision: (session.revision ?? 0) + 1,
      mapId: map.id,
      mapVersionId: map.versionId,
      nodeIds: map.nodes.map((node) => node.id),
      pathNodeIds: map.nodes.map((node) => node.id),
      ...(payload.onboardingRoleKey ? { onboardingRoleKey: payload.onboardingRoleKey } : {}),
      ...(payload.teamKey ? { teamKey: payload.teamKey } : {}),
      goal: payload.goal,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
    };
    session.guide.pendingMapProjection = proposal;
    const saved = await services.sessions.save(
      { ...session, updatedAt: now.toISOString() },
      user.id,
    );
    return { proposal, session: saved, map };
  });
}
