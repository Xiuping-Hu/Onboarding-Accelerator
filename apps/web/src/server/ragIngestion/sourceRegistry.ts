import { readFile } from 'node:fs/promises';
import type { IngestionRegistry, IngestionSource, IngestionSourceKind } from './types';

const sourceKinds = new Set<IngestionSourceKind>([
  'document',
  'pdf',
  'transcript',
  'audio',
  'website',
  'sharepoint_page',
]);

export async function loadSourceRegistry(path: string): Promise<IngestionRegistry> {
  const parsed = JSON.parse(await readFile(path, 'utf8')) as unknown;
  if (!isRecord(parsed) || !Array.isArray(parsed.sources)) {
    throw new Error('RAG source registry must contain a sources array.');
  }

  return { sources: parsed.sources.map(validateSource) };
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

  return {
    id,
    kind,
    uri: stringField(value, 'uri'),
    title: optionalString(value.title),
    path: optionalString(value.path),
    owner: stringField(value, 'owner'),
    accessScope: stringField(value, 'accessScope'),
    refreshCadence: optionalString(value.refreshCadence),
    reviewed: typeof value.reviewed === 'boolean' ? value.reviewed : undefined,
    enabled: typeof value.enabled === 'boolean' ? value.enabled : true,
    metadata: recordOfPrimitives(value.metadata),
    sharepoint: isRecord(value.sharepoint)
      ? {
          siteId: optionalString(value.sharepoint.siteId),
          pageName: optionalString(value.sharepoint.pageName),
          crawlAllPages: value.sharepoint.crawlAllPages === true,
          maxPages: positiveInteger(value.sharepoint.maxPages),
        }
      : undefined,
  };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
