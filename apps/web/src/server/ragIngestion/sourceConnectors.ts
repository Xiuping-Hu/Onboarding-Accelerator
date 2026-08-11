import { lookup } from 'node:dns/promises';
import { stat } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { stripHtml } from '../ragAdapters/textRetrieval';
import { defaultConnectorKind } from './sourceRegistry';
import type {
  AcquiredArtifact,
  AcquisitionContext,
  AcquisitionResult,
  IngestionSource,
  SourceConnector,
} from './types';

export interface SharePointCredentials {
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
}

export interface ConnectorRuntimeOptions {
  fetch?: typeof fetch;
  resolveHostname?: (hostname: string) => Promise<string[]>;
  maximumFileBytes?: number;
  websiteAllowlist?: string[];
}

export class ConnectorRegistry {
  constructor(private readonly connectors: SourceConnector[]) {}

  async acquire(source: IngestionSource, context: AcquisitionContext): Promise<AcquisitionResult> {
    const connector = this.connectors.find((candidate) => candidate.canHandle(source));
    if (!connector) {
      throw new Error(
        `No connector is registered for ${source.connectorKind ?? defaultConnectorKind(source.kind)}.`,
      );
    }
    return connector.acquire(source, context);
  }
}

export function createDefaultConnectors(
  credentials: SharePointCredentials,
  options: ConnectorRuntimeOptions = {},
): SourceConnector[] {
  return [
    new HttpWebsiteConnector(options),
    new SharePointConnector(credentials, options.fetch, options.maximumFileBytes),
    new LocalArtifactConnector(options.maximumFileBytes),
  ];
}

export class HttpWebsiteConnector implements SourceConnector {
  readonly kind = 'http_website' as const;
  private readonly fetchImpl: typeof fetch;
  private readonly resolveHostname: (hostname: string) => Promise<string[]>;

  constructor(private readonly options: ConnectorRuntimeOptions = {}) {
    this.fetchImpl = options.fetch ?? fetch;
    this.resolveHostname = options.resolveHostname ?? resolvePublicAddresses;
  }

  canHandle(source: IngestionSource): boolean {
    return (source.connectorKind ?? defaultConnectorKind(source.kind)) === this.kind;
  }

  async acquire(source: IngestionSource, context: AcquisitionContext): Promise<AcquisitionResult> {
    const configuredUrl = new URL(source.uri);
    const maximumBytes =
      source.website?.maxPageBytes ?? this.options.maximumFileBytes ?? 1024 * 1024;
    const maximumRedirects = source.website?.maxRedirects ?? 5;
    const timeoutMs = source.website?.timeoutMs ?? 15_000;
    const previous = context.previousDocuments.find(
      (document) => document.canonicalUri === source.uri,
    );
    const headers: Record<string, string> = {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'Onboarding-Accelerator-RAG/1.0',
    };
    if (previous?.etag) headers['If-None-Match'] = previous.etag;
    if (previous?.upstreamUpdatedAt) headers['If-Modified-Since'] = previous.upstreamUpdatedAt;

    let currentUrl = configuredUrl;
    for (let redirectCount = 0; redirectCount <= maximumRedirects; redirectCount += 1) {
      await this.validateTarget(source, configuredUrl, currentUrl);
      const response = await this.fetchImpl(currentUrl, {
        redirect: 'manual',
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (response.status === 304) {
        return { status: 'unchanged', artifacts: [], complete: true, warnings: [] };
      }
      if (isRedirect(response.status)) {
        const location = response.headers.get('location');
        if (!location) throw new Error('Website redirect did not include a location.');
        if (redirectCount === maximumRedirects) {
          throw new Error(`Website exceeded the ${maximumRedirects} redirect limit.`);
        }
        currentUrl = new URL(location, currentUrl);
        continue;
      }
      if (!response.ok) throw new Error(`Website fetch failed with status ${response.status}.`);

      const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
      if (contentType && !['text/html', 'application/xhtml+xml'].includes(contentType)) {
        throw new Error(`Website returned unsupported content type ${contentType}.`);
      }
      const declaredBytes = Number.parseInt(response.headers.get('content-length') ?? '0', 10);
      if (declaredBytes > maximumBytes) {
        throw new Error(`Website response exceeded the ${maximumBytes}-byte limit.`);
      }
      const html = await response.text();
      if (Buffer.byteLength(html, 'utf8') > maximumBytes) {
        throw new Error(`Website response exceeded the ${maximumBytes}-byte limit.`);
      }

      const canonicalUri = response.url || currentUrl.toString();
      return {
        status: 'acquired',
        complete: true,
        warnings: [],
        artifacts: [
          {
            artifactKey: source.id,
            source,
            uri: canonicalUri,
            title: source.title,
            mediaType: contentType ?? 'text/html',
            content: html,
            updatedAt: isoDate(response.headers.get('last-modified')),
            etag: response.headers.get('etag') ?? undefined,
            metadata: { canonicalUrl: canonicalUri },
          },
        ],
      };
    }
    throw new Error('Website redirect processing failed.');
  }

  private async validateTarget(
    source: IngestionSource,
    configuredUrl: URL,
    target: URL,
  ): Promise<void> {
    if (!['https:', 'http:'].includes(target.protocol)) {
      throw new Error(`Website protocol ${target.protocol} is not allowed.`);
    }
    if (process.env.NODE_ENV === 'production' && target.protocol !== 'https:') {
      throw new Error('Website ingestion requires HTTPS in production.');
    }

    const configuredOrigins = source.website?.allowedOrigins ?? this.options.websiteAllowlist ?? [];
    const allowedOrigins = configuredOrigins.length ? configuredOrigins : [configuredUrl.origin];
    const originAllowed = allowedOrigins.some((entry) => {
      if (entry === '*') return process.env.NODE_ENV !== 'production';
      try {
        return new URL(entry).origin === target.origin;
      } catch {
        return target.hostname === entry || target.hostname.endsWith(`.${entry}`);
      }
    });
    if (!originAllowed) throw new Error(`Website origin ${target.origin} is not allowlisted.`);

    const allowedPaths = source.website?.allowedPaths ?? [configuredUrl.pathname];
    if (!allowedPaths.some((path) => target.pathname.startsWith(path))) {
      throw new Error(`Website path ${target.pathname} is outside the approved crawl scope.`);
    }

    if (source.metadata?.allowPrivateNetwork === true) return;
    const addresses = await this.resolveHostname(target.hostname);
    if (!addresses.length || addresses.some(isPrivateAddress)) {
      throw new Error(`Website host ${target.hostname} did not resolve to a public address.`);
    }
  }
}

export class LocalArtifactConnector implements SourceConnector {
  readonly kind = 'local_artifact' as const;

  constructor(private readonly maximumFileBytes = 20 * 1024 * 1024) {}

  canHandle(source: IngestionSource): boolean {
    const kind = source.connectorKind ?? defaultConnectorKind(source.kind);
    return kind === this.kind || kind === 'manual_artifact';
  }

  async acquire(source: IngestionSource): Promise<AcquisitionResult> {
    const path = resolve(source.path ?? source.uri);
    const file = await stat(path);
    if (!file.isFile()) throw new Error(`Artifact ${path} is not a file.`);
    if (file.size > this.maximumFileBytes) {
      throw new Error(`Artifact ${path} exceeded the ${this.maximumFileBytes}-byte limit.`);
    }
    const mediaType = mediaTypeForPath(path, source.kind);
    if (source.allowedContentTypes?.length && !source.allowedContentTypes.includes(mediaType)) {
      throw new Error(`Artifact media type ${mediaType} is not approved for source ${source.id}.`);
    }

    return {
      status: 'acquired',
      complete: true,
      warnings: [],
      artifacts: [
        {
          artifactKey: source.id,
          source,
          uri: source.uri,
          title: source.title,
          mediaType,
          path,
          updatedAt: file.mtime.toISOString(),
          metadata: { fileBytes: file.size },
        },
      ],
    };
  }
}

export class SharePointConnector implements SourceConnector {
  readonly kind = 'sharepoint' as const;
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly credentials: SharePointCredentials,
    fetchImpl?: typeof fetch,
    private readonly maximumFileBytes = 1024 * 1024,
  ) {
    this.fetchImpl = fetchImpl ?? fetch;
  }

  canHandle(source: IngestionSource): boolean {
    return (source.connectorKind ?? defaultConnectorKind(source.kind)) === this.kind;
  }

  async acquire(source: IngestionSource): Promise<AcquisitionResult> {
    const credentials = requiredCredentials(this.credentials);
    const token = await this.getGraphToken(credentials);
    const sourceUrl = new URL(source.uri);
    const folderConfigured =
      source.kind === 'sharepoint_folder' || Boolean(source.sharepoint?.folderPath);
    if (folderConfigured && !source.sharepoint?.siteId && !source.sharepoint?.sitePath) {
      throw new Error(`SharePoint folder source ${source.id} requires siteId or sitePath.`);
    }
    const siteUrl = folderConfigured
      ? new URL(source.sharepoint?.sitePath ?? '/', sourceUrl.origin)
      : sourceUrl;
    const siteId = source.sharepoint?.siteId ?? (await this.getSiteId(siteUrl, token));
    if (folderConfigured) return this.acquireFolder(source, siteId, token);

    const maxPages = source.sharepoint?.maxPages ?? 200;
    const listed = await this.listPages(siteId, token, maxPages);
    if (!listed.complete) {
      return {
        status: 'acquired',
        artifacts: [],
        complete: false,
        warnings: [`SharePoint crawl exceeded the ${maxPages}-page limit.`],
      };
    }

    const selectedPages = source.sharepoint?.crawlAllPages
      ? listed.pages
      : [this.selectPage(source, listed.pages)];
    const artifacts: AcquiredArtifact[] = [];
    for (const page of selectedPages) {
      artifacts.push(await this.acquirePage(source, sourceUrl, siteId, page, token));
    }
    return { status: 'acquired', artifacts, complete: true, warnings: [] };
  }

  private async acquireFolder(
    source: IngestionSource,
    siteId: string,
    token: string,
  ): Promise<AcquisitionResult> {
    const libraryName = source.sharepoint?.libraryName;
    const folderPath = source.sharepoint?.folderPath;
    if (!libraryName || !folderPath) {
      throw new Error(`SharePoint folder source ${source.id} requires libraryName and folderPath.`);
    }

    const drive = this.selectDrive(libraryName, await this.listDrives(siteId, token));
    const maxFiles = source.sharepoint?.maxFiles ?? 100;
    const listing = await this.listFolderFiles(
      drive.id,
      folderPath,
      source.sharepoint?.recursive !== false,
      maxFiles,
      source.sharepoint?.maxDepth ?? 8,
      token,
    );
    if (!listing.complete) {
      return {
        status: 'acquired',
        artifacts: [],
        complete: false,
        warnings: listing.warnings,
      };
    }

    const artifacts: AcquiredArtifact[] = [];
    const warnings = [...listing.warnings];
    const maximumBytes = source.sharepoint?.maxFileBytes ?? this.maximumFileBytes;
    for (const listed of listing.files) {
      const mediaType = mediaTypeForDriveItem(listed.item);
      if (!mediaType || !SUPPORTED_REMOTE_MEDIA_TYPES.has(mediaType)) {
        warnings.push(`Skipped unsupported SharePoint file ${listed.relativePath}.`);
        continue;
      }
      if (source.allowedContentTypes?.length && !source.allowedContentTypes.includes(mediaType)) {
        warnings.push(`Skipped disallowed SharePoint media type ${mediaType}.`);
        continue;
      }
      if ((listed.item.size ?? 0) > maximumBytes) {
        warnings.push(
          `Skipped SharePoint file ${listed.relativePath} because it exceeded ${maximumBytes} bytes.`,
        );
        continue;
      }

      const data = await this.downloadDriveItem(drive.id, listed.item, maximumBytes, token);
      const inline = INLINE_REMOTE_MEDIA_TYPES.has(mediaType);
      artifacts.push({
        artifactKey: `${source.id}:drive-item:${listed.item.id}`,
        source: {
          ...source,
          id: `${source.id}:${listed.item.id}`,
          uri: listed.item.webUrl ?? source.uri,
          title: listed.item.name,
          metadata: { ...source.metadata, rootSourceId: source.id },
        },
        uri: listed.item.webUrl ?? source.uri,
        title: listed.item.name,
        mediaType,
        content: inline ? Buffer.from(data).toString('utf8') : undefined,
        data: inline ? undefined : data,
        updatedAt: isoDate(listed.item.lastModifiedDateTime),
        etag: listed.item.eTag,
        metadata: {
          siteId,
          driveId: drive.id,
          driveItemId: listed.item.id,
          relativePath: listed.relativePath,
          fileBytes: data.byteLength,
        },
      });
    }
    return { status: 'acquired', artifacts, complete: true, warnings };
  }

  private async getGraphToken(credentials: Required<SharePointCredentials>): Promise<string> {
    const response = await this.fetchImpl(
      `https://login.microsoftonline.com/${encodeURIComponent(credentials.tenantId)}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: credentials.clientId,
          client_secret: credentials.clientSecret,
          grant_type: 'client_credentials',
          scope: 'https://graph.microsoft.com/.default',
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`Microsoft token request failed with status ${response.status}.`);
    }
    const payload = (await response.json()) as { access_token?: string };
    if (!payload.access_token) {
      throw new Error('Microsoft token response did not contain an access token.');
    }
    return payload.access_token;
  }

  private async getSiteId(sourceUrl: URL, token: string): Promise<string> {
    const sitePath = sourceUrl.pathname.replace(/\/+$/, '');
    const siteEndpoint = sitePath
      ? `https://graph.microsoft.com/v1.0/sites/${sourceUrl.hostname}:${sitePath}`
      : `https://graph.microsoft.com/v1.0/sites/${sourceUrl.hostname}`;
    const site = await this.graphGet<{ id?: string }>(siteEndpoint, token);
    if (!site.id) {
      throw new Error(`Microsoft Graph did not return an ID for ${sourceUrl.hostname}.`);
    }
    return site.id;
  }

  private async listDrives(siteId: string, token: string): Promise<GraphDrive[]> {
    let nextUrl: string | undefined =
      `https://graph.microsoft.com/v1.0/sites/${siteId}/drives?` +
      '$select=id,name,webUrl,driveType&$top=100';
    const drives: GraphDrive[] = [];
    while (nextUrl) {
      const response: GraphDriveList = await this.graphGet<GraphDriveList>(nextUrl, token);
      drives.push(...(response.value ?? []).filter(hasGraphId));
      nextUrl = response['@odata.nextLink'];
    }
    return drives;
  }

  private selectDrive(libraryName: string, drives: GraphDrive[]): GraphDrive & { id: string } {
    const expected = libraryName.toLowerCase();
    const drive = drives.find((candidate) => {
      const webName = candidate.webUrl ? lastUrlPathSegment(candidate.webUrl) : undefined;
      return candidate.name?.toLowerCase() === expected || webName?.toLowerCase() === expected;
    });
    if (!drive?.id) {
      throw new Error(`SharePoint document library ${libraryName} was not found.`);
    }
    return drive as GraphDrive & { id: string };
  }

  private async listFolderFiles(
    driveId: string,
    folderPath: string,
    recursive: boolean,
    maxFiles: number,
    maxDepth: number,
    token: string,
  ): Promise<{
    files: Array<{ item: GraphDriveItem & { id: string; name: string }; relativePath: string }>;
    complete: boolean;
    warnings: string[];
  }> {
    const files: Array<{
      item: GraphDriveItem & { id: string; name: string };
      relativePath: string;
    }> = [];
    const warnings: string[] = [];
    const folders: Array<{ url: string; depth: number; relativePath: string }> = [
      {
        url:
          `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/` +
          `${encodeGraphPath(folderPath)}:/children?${DRIVE_ITEM_SELECT}&$top=200`,
        depth: 0,
        relativePath: folderPath,
      },
    ];
    let visitedFolders = 0;
    while (folders.length) {
      const folder = folders.shift();
      if (!folder) break;
      visitedFolders += 1;
      if (visitedFolders > maxFiles) {
        return {
          files: [],
          complete: false,
          warnings: [`SharePoint crawl exceeded the ${maxFiles}-folder safety limit.`],
        };
      }
      let nextUrl: string | undefined = folder.url;
      while (nextUrl) {
        const response: GraphDriveItemList = await this.graphGet<GraphDriveItemList>(
          nextUrl,
          token,
        );
        for (const item of response.value ?? []) {
          if (!item.id || !item.name) continue;
          const relativePath = joinGraphPath(folder.relativePath, item.name);
          if (item.folder) {
            if (!recursive) continue;
            if (folder.depth >= maxDepth) {
              return {
                files: [],
                complete: false,
                warnings: [`SharePoint crawl exceeded the configured depth of ${maxDepth}.`],
              };
            }
            folders.push({
              url:
                `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${item.id}/children?` +
                `${DRIVE_ITEM_SELECT}&$top=200`,
              depth: folder.depth + 1,
              relativePath,
            });
          } else if (item.file) {
            files.push({
              item: item as GraphDriveItem & { id: string; name: string },
              relativePath,
            });
            if (files.length > maxFiles) {
              return {
                files: [],
                complete: false,
                warnings: [`SharePoint crawl exceeded the ${maxFiles}-file limit.`],
              };
            }
          }
        }
        nextUrl = response['@odata.nextLink'];
      }
    }
    return { files, complete: true, warnings };
  }

  private async downloadDriveItem(
    driveId: string,
    item: GraphDriveItem & { id: string },
    maximumBytes: number,
    token: string,
  ): Promise<Uint8Array> {
    const response = await this.fetchImpl(
      `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${item.id}/content`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!response.ok) {
      throw new Error(`Microsoft Graph download failed with status ${response.status}.`);
    }
    const declaredBytes = Number.parseInt(response.headers.get('content-length') ?? '0', 10);
    if (declaredBytes > maximumBytes) {
      throw new Error(`SharePoint file ${item.name ?? item.id} exceeded ${maximumBytes} bytes.`);
    }
    const data = new Uint8Array(await response.arrayBuffer());
    if (data.byteLength > maximumBytes) {
      throw new Error(`SharePoint file ${item.name ?? item.id} exceeded ${maximumBytes} bytes.`);
    }
    return data;
  }

  private async listPages(
    siteId: string,
    token: string,
    maximumPages: number,
  ): Promise<{ pages: GraphPage[]; complete: boolean }> {
    let nextUrl: string | undefined =
      `https://graph.microsoft.com/v1.0/sites/${siteId}/pages?` +
      '$select=id,name,title,lastModifiedDateTime,lastModifiedBy&$top=100';
    const pages: GraphPage[] = [];
    while (nextUrl) {
      const response: GraphPageList = await this.graphGet<GraphPageList>(nextUrl, token);
      for (const page of response.value ?? []) {
        if (page.id && page.name) pages.push(page);
        if (pages.length > maximumPages) return { pages: [], complete: false };
      }
      nextUrl = response['@odata.nextLink'];
    }
    return { pages, complete: true };
  }

  private selectPage(source: IngestionSource, pages: GraphPage[]): GraphPage {
    const pageName = source.sharepoint?.pageName ?? new URL(source.uri).pathname.split('/').pop();
    if (!pageName) throw new Error(`Cannot identify SharePoint page from ${source.uri}.`);
    const page = pages.find(
      (candidate) => candidate.name?.toLowerCase() === pageName.toLowerCase(),
    );
    if (!page) throw new Error(`SharePoint page ${pageName} was not found.`);
    return page;
  }

  private async acquirePage(
    source: IngestionSource,
    sourceUrl: URL,
    siteId: string,
    page: GraphPage,
    token: string,
  ): Promise<AcquiredArtifact> {
    if (!page.id || !page.name) throw new Error('SharePoint page is missing an ID or name.');
    const expanded = await this.graphGet<GraphPage>(
      `https://graph.microsoft.com/v1.0/sites/${siteId}/pages/${page.id}/microsoft.graph.sitePage?$expand=canvasLayout`,
      token,
    );
    const text = collectCanvasText(expanded.canvasLayout);
    if (!text) throw new Error(`SharePoint page ${page.name} returned no indexable canvas text.`);
    const pageUri = new URL(`/SitePages/${page.name}`, sourceUrl.origin).toString();
    const title = expanded.title ?? page.title ?? page.name;
    return {
      artifactKey: `${source.id}:page:${page.id}`,
      source: {
        ...source,
        id: `${source.id}:${page.id}`,
        uri: pageUri,
        title,
        metadata: { ...source.metadata, rootSourceId: source.id },
      },
      uri: pageUri,
      title,
      mediaType: 'text/plain',
      content: text,
      updatedAt: isoDate(expanded.lastModifiedDateTime ?? page.lastModifiedDateTime),
      metadata: {
        siteId,
        pageId: page.id,
        pageName: page.name,
        modifiedBy:
          expanded.lastModifiedBy?.user?.displayName ??
          page.lastModifiedBy?.user?.displayName ??
          'unknown',
      },
    };
  }

  private async graphGet<T>(url: string, token: string): Promise<T> {
    const response = await this.fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error(`Microsoft Graph request failed with status ${response.status}.`);
    }
    return (await response.json()) as T;
  }
}

function requiredCredentials(credentials: SharePointCredentials): Required<SharePointCredentials> {
  if (!credentials.tenantId || !credentials.clientId || !credentials.clientSecret) {
    throw new Error(
      'SharePoint ingestion requires RAG_SHAREPOINT_* credentials or the equivalent AUTH_MICROSOFT_* SSO credentials.',
    );
  }
  return {
    tenantId: credentials.tenantId,
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
  };
}

async function resolvePublicAddresses(hostname: string): Promise<string[]> {
  if (isIpAddress(hostname)) return [hostname];
  return (await lookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address);
}

function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === '::1' || normalized === '::' || normalized.startsWith('fe80:')) return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  const mapped = normalized.startsWith('::ffff:') ? normalized.slice(7) : normalized;
  const parts = mapped.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  const [first = -1, second = -1] = parts;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    first >= 224
  );
}

function isIpAddress(value: string): boolean {
  return /^[\d.]+$/.test(value) || value.includes(':');
}

function isRedirect(status: number): boolean {
  return [301, 302, 303, 307, 308].includes(status);
}

function mediaTypeForPath(path: string, sourceKind: IngestionSource['kind']): string {
  const extension = extname(path).toLowerCase();
  const byExtension: Record<string, string> = {
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.pdf': 'application/pdf',
    '.vtt': 'text/vtt',
    '.srt': 'application/x-subrip',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
  };
  const mediaType = byExtension[extension];
  if (mediaType) return mediaType;
  if (sourceKind === 'audio') return 'application/octet-stream';
  throw new Error(`Unsupported artifact extension ${extension}.`);
}

const SUPPORTED_REMOTE_MEDIA_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/csv',
  'text/html',
  'text/markdown',
  'text/plain',
]);

const INLINE_REMOTE_MEDIA_TYPES = new Set(['text/csv', 'text/html', 'text/markdown', 'text/plain']);

const DRIVE_ITEM_SELECT =
  '$select=id,name,webUrl,size,eTag,lastModifiedDateTime,file,folder,parentReference';

function mediaTypeForDriveItem(item: GraphDriveItem): string | undefined {
  const graphMediaType = item.file?.mimeType?.split(';')[0]?.trim().toLowerCase();
  const byExtension: Record<string, string> = {
    '.csv': 'text/csv',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.html': 'text/html',
    '.htm': 'text/html',
    '.md': 'text/markdown',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
  };
  const extension = extname(item.name ?? '').toLowerCase();
  return byExtension[extension] ?? graphMediaType;
}

function encodeGraphPath(path: string): string {
  return path
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function joinGraphPath(parent: string, child: string): string {
  return `${parent.replace(/\/+$/, '')}/${child}`;
}

function lastUrlPathSegment(value: string): string | undefined {
  try {
    const segments = new URL(value).pathname.split('/').filter(Boolean);
    const segment = segments.at(-1);
    return segment ? decodeURIComponent(segment) : undefined;
  } catch {
    return undefined;
  }
}

function hasGraphId<T extends { id?: string }>(value: T): value is T & { id: string } {
  return Boolean(value.id);
}

function collectCanvasText(value: unknown): string {
  const parts: string[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
    } else if (node && typeof node === 'object') {
      for (const [key, child] of Object.entries(node)) {
        if (
          typeof child === 'string' &&
          ['innerHtml', 'text', 'title', 'description'].includes(key)
        ) {
          parts.push(key === 'innerHtml' ? stripHtml(structureHtml(child)) : child);
        } else {
          visit(child);
        }
      }
    }
  };
  visit(value);
  return [...new Set(parts.map((part) => part.trim()).filter(Boolean))].join('\n\n');
}

function structureHtml(html: string): string {
  return html
    .replace(/<h([1-6])[^>]*>/gi, (_match, level: string) => `\n\n${'#'.repeat(Number(level))} `)
    .replace(/<\/(h[1-6]|p|div|section|article|li|tr)>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<br\s*\/?>/gi, '\n');
}

function isoDate(value?: string | null): string {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

interface GraphPage {
  id?: string;
  name?: string;
  title?: string;
  lastModifiedDateTime?: string;
  lastModifiedBy?: { user?: { displayName?: string } };
  canvasLayout?: unknown;
}

interface GraphPageList {
  value?: GraphPage[];
  '@odata.nextLink'?: string;
}

interface GraphDrive {
  id?: string;
  name?: string;
  webUrl?: string;
  driveType?: string;
}

interface GraphDriveList {
  value?: GraphDrive[];
  '@odata.nextLink'?: string;
}

interface GraphDriveItem {
  id?: string;
  name?: string;
  webUrl?: string;
  size?: number;
  eTag?: string;
  lastModifiedDateTime?: string;
  file?: { mimeType?: string };
  folder?: { childCount?: number };
}

interface GraphDriveItemList {
  value?: GraphDriveItem[];
  '@odata.nextLink'?: string;
}
