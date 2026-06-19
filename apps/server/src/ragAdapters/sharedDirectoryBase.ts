import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import type { SourceProvenance } from '@onboarding/shared';
import type { RagInput, SharedDirectoryAdapterOptions } from './types.js';
import {
  chunkText,
  rankChunks,
  sourceIdForUri,
  titleFromPath,
  type TextChunk,
} from './textRetrieval.js';

export abstract class SharedDirectoryTextAdapter {
  protected readonly chunks = new Map<string, TextChunk[]>();
  protected readonly directory?: string;

  protected constructor(
    public readonly id: string,
    public readonly sourceKind:
      | 'shared_directory_document'
      | 'shared_directory_video'
      | 'shared_directory_sheet',
    protected readonly extensions: string[],
    protected readonly options: SharedDirectoryAdapterOptions,
  ) {
    this.directory = options.directory ? resolve(options.directory) : undefined;
  }

  canHandle(input: RagInput): boolean {
    return (
      (!input.sourceKind || input.sourceKind === this.sourceKind) &&
      this.extensions.includes(extname(input.uri).toLowerCase())
    );
  }

  async load(input: RagInput): Promise<SourceProvenance[]> {
    if (!this.canHandle(input)) {
      return [];
    }

    const filePath = resolve(input.uri);
    const chunks = await this.loadFile(filePath);
    this.chunks.set(filePath, chunks);
    return rankChunks('', chunks, this.options.maxChunksPerSource);
  }

  async retrieve(query: string): Promise<SourceProvenance[]> {
    await this.refreshDirectory();
    return rankChunks(query, [...this.chunks.values()].flat(), this.options.maxChunksPerSource);
  }

  protected abstract normalizeText(filePath: string, text: string): string;

  protected metadataFor(filePath: string): Record<string, string | number | boolean | undefined> {
    return {
      adapterId: this.id,
      sourceKind: this.sourceKind,
      fileName: titleFromPath(this.directory ?? '', filePath),
    };
  }

  private async refreshDirectory(): Promise<void> {
    if (!this.directory) {
      return;
    }

    let entries: string[];
    try {
      entries = await readdir(this.directory);
    } catch {
      return;
    }

    const files = entries.map((entry) => join(this.directory as string, entry));

    for (const filePath of files) {
      if (!this.extensions.includes(extname(filePath).toLowerCase())) {
        continue;
      }

      if (!this.chunks.has(filePath)) {
        this.chunks.set(filePath, await this.loadFile(filePath));
      }
    }
  }

  private async loadFile(filePath: string): Promise<TextChunk[]> {
    const fileStat = await stat(filePath);

    if (!fileStat.isFile() || fileStat.size > this.options.maxFileBytes) {
      return [];
    }

    const text = await readFile(filePath, 'utf8');
    const uri = `file://${filePath.replace(/\\/g, '/')}`;
    return chunkText(
      sourceIdForUri(this.id, uri),
      titleFromPath(this.directory ?? '', filePath),
      this.normalizeText(filePath, text),
      uri,
      'knowledge_base',
      this.options.maxChunksPerSource,
      {
        ...this.metadataFor(filePath),
        fileBytes: fileStat.size,
      },
    );
  }
}
