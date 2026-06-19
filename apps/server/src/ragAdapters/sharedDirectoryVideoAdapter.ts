import { extname } from 'node:path';
import { SharedDirectoryTextAdapter } from './sharedDirectoryBase.js';
import type { SharedDirectoryAdapterOptions } from './types.js';

export class SharedDirectoryVideoAdapter extends SharedDirectoryTextAdapter {
  constructor(options: SharedDirectoryAdapterOptions) {
    super('shared-directory-videos', 'shared_directory_video', ['.vtt', '.srt', '.txt'], options);
  }

  protected override metadataFor(
    filePath: string,
  ): Record<string, string | number | boolean | undefined> {
    return {
      ...super.metadataFor(filePath),
      transcriptSidecar: true,
    };
  }

  protected normalizeText(filePath: string, text: string): string {
    const extension = extname(filePath).toLowerCase();

    if (extension === '.vtt' || extension === '.srt') {
      return text
        .replace(/^WEBVTT.*$/im, '')
        .replace(/^\d+$/gm, '')
        .replace(/\d{2}:\d{2}:\d{2}[,.]\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}[,.]\d{3}.*$/gm, '')
        .replace(/<[^>]+>/g, ' ');
    }

    return text;
  }
}
