import type { AuthenticatedUser } from '../../auth';
import type {
  AdminActivityLogService,
  AiFeeService,
  FileAdminAuditService,
  FileAiFeeAdjustmentService,
  FileAiRateCardService,
} from '../../adminOpsService';
import type {
  ActivityDeleteBody,
  ActivityExportBody,
  ActivityQueryDto,
  AdjustmentBody,
  RateBody,
  RatePatchBody,
  RecalculateBody,
  RetentionBody,
} from './admin.dto';

export interface AdminRequestMetadata {
  ipAddress?: string;
  userAgent?: string;
}

export class AdminActivityService {
  constructor(
    private readonly activity: AdminActivityLogService,
    private readonly audit: FileAdminAuditService,
  ) {}

  query(input: ActivityQueryDto) {
    return this.activity.query(input);
  }

  get(eventId: string) {
    return this.activity.get(eventId);
  }

  async remove(input: ActivityDeleteBody, user: AuthenticatedUser, meta: AdminRequestMetadata) {
    const result = await this.activity.delete(input.query);
    await this.audit.record({
      actorUserId: user.id,
      action: 'activity.delete',
      targetType: 'activity_log',
      metadata: { deletedCount: result.deletedCount, reason: input.reason },
      ...meta,
    });
    return result;
  }

  async export(input: ActivityExportBody, user: AuthenticatedUser, meta: AdminRequestMetadata) {
    const query = input.query ?? {};
    const content = await this.activity.export(query, input.format);
    await this.audit.record({
      actorUserId: user.id,
      action: 'activity.export',
      targetType: 'activity_log',
      metadata: { format: input.format },
      ...meta,
    });
    return { content, format: input.format };
  }

  async updateRetention(input: RetentionBody, user: AuthenticatedUser, meta: AdminRequestMetadata) {
    await this.audit.record({
      actorUserId: user.id,
      action: 'activity.retention.update',
      targetType: 'activity_log',
      metadata: { retentionDays: input.retentionDays, reason: input.reason },
      ...meta,
    });
    return { retentionDays: input.retentionDays };
  }
}

export class AdminAiFeeService {
  constructor(
    private readonly fees: AiFeeService,
    private readonly rates: FileAiRateCardService,
    private readonly adjustments: FileAiFeeAdjustmentService,
    private readonly audit: FileAdminAuditService,
  ) {}

  summarize(query: ActivityQueryDto) {
    return this.fees.summarize(query);
  }

  listRates() {
    return this.rates.list();
  }

  async createRate(input: RateBody, user: AuthenticatedUser, meta: AdminRequestMetadata) {
    const rateCard = await this.rates.create(input, user);
    await this.audit.record({
      actorUserId: user.id,
      action: 'ai_rate_card.create',
      targetType: 'ai_rate_card',
      targetId: rateCard.id,
      metadata: { model: rateCard.model, currency: rateCard.currency },
      ...meta,
    });
    return { rateCard };
  }

  async updateRate(
    rateId: string,
    input: RatePatchBody,
    user: AuthenticatedUser,
    meta: AdminRequestMetadata,
  ) {
    const rateCard = await this.rates.update(rateId, input, user);
    await this.audit.record({
      actorUserId: user.id,
      action: 'ai_rate_card.update',
      targetType: 'ai_rate_card',
      targetId: rateCard.id,
      metadata: { model: rateCard.model, isActive: rateCard.isActive },
      ...meta,
    });
    return { rateCard };
  }

  listAdjustments(limit?: number) {
    return this.adjustments.listRecent(limit);
  }

  async createAdjustment(
    input: AdjustmentBody,
    user: AuthenticatedUser,
    meta: AdminRequestMetadata,
  ) {
    const adjustment = await this.adjustments.create(input, user);
    await this.audit.record({
      actorUserId: user.id,
      action: 'ai_fee_adjustment.create',
      targetType: 'ai_fee_adjustment',
      targetId: adjustment.id,
      metadata: {
        amount: adjustment.amount,
        currency: adjustment.currency,
        reason: adjustment.reason,
      },
      ...meta,
    });
    return { adjustment };
  }

  async recalculate(input: RecalculateBody, user: AuthenticatedUser, meta: AdminRequestMetadata) {
    const summary = await this.fees.summarize(input.query ?? {});
    await this.audit.record({
      actorUserId: user.id,
      action: 'ai_fees.recalculate',
      targetType: 'ai_fee_summary',
      metadata: {
        requests: summary.requests,
        estimatedFee: summary.estimatedFee,
        reason: input.reason,
      },
      ...meta,
    });
    return summary;
  }
}

export class AdminAuditService {
  constructor(private readonly audit: FileAdminAuditService) {}
  listRecent(limit?: number) {
    return this.audit.listRecent(limit);
  }
}
