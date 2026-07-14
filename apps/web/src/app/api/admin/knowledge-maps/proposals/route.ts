import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleAdminApiRoute } from '../../../../../server/adminApi';

const proposalSchema = z.object({
  objective: z.string().trim().min(1).max(500),
  sourceIds: z.array(z.string().min(1)).min(1).max(40),
});

export async function POST(request: NextRequest): Promise<Response> {
  return handleAdminApiRoute(request, async ({ request: apiRequest, services }) => {
    if (!services.knowledgeMaps)
      return new Response('Knowledge maps are disabled', { status: 404 });
    const payload = proposalSchema.parse(await apiRequest.json());
    return {
      draft: await services.knowledgeMaps.proposeFromSources(payload.objective, payload.sourceIds),
    };
  });
}
