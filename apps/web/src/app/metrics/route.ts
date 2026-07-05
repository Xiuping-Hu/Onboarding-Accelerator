import { publicJson } from '@/server/routeHandler';
import { getServerServices } from '@/server/services';

export function GET() {
  return publicJson(getServerServices().metrics);
}
