import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { stripHtml, extractTitleFromHtml } from '../ragAdapters/textRetrieval';
import { openAiFetch } from '../openAiFetch';
import type { IngestionDocument, IngestionSource } from './types';

export interface SharePointCredentials {
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
}

const execFileAsync = promisify(execFile);

export async function extractSource(
  source: IngestionSource,
  credentials: SharePointCredentials,
): Promise<IngestionDocument> {
  switch (source.kind) {
    case 'website':
      return extractWebsite(source);
    case 'sharepoint_page':
      return extractSharePointPage(source, credentials);
    case 'document':
    case 'transcript':
      return extractTextFile(source);
    case 'pdf':
      return extractPdf(source);
    case 'audio':
      return extractAudio(source);
  }
}

export async function extractSources(
  source: IngestionSource,
  credentials: SharePointCredentials,
): Promise<IngestionDocument[]> {
  if (source.kind !== 'sharepoint_page' || !source.sharepoint?.crawlAllPages) {
    return [await extractSource(source, credentials)];
  }

  if (!credentials.tenantId || !credentials.clientId || !credentials.clientSecret) {
    throw new Error(
      'SharePoint ingestion requires RAG_SHAREPOINT_TENANT_ID, RAG_SHAREPOINT_CLIENT_ID, and RAG_SHAREPOINT_CLIENT_SECRET.',
    );
  }

  const token = await getGraphToken({
    tenantId: credentials.tenantId,
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
  });
  const sourceUrl = new URL(source.uri);
  const siteId = source.sharepoint.siteId ?? (await getSiteId(sourceUrl.hostname, token));
  const pages = await graphGet<{ value?: GraphPage[] }>(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/pages?$select=id,name,title,lastModifiedDateTime,lastModifiedBy&$top=999`,
    token,
  );
  const maxPages = source.sharepoint.maxPages ?? 200;
  const selectedPages = (pages.value ?? [])
    .filter((page) => page.id && page.name)
    .slice(0, maxPages);
  const documents: IngestionDocument[] = [];

  for (const page of selectedPages) {
    documents.push(await extractGraphPage(source, sourceUrl, siteId, page, token));
  }

  return documents;
}

async function extractTextFile(source: IngestionSource): Promise<IngestionDocument> {
  const path = source.path ?? source.uri;
  const file = await stat(path);
  const extension = extname(path).toLowerCase();
  const text =
    extension === '.docx'
      ? await extractDocx(path)
      : ['.txt', '.md', '.vtt', '.srt'].includes(extension)
        ? cleanTranscript(await readFile(path, 'utf8'), extension)
        : undefined;
  if (text === undefined) throw new Error(`Unsupported document extension ${extension}.`);

  return {
    source,
    title: source.title ?? path.split(/[\\/]/).pop() ?? source.id,
    text,
    updatedAt: file.mtime.toISOString(),
  };
}

async function extractPdf(source: IngestionSource): Promise<IngestionDocument> {
  const path = source.path ?? source.uri;
  const file = await stat(path);
  let text = await pdfToText(path);

  if (!text.trim()) {
    const directory = await mkdtemp(join(tmpdir(), 'rag-ocr-'));
    const ocrPath = join(directory, 'ocr.pdf');
    try {
      await execFileAsync('ocrmypdf', ['--skip-text', '--force-ocr', path, ocrPath], {
        maxBuffer: 20 * 1024 * 1024,
      });
      text = await pdfToText(ocrPath);
    } catch {
      throw new Error(
        `PDF ${source.id} contained no extractable text. Install ocrmypdf for scanned-PDF OCR or provide an approved text export.`,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  return {
    source,
    title: source.title ?? path.split(/[\\/]/).pop() ?? source.id,
    text,
    updatedAt: file.mtime.toISOString(),
  };
}

async function extractAudio(source: IngestionSource): Promise<IngestionDocument> {
  if (!source.reviewed) {
    throw new Error(`Audio source ${source.id} must be reviewed or redacted before indexing.`);
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(`Audio source ${source.id} requires OPENAI_API_KEY for transcription.`);
  }

  const path = source.path ?? source.uri;
  const file = await stat(path);
  const audio = await readFile(path);
  const form = new FormData();
  form.append('model', 'gpt-4o-mini-transcribe');
  form.append('file', new Blob([audio]), path.split(/[\\/]/).pop() ?? 'audio');
  const response = await openAiFetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  });
  if (!response.ok) throw new Error(`Audio transcription failed with status ${response.status}.`);
  const payload = (await response.json()) as { text?: string };
  if (!payload.text?.trim())
    throw new Error(`Audio transcription for ${source.id} returned no text.`);

  return {
    source,
    title: source.title ?? path.split(/[\\/]/).pop() ?? source.id,
    text: payload.text,
    updatedAt: file.mtime.toISOString(),
    metadata: { transcriptionModel: 'gpt-4o-mini-transcribe', reviewed: true },
  };
}

async function extractWebsite(source: IngestionSource): Promise<IngestionDocument> {
  const response = await fetch(source.uri, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Website fetch failed with status ${response.status}.`);

  const html = await response.text();
  const updatedAt = response.headers.get('last-modified') ?? new Date().toISOString();
  return {
    source,
    title: source.title ?? extractTitleFromHtml(html, new URL(source.uri).hostname),
    text: stripHtml(html),
    updatedAt: toIsoDate(updatedAt),
    metadata: { canonicalUrl: response.url || source.uri },
  };
}

async function extractSharePointPage(
  source: IngestionSource,
  credentials: SharePointCredentials,
): Promise<IngestionDocument> {
  if (!credentials.tenantId || !credentials.clientId || !credentials.clientSecret) {
    throw new Error(
      'SharePoint ingestion requires RAG_SHAREPOINT_TENANT_ID, RAG_SHAREPOINT_CLIENT_ID, and RAG_SHAREPOINT_CLIENT_SECRET.',
    );
  }

  const token = await getGraphToken({
    tenantId: credentials.tenantId,
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
  });
  const pageUrl = new URL(source.uri);
  const siteId = source.sharepoint?.siteId ?? (await getSiteId(pageUrl.hostname, token));
  const pageName = source.sharepoint?.pageName ?? pageUrl.pathname.split('/').pop();
  if (!pageName) throw new Error(`Cannot identify SharePoint page from ${source.uri}.`);

  const pages = await graphGet<{ value?: GraphPage[] }>(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/pages?$select=id,name,title,lastModifiedDateTime,lastModifiedBy&$top=999`,
    token,
  );
  const page = pages.value?.find(
    (candidate) => candidate.name?.toLowerCase() === pageName.toLowerCase(),
  );
  if (!page?.id) throw new Error(`SharePoint page ${pageName} was not found in site ${siteId}.`);

  return extractGraphPage(source, pageUrl, siteId, page, token);
}

async function extractGraphPage(
  source: IngestionSource,
  sourceUrl: URL,
  siteId: string,
  page: GraphPage,
  token: string,
): Promise<IngestionDocument> {
  if (!page.id || !page.name) throw new Error('SharePoint page is missing an ID or name.');
  const expanded = await graphGet<GraphPage>(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/pages/${page.id}/microsoft.graph.sitePage?$expand=canvasLayout`,
    token,
  );
  const text = collectCanvasText(expanded.canvasLayout);
  if (!text) throw new Error(`SharePoint page ${page.name} returned no indexable canvas text.`);

  const pageUri = new URL(`/SitePages/${page.name}`, sourceUrl.origin).toString();
  return {
    source: {
      ...source,
      id: `${source.id}:${page.id}`,
      uri: pageUri,
      title: expanded.title ?? page.title ?? page.name,
      metadata: { ...source.metadata, rootSourceId: source.id },
    },
    title: expanded.title ?? page.title ?? page.name,
    text,
    updatedAt: toIsoDate(
      expanded.lastModifiedDateTime ?? page.lastModifiedDateTime ?? new Date().toISOString(),
    ),
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

async function getGraphToken(credentials: Required<SharePointCredentials>): Promise<string> {
  const response = await fetch(
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
  if (!response.ok)
    throw new Error(`Microsoft token request failed with status ${response.status}.`);
  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token)
    throw new Error('Microsoft token response did not contain an access token.');
  return payload.access_token;
}

async function getSiteId(hostname: string, token: string): Promise<string> {
  const site = await graphGet<{ id?: string }>(
    `https://graph.microsoft.com/v1.0/sites/${hostname}:/`,
    token,
  );
  if (!site.id) throw new Error(`Microsoft Graph did not return an ID for ${hostname}.`);
  return site.id;
}

async function graphGet<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok)
    throw new Error(`Microsoft Graph request failed with status ${response.status}.`);
  return (await response.json()) as T;
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
          parts.push(key === 'innerHtml' ? stripHtml(child) : child);
        } else {
          visit(child);
        }
      }
    }
  };
  visit(value);
  return [...new Set(parts.map((part) => part.trim()).filter(Boolean))].join('\n\n');
}

function cleanTranscript(text: string, extension: string): string {
  if (extension !== '.vtt' && extension !== '.srt') return text;
  return text
    .replace(/^WEBVTT[^\n]*\n?/i, '')
    .replace(/^\d+\s*$/gm, '')
    .replace(/^\d\d:\d\d:\d\d[.,]\d\d\d\s+-->.*$/gm, '')
    .replace(/<[^>]+>/g, '');
}

async function extractDocx(path: string): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ path });
  return result.value;
}

async function pdfToText(path: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('pdftotext', [path, '-'], {
      maxBuffer: 20 * 1024 * 1024,
    });
    return stdout;
  } catch {
    throw new Error('PDF ingestion requires the pdftotext command from Poppler.');
  }
}

function toIsoDate(value: string): string {
  const date = new Date(value);
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
