import { NextResponse, type NextRequest } from 'next/server';
import { handleAdminApiRoute } from '../../../../../server/adminApi';

type RouteContext = {
  params: Promise<{ eventId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  const { eventId } = await context.params;
  return handleAdminApiRoute(request, async ({ services }) => {
    const event = await services.adminActivity.get(eventId);
    if (!event) {
      return NextResponse.json({ error: 'Activity event not found' }, { status: 404 });
    }
    return { event };
  });
}
