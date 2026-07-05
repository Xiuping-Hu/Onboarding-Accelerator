import type { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  csvResponse,
  handleAdminApiRoute,
  jsonlResponse,
  parseActivityQueryBody,
} from '../../../../../server/adminApi';

const exportSchema = z.object({
  query: z.unknown().optional(),
  format: z.enum(['csv', 'jsonl']).default('csv'),
});

export async function POST(request: NextRequest): Promise<Response> {
  return handleAdminApiRoute(request, async ({ request: apiRequest, services, user }) => {
    const payload = exportSchema.parse(await apiRequest.json());
    const query = parseActivityQueryBody(payload.query ?? {});
    const content = await services.adminActivity.export(query, payload.format);
    await services.adminAudit.record({
      actorUserId: user.id,
      action: 'activity.export',
      targetType: 'activity_log',
      metadata: {
        format: payload.format,
      },
      ipAddress: apiRequest.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
      userAgent: apiRequest.headers.get('user-agent') ?? undefined,
    });
    return payload.format === 'jsonl'
      ? jsonlResponse(content, 'activity-log.jsonl')
      : csvResponse(content, 'activity-log.csv');
  });
}
