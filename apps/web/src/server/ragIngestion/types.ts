export type IngestionSourceKind =
  | 'document'
  | 'pdf'
  | 'transcript'
  | 'audio'
  | 'website'
  | 'sharepoint_page'
  | 'sharepoint_folder';

export type IngestionConnectorKind =
  | 'local_artifact'
  | 'http_website'
  | 'sharepoint'
  | 'manual_artifact';

export type IngestionTriggerType = 'manual' | 'scheduled' | 'event' | 'reindex';

export type IngestionPublicationPolicy = 'manual_review' | 'auto_after_validation';

export interface IngestionSource {
  id: string;
  kind: IngestionSourceKind;
  uri: string;
  title?: string;
  path?: string;
  owner: string;
  accessScope: string;
  refreshCadence?: string;
  connectorKind?: IngestionConnectorKind;
  allowedContentTypes?: string[];
  allowedTriggers?: IngestionTriggerType[];
  credentialRef?: string;
  publicationPolicy?: IngestionPublicationPolicy;
  reviewed?: boolean;
  enabled?: boolean;
  roadmapAuthoritative?: boolean;
  metadata?: Record<string, string | number | boolean>;
  website?: {
    allowedOrigins?: string[];
    allowedPaths?: string[];
    maxRedirects?: number;
    maxPageBytes?: number;
    timeoutMs?: number;
  };
  validation?: {
    maximumReductionRatio?: number;
    requireManualReview?: boolean;
  };
  schedule?: {
    cron: string;
    timezone: string;
    enabled?: boolean;
    maxRuntimeSeconds?: number;
  };
  sharepoint?: {
    siteId?: string;
    sitePath?: string;
    pageName?: string;
    crawlAllPages?: boolean;
    maxPages?: number;
    libraryName?: string;
    folderPath?: string;
    recursive?: boolean;
    maxFiles?: number;
    maxDepth?: number;
    maxFileBytes?: number;
  };
}

export interface IngestionRegistry {
  sources: IngestionSource[];
}

export interface IngestionDocument {
  source: IngestionSource;
  documentKey?: string;
  canonicalUri?: string;
  title: string;
  text: string;
  mediaType?: string;
  contentHash?: string;
  versionKey?: string;
  etag?: string;
  updatedAt: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface IngestionChunk {
  id: string;
  title: string;
  text: string;
  uri: string;
  metadata: Record<string, string | number | boolean>;
}

export interface IngestionReport {
  sourceId: string;
  status: 'indexed' | 'dry_run' | 'unchanged' | 'requires_review' | 'skipped' | 'failed';
  chunkCount: number;
  documentCount?: number;
  characterCount?: number;
  manifestHash?: string;
  sourceVersionId?: string;
  warnings: string[];
  error?: string;
}

export interface CanonicalManifest {
  hash: string;
  documents: IngestionDocument[];
  documentCount: number;
  characterCount: number;
}

export interface AcquiredArtifact {
  artifactKey: string;
  source: IngestionSource;
  uri: string;
  title?: string;
  mediaType: string;
  content?: string;
  data?: Uint8Array;
  path?: string;
  updatedAt: string;
  etag?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface AcquisitionResult {
  status: 'acquired' | 'unchanged';
  artifacts: AcquiredArtifact[];
  complete: boolean;
  warnings: string[];
}

export interface PreviousSourceDocument {
  documentKey: string;
  canonicalUri: string;
  contentHash: string;
  etag?: string;
  upstreamUpdatedAt?: string;
}

export interface AcquisitionContext {
  previousDocuments: PreviousSourceDocument[];
}

export interface SourceConnector {
  readonly kind: IngestionConnectorKind;
  canHandle(source: IngestionSource): boolean;
  acquire(source: IngestionSource, context: AcquisitionContext): Promise<AcquisitionResult>;
}

export interface ContentExtractor {
  readonly id: string;
  canHandle(artifact: AcquiredArtifact): boolean;
  extract(artifact: AcquiredArtifact): Promise<IngestionDocument[]>;
}
