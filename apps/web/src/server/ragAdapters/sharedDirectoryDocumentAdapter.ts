import { extname } from 'node:path';
import { SharedDirectoryTextAdapter } from './sharedDirectoryBase';
import type { SharedDirectoryAdapterOptions } from './types';

export class SharedDirectoryDocumentAdapter extends SharedDirectoryTextAdapter {
  constructor(options: SharedDirectoryAdapterOptions) {
    super('shared-directory-documents', 'shared_directory_document', ['.txt', '.md'], options);
  }

  protected normalizeText(filePath: string, text: string): string {
    const extension = extname(filePath).toLowerCase();

    if (extension === '.md') {
      return text.replace(/^#{1,6}\s+/gm, '').replace(/`{3}[\s\S]*?`{3}/g, ' ');
    }

    return text;
  }
}
