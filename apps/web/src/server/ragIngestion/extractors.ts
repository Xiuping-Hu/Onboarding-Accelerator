import { ContentExtractorRegistry, createDefaultContentExtractors } from './contentExtractors';
import {
  ConnectorRegistry,
  createDefaultConnectors,
  type ConnectorRuntimeOptions,
  type SharePointCredentials,
} from './sourceConnectors';
import type {
  AcquisitionContext,
  AcquisitionResult,
  IngestionDocument,
  IngestionSource,
} from './types';

export type { SharePointCredentials } from './sourceConnectors';

export interface ExtractSourcesResult {
  acquisition: AcquisitionResult;
  documents: IngestionDocument[];
}

export async function acquireAndExtractSources(
  source: IngestionSource,
  credentials: SharePointCredentials,
  context: AcquisitionContext = { previousDocuments: [] },
  options: ConnectorRuntimeOptions = {},
): Promise<ExtractSourcesResult> {
  const connectors = new ConnectorRegistry(createDefaultConnectors(credentials, options));
  const extractors = new ContentExtractorRegistry(createDefaultContentExtractors());
  const acquisition = await connectors.acquire(source, context);
  if (acquisition.status === 'unchanged') return { acquisition, documents: [] };

  const documents: IngestionDocument[] = [];
  for (const artifact of acquisition.artifacts) {
    documents.push(...(await extractors.extract(artifact)));
  }
  return { acquisition, documents };
}

// Compatibility entry points for existing callers and tests. New scheduling code uses the richer
// acquisition result so it can distinguish a conditional-fetch no-op from an empty extraction.
export async function extractSources(
  source: IngestionSource,
  credentials: SharePointCredentials,
): Promise<IngestionDocument[]> {
  return (await acquireAndExtractSources(source, credentials)).documents;
}

export async function extractSource(
  source: IngestionSource,
  credentials: SharePointCredentials,
): Promise<IngestionDocument> {
  const documents = await extractSources(source, credentials);
  const document = documents[0];
  if (!document) throw new Error(`Source ${source.id} returned no document.`);
  return document;
}
