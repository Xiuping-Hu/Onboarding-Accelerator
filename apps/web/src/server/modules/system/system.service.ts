export interface ReadinessProbe {
  isRequired: boolean;
  check(): Promise<void>;
}

export class SystemService {
  constructor(
    private readonly metrics: {
      startedAt: string;
      requestsTotal: number;
      responsesTotal: number;
    },
    private readonly readiness?: ReadinessProbe,
  ) {}

  getHealth() {
    return { status: 'ok' as const, service: 'onboarding-web' };
  }

  async getReadiness() {
    if (this.readiness?.isRequired) await this.readiness.check();
    return this.getHealth();
  }

  getMetrics() {
    return this.metrics;
  }
}
