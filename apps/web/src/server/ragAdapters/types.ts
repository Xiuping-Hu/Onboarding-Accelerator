import type { SourceProvenance } from '@onboarding/shared';

export type RagInputSourceKind =
  | 'shared_directory_document'
  | 'shared_directory_video'
  | 'shared_directory_sheet'
  | 'website';

export interface RagInput {
  uri: string;
  sourceKind?: RagInputSourceKind;
}

export interface RagInputAdapter {
  id: string;
  sourceKind: RagInputSourceKind;
  canHandle(input: RagInput): boolean;
  load(input: RagInput): Promise<SourceProvenance[]>;
  retrieve(query: string): Promise<SourceProvenance[]>;
}

export interface SharedDirectoryAdapterOptions {
  directory?: string;
  maxFileBytes: number;
  maxChunksPerSource: number;
}

export interface WebsiteAdapterOptions {
  allowlist: string[];
  maxPageBytes: number;
  maxChunksPerSource: number;
  fetch?: FetchLike;
}

export type FetchLike = (
  input: string,
  init?: { redirect?: 'error' | 'follow' | 'manual' },
) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;
