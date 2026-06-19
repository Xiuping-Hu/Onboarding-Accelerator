import type { ServerConfig } from '../config.js';
import { SharedDirectoryDocumentAdapter } from './sharedDirectoryDocumentAdapter.js';
import { SharedDirectorySheetAdapter } from './sharedDirectorySheetAdapter.js';
import { SharedDirectoryVideoAdapter } from './sharedDirectoryVideoAdapter.js';
import type { RagInputAdapter } from './types.js';
import { WebsiteAdapter } from './websiteAdapter.js';

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
