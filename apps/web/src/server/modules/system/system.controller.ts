import type { Controller } from '../../core/http/controller';
import { httpResult } from '../../core/http/httpResult';
import { toMetricsResponseDto } from './system.dto';
import type { SystemService } from './system.service';

export function createSystemController(service: SystemService) {
  const health: Controller = () => httpResult.json(service.getHealth());
  const ready: Controller = async () => httpResult.json(await service.getReadiness());
  const metrics: Controller = () => httpResult.json(toMetricsResponseDto(service.getMetrics()));
  return { health, ready, metrics };
}
