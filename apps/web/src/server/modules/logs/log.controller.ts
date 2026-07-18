import type { Controller } from '../../core/http/controller';
import { httpResult } from '../../core/http/httpResult';
import { parseQuery } from '../../core/http/requestParsers';
import { RecentLogsQuerySchema, toLogEventsResponseDto, toLogSummaryResponseDto } from './log.dto';
import type { LogQueryService } from './log.service';

export function createLogController(service: LogQueryService) {
  const recent: Controller = async (context) => {
    const { limit } = parseQuery(context.request, RecentLogsQuerySchema);
    return httpResult.json(toLogEventsResponseDto(await service.listRecent(limit)));
  };
  const summary: Controller = async () =>
    httpResult.json(toLogSummaryResponseDto(await service.summarize()));
  return { recent, summary };
}
