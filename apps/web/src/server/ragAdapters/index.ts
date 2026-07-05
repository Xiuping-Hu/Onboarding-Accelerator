import type { ServerConfig } from '../config';
import { SharedDirectoryDocumentAdapter } from './sharedDirectoryDocumentAdapter';
import { SharedDirectorySheetAdapter } from './sharedDirectorySheetAdapter';
import { SharedDirectoryVideoAdapter } from './sharedDirectoryVideoAdapter';
import type { RagInputAdapter } from './types';
import { WebsiteAdapter } from './websiteAdapter';

export function createConfiguredRagInputAdapters(config: ServerConfig): RagInputAdapter[] {
  const sharedOptions = {
    directory: config.ragSharedDirectory,
    maxFileBytes: config.ragMaxFileBytes,
    maxChunksPerSource: config.ragMaxChunksPerSource,
  };

  return [
    new SharedDirectoryDocumentAdapter(sharedOptions),
    new SharedDirectoryVideoAdapter(sharedOptions),
    new SharedDirectorySheetAdapter(sharedOptions),
    new WebsiteAdapter({
      allowlist: config.ragWebsiteAllowlist,
      maxPageBytes: config.ragMaxFileBytes,
      maxChunksPerSource: config.ragMaxChunksPerSource,
    }),
  ];
}
