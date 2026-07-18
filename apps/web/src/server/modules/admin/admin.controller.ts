import type { Controller } from '../../core/http/controller';
import { requireControllerUser } from '../../core/http/controller';
import { httpResult } from '../../core/http/httpResult';
import { parseJsonBody, parseParams, parseQuery } from '../../core/http/requestParsers';
import { getClientIp } from '../../rateLimit';
import {
  ActivityDeleteBodySchema,
  ActivityExportBodySchema,
  ActivityQuerySchema,
  AdjustmentBodySchema,
  AuditLimitQuerySchema,
  EventIdParamsSchema,
  LimitQuerySchema,
  RateBodySchema,
  RateIdParamsSchema,
  RatePatchBodySchema,
  RecalculateBodySchema,
  RetentionBodySchema,
  toAdminActivityResponseDto,
  toAdminAuditResponseDto,
  toAiAdjustmentsResponseDto,
  toAiFeeSummaryResponseDto,
  toAiRateCardsResponseDto,
} from './admin.dto';
import type { AdminActivityService, AdminAiFeeService, AdminAuditService } from './admin.service';

export function createAdminActivityController(service: AdminActivityService) {
  const query: Controller = async (context) =>
    httpResult.json(
      toAdminActivityResponseDto(
        await service.query(parseQuery(context.request, ActivityQuerySchema)),
      ),
    );

  const get: Controller = async (context) => {
    const { eventId } = parseParams(context.params, EventIdParamsSchema);
    const event = await service.get(eventId);
    return event
      ? httpResult.json({ event })
      : httpResult.json({ error: 'Activity event not found' }, 404);
  };

  const remove: Controller = async (context) => {
    const user = requireControllerUser(context);
    const body = await parseJsonBody(context.request, ActivityDeleteBodySchema);
    return httpResult.json(await service.remove(body, user, metadata(context)));
  };

  const exportActivity: Controller = async (context) => {
    const user = requireControllerUser(context);
    const body = await parseJsonBody(context.request, ActivityExportBodySchema);
    const result = await service.export(body, user, metadata(context));
    return result.format === 'jsonl'
      ? httpResult.text(result.content, 200, {
          'content-disposition': 'attachment; filename="activity-log.jsonl"',
          'content-type': 'application/x-ndjson; charset=utf-8',
        })
      : httpResult.text(result.content, 200, {
          'content-disposition': 'attachment; filename="activity-log.csv"',
          'content-type': 'text/csv; charset=utf-8',
        });
  };

  const updateRetention: Controller = async (context) => {
    const user = requireControllerUser(context);
    const body = await parseJsonBody(context.request, RetentionBodySchema);
    return httpResult.json(await service.updateRetention(body, user, metadata(context)));
  };

  return { query, get, remove, export: exportActivity, updateRetention };
}

export function createAdminAiFeeController(service: AdminAiFeeService) {
  const summary: Controller = async (context) =>
    httpResult.json(
      toAiFeeSummaryResponseDto(
        await service.summarize(parseQuery(context.request, ActivityQuerySchema)),
      ),
    );
  const listRates: Controller = async () =>
    httpResult.json(toAiRateCardsResponseDto(await service.listRates()));
  const createRate: Controller = async (context) => {
    const user = requireControllerUser(context);
    const body = await parseJsonBody(context.request, RateBodySchema);
    return httpResult.json(await service.createRate(body, user, metadata(context)));
  };
  const updateRate: Controller = async (context) => {
    const user = requireControllerUser(context);
    const { rateId } = parseParams(context.params, RateIdParamsSchema);
    const body = await parseJsonBody(context.request, RatePatchBodySchema);
    return httpResult.json(await service.updateRate(rateId, body, user, metadata(context)));
  };
  const listAdjustments: Controller = async (context) => {
    const { limit } = parseQuery(context.request, LimitQuerySchema);
    return httpResult.json(toAiAdjustmentsResponseDto(await service.listAdjustments(limit)));
  };
  const createAdjustment: Controller = async (context) => {
    const user = requireControllerUser(context);
    const body = await parseJsonBody(context.request, AdjustmentBodySchema);
    return httpResult.json(await service.createAdjustment(body, user, metadata(context)));
  };
  const recalculate: Controller = async (context) => {
    const user = requireControllerUser(context);
    const body = await parseJsonBody(context.request, RecalculateBodySchema);
    return httpResult.json(
      toAiFeeSummaryResponseDto(await service.recalculate(body, user, metadata(context))),
    );
  };
  return {
    summary,
    listRates,
    createRate,
    updateRate,
    listAdjustments,
    createAdjustment,
    recalculate,
  };
}

export function createAdminAuditController(service: AdminAuditService) {
  const list: Controller = async (context) => {
    const { limit } = parseQuery(context.request, AuditLimitQuerySchema);
    return httpResult.json(toAdminAuditResponseDto(await service.listRecent(limit)));
  };
  return { list };
}

function metadata(context: Parameters<Controller>[0]) {
  return {
    ipAddress: getClientIp(context.request),
    userAgent: context.request.headers.get('user-agent') ?? undefined,
  };
}
