import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleAdminApiRoute } from '../../../../../../../../server/adminApi';

const publishSchema = z.object({ changeNote: z.string().trim().min(1).max(500).optional() });
type RouteContext = { params: Promise<{ mapId: string; versionId: string }> };

export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  const { mapId, versionId } = await context.params;
  return handleAdminApiRoute(request, async ({ request: apiRequest, services, user }) => {
    if (!services.knowledgeMaps) {
      return new Response('Knowledge maps are disabled', { status: 404 });
    }
    const payload = publishSchema.parse(await apiRequest.json());
    await services.knowledgeMaps.publish(mapId, versionId, user.id, payload.changeNote);
    return { ok: true };
  });
}
