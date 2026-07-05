import { publicJson } from '@/server/routeHandler';

export function GET() {
  return publicJson({ status: 'ok', service: 'onboarding-web' });
}
