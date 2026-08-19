import { readFile } from 'node:fs/promises';
import type {
  IngestionConnectorKind,
  IngestionPublicationPolicy,
  IngestionRegistry,
  IngestionSource,
  IngestionSourceKind,
  IngestionTriggerType,
} from './types';

const sourceKinds = new Set<IngestionSourceKind>([
  'document',
  'pdf',
  'transcript',
  'audio',
  'website',
  'sharepoint_page',
  'sharepoint_folder',
]);
const connectorKinds = new Set<IngestionConnectorKind>([
  'local_artifact',
  'http_website',
  'sharepoint',
  'manual_artifact',
]);
const triggerTypes = new Set<IngestionTriggerType>(['manual', 'scheduled', 'event', 'reindex']);
const publicationPolicies = new Set<IngestionPublicationPolicy>([
  'manual_review',
  'auto_after_validation',
]);

export async function loadSourceRegistry(path: string): Promise<IngestionRegistry> {
  const parsed = JSON.parse(await readFile(path, 'utf8')) as unknown;
  if (!isRecord(parsed) || !Array.isArray(parsed.sources)) {
    throw new Error('RAG source registry must contain a sources array.');
  }

  const registry = { sources: parsed.sources.map(validateSource) };
  if (process.env.STATIC_ROADMAP_ENABLED === 'true') {
    assertSingleStaticRoadmapAuthoritativeSource(
      registry,
      process.env.STATIC_ROADMAP_AUTHORITATIVE_SOURCE_ID?.trim() || 'tax-consulting-sharepoint',
    );
  }
  return registry;
}

export function assertSingleStaticRoadmapAuthoritativeSource(
  registry: IngestionRegistry,
  configuredSourceId: string,
): IngestionSource {
  const authoritative = registry.sources.filter((source) => source.roadmapAuthoritative === true);
  if (authoritative.length !== 1) {
    throw new Error(
      `Static roadmap generation requires exactly one roadmap-authoritative RAG source; found ${authoritative.length}.`,
    );
  }
  if (authoritative[0]!.id !== configuredSourceId) {
    throw new Error(
      `Static roadmap authoritative source ${authoritative[0]!.id} does not match configured source ${configuredSourceId}.`,
    );
  }
  const source = authoritative[0]!;
  if (source.enabled === false) {
    throw new Error(`Static roadmap authoritative source ${source.id} must be enabled.`);
  }
  if (source.accessScope !== 'all_users') {
    throw new Error(`Static roadmap authoritative source ${source.id} must use all_users scope.`);
  }
  return source;
}

function validateSource(value: unknown): IngestionSource {
  if (!isRecord(value)) {
    throw new Error('Each RAG source must be an object.');
  }

  const id = stringField(value, 'id');
  const kind = stringField(value, 'kind') as IngestionSourceKind;
  if (!sourceKinds.has(kind)) {
    throw new Error(`RAG source ${id} has unsupported kind ${kind}.`);
  }

  const connectorKind = optionalString(value.connectorKind) as IngestionConnectorKind | undefined;
  if (connectorKind && !connectorKinds.has(connectorKind)) {
    throw new Error(`RAG source ${id} has unsupported connector kind ${connectorKind}.`);
  }
  const allowedTriggers = optionalStringArray(value.allowedTriggers, `RAG source ${id} triggers`)
    ?.map((trigger) => trigger as IngestionTriggerType)
    .filter((trigger) => {
      if (!triggerTypes.has(trigger)) {
        throw new Error(`RAG source ${id} has unsupported trigger ${trigger}.`);
      }
      return true;
    });
  const publicationPolicy = optionalString(value.publicationPolicy) as
    | IngestionPublicationPolicy
    | undefined;
  if (publicationPolicy && !publicationPolicies.has(publicationPolicy)) {
    throw new Error(`RAG source ${id} has unsupported publication policy ${publicationPolicy}.`);
  }
  const sharepoint = isRecord(value.sharepoint)
    ? {
        siteId: optionalString(value.sharepoint.siteId),
        sitePath: optionalString(value.sharepoint.sitePath),
        pageName: optionalString(value.sharepoint.pageName),
        crawlAllPages: value.sharepoint.crawlAllPages === true,
        maxPages: positiveInteger(value.sharepoint.maxPages),
        libraryName: optionalString(value.sharepoint.libraryName),
        folderPath: optionalString(value.sharepoint.folderPath),
        recursive: value.sharepoint.recursive !== false,
        maxFiles: positiveInteger(value.sharepoint.maxFiles),
        maxDepth: positiveInteger(value.sharepoint.maxDepth),
        maxFileBytes: positiveInteger(value.sharepoint.maxFileBytes),
      }
    : undefined;
  if (
    kind === 'sharepoint_folder' &&
    (!sharepoint?.libraryName ||
      !sharepoint.folderPath ||
      (!sharepoint.siteId && !sharepoint.sitePath))
  ) {
    throw new Error(
      `RAG source ${id} SharePoint folder requires siteId or sitePath, libraryName, and folderPath.`,
    );
  }

  return {
    id,
    kind,
    uri: stringField(value, 'uri'),
    title: optionalString(value.title),
    path: optionalString(value.path),
    owner: stringField(value, 'owner'),
    accessScope: stringField(value, 'accessScope'),
    refreshCadence: optionalString(value.refreshCadence),
    connectorKind,
    allowedContentTypes: optionalStringArray(
      value.allowedContentTypes,
      `RAG source ${id} content types`,
    ),
    allowedTriggers: allowedTriggers ?? ['manual'],
    credentialRef: optionalString(value.credentialRef),
    publicationPolicy,
    reviewed: typeof value.reviewed === 'boolean' ? value.reviewed : undefined,
    enabled: typeof value.enabled === 'boolean' ? value.enabled : true,
    roadmapAuthoritative: value.roadmapAuthoritative === true,
    metadata: recordOfPrimitives(value.metadata),
    website: isRecord(value.website)
      ? {
          allowedOrigins: optionalStringArray(
            value.website.allowedOrigins,
            `RAG source ${id} website allowed origins`,
          ),
          allowedPaths: optionalStringArray(
            value.website.allowedPaths,
            `RAG source ${id} website allowed paths`,
          ),
          maxRedirects: positiveInteger(value.website.maxRedirects),
          maxPageBytes: positiveInteger(value.website.maxPageBytes),
          timeoutMs: positiveInteger(value.website.timeoutMs),
        }
      : undefined,
    validation: isRecord(value.validation)
      ? {
          maximumReductionRatio: ratio(value.validation.maximumReductionRatio),
          requireManualReview: value.validation.requireManualReview === true,
        }
      : undefined,
    schedule: isRecord(value.schedule)
      ? {
          cron: stringField(value.schedule, 'cron'),
          timezone: stringField(value.schedule, 'timezone'),
          enabled: value.schedule.enabled !== false,
          maxRuntimeSeconds: positiveInteger(value.schedule.maxRuntimeSeconds),
        }
      : undefined,
    sharepoint,
  };
}

export function defaultConnectorKind(kind: IngestionSourceKind): IngestionConnectorKind {
  if (kind === 'website') return 'http_website';
  if (kind === 'sharepoint_page' || kind === 'sharepoint_folder') return 'sharepoint';
  return 'local_artifact';
}

function stringField(value: Record<string, unknown>, name: string): string {
  const field = optionalString(value[name]);
  if (!field) {
    throw new Error(`RAG source is missing ${name}.`);
  }
  return field;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function optionalStringArray(value: unknown, label: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((entry) => !optionalString(entry))) {
    throw new Error(`${label} must be an array of non-empty strings.`);
  }
  return value.map((entry) => String(entry).trim());
}

function recordOfPrimitives(value: unknown): Record<string, string | number | boolean> | undefined {
  if (!isRecord(value)) return undefined;
  const result: Record<string, string | number | boolean> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean')
      result[key] = entry;
  }
  return result;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

function ratio(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || value < 0 || value >= 1) {
    throw new Error('RAG source maximumReductionRatio must be between 0 and 1.');
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
