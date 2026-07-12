export type IngestionSourceKind =
  | 'document'
  | 'pdf'
  | 'transcript'
  | 'audio'
  | 'website'
  | 'sharepoint_page';

export interface IngestionSource {
  id: string;
  kind: IngestionSourceKind;
  uri: string;
  title?: string;
  path?: string;
  owner: string;
  accessScope: string;
  refreshCadence?: string;
  reviewed?: boolean;
  enabled?: boolean;
  metadata?: Record<string, string | number | boolean>;
  sharepoint?: {
    siteId?: string;
    pageName?: string;
    crawlAllPages?: boolean;
    maxPages?: number;
  };
}

export interface IngestionRegistry {
  sources: IngestionSource[];
}

export interface IngestionDocument {
  source: IngestionSource;
  title: string;
  text: string;
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
  status: 'indexed' | 'dry_run' | 'skipped' | 'failed';
  chunkCount: number;
  warnings: string[];
  error?: string;
}
