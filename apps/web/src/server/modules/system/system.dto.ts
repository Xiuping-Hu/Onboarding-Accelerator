import type { HealthResponse } from '@onboarding/shared';

export function toHealthResponseDto(): HealthResponse {
  return { status: 'ok', service: 'onboarding-web' };
}

export function toMetricsResponseDto(metrics: {
  startedAt: string;
  requestsTotal: number;
  responsesTotal: number;
}) {
  return { ...metrics };
}
