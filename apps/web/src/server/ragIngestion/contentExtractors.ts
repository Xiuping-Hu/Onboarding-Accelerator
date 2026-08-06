import { execFile } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { promisify } from 'node:util';
import { openAiFetch } from '../infrastructure/ai/providerFetch';
import { extractTitleFromHtml, stripHtml } from '../ragAdapters/textRetrieval';
import type { AcquiredArtifact, ContentExtractor, IngestionDocument } from './types';

const execFileAsync = promisify(execFile);

export class ContentExtractorRegistry {
  constructor(private readonly extractors: ContentExtractor[]) {}

  async extract(artifact: AcquiredArtifact): Promise<IngestionDocument[]> {
    const extractor = this.extractors.find((candidate) => candidate.canHandle(artifact));
    if (!extractor) {
      throw new Error(`No extractor is registered for media type ${artifact.mediaType}.`);
    }
    return extractor.extract(artifact);
  }
}

export function createDefaultContentExtractors(): ContentExtractor[] {
  return [
    new HtmlContentExtractor(),
    new InlineTextExtractor(),
    new TextFileExtractor(),
    new DocxExtractor(),
    new PdfExtractor(),
    new AudioExtractor(),
  ];
}

export class HtmlContentExtractor implements ContentExtractor {
  readonly id = 'html-v1';

  canHandle(artifact: AcquiredArtifact): boolean {
    return ['text/html', 'application/xhtml+xml'].includes(artifact.mediaType);
  }

  async extract(artifact: AcquiredArtifact): Promise<IngestionDocument[]> {
    const html = requiredContent(artifact);
    const structured = html
      .replace(/<(script|style|noscript|template)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<h([1-6])[^>]*>/gi, (_match, level: string) => `\n\n${'#'.repeat(Number(level))} `)
      .replace(/<\/(h[1-6]|p|div|section|article|main|li|tr)>/gi, '\n\n')
      .replace(/<li[^>]*>/gi, '- ')
      .replace(/<br\s*\/?>/gi, '\n');
    return [
      documentFromArtifact(
        artifact,
        stripHtml(structured),
        artifact.title ?? extractTitleFromHtml(html, new URL(artifact.uri).hostname),
      ),
    ];
  }
}

export class InlineTextExtractor implements ContentExtractor {
  readonly id = 'inline-text-v1';

  canHandle(artifact: AcquiredArtifact): boolean {
    return (
      artifact.content !== undefined && ['text/plain', 'text/markdown'].includes(artifact.mediaType)
    );
  }

  async extract(artifact: AcquiredArtifact): Promise<IngestionDocument[]> {
    return [documentFromArtifact(artifact, requiredContent(artifact))];
  }
}

export class TextFileExtractor implements ContentExtractor {
  readonly id = 'text-file-v1';

  canHandle(artifact: AcquiredArtifact): boolean {
    return (
      Boolean(artifact.path) &&
      ['text/plain', 'text/markdown', 'text/vtt', 'application/x-subrip'].includes(
        artifact.mediaType,
      )
    );
  }

  async extract(artifact: AcquiredArtifact): Promise<IngestionDocument[]> {
    const path = requiredPath(artifact);
    const text = normalizeTranscript(await readFile(path, 'utf8'), extname(path).toLowerCase());
    return [documentFromArtifact(artifact, text)];
  }
}

export class DocxExtractor implements ContentExtractor {
  readonly id = 'docx-v1';

  canHandle(artifact: AcquiredArtifact): boolean {
    return (
      artifact.mediaType ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
  }

  async extract(artifact: AcquiredArtifact): Promise<IngestionDocument[]> {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ path: requiredPath(artifact) });
    return [documentFromArtifact(artifact, result.value)];
  }
}

export class PdfExtractor implements ContentExtractor {
  readonly id = 'pdf-v1';

  canHandle(artifact: AcquiredArtifact): boolean {
    return artifact.mediaType === 'application/pdf';
  }

  async extract(artifact: AcquiredArtifact): Promise<IngestionDocument[]> {
    const path = requiredPath(artifact);
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
          `PDF ${artifact.source.id} contained no extractable text. Install ocrmypdf or provide an approved text export.`,
        );
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }

    const pages = text
      .split('\f')
      .map((page) => page.trim())
      .filter(Boolean);
    return (pages.length ? pages : [text]).map((page, index) =>
      documentFromArtifact(artifact, page, artifact.title, {
        documentKey: `${artifact.artifactKey}:page:${index + 1}`,
        metadata: { ...artifact.metadata, pageNumber: index + 1 },
      }),
    );
  }
}

export class AudioExtractor implements ContentExtractor {
  readonly id = 'audio-transcription-v1';

  canHandle(artifact: AcquiredArtifact): boolean {
    return artifact.mediaType.startsWith('audio/') || artifact.source.kind === 'audio';
  }

  async extract(artifact: AcquiredArtifact): Promise<IngestionDocument[]> {
    if (!artifact.source.reviewed) {
      throw new Error(
        `Audio source ${artifact.source.id} must be reviewed or redacted before indexing.`,
      );
    }
    if (!process.env.OPENAI_API_KEY) {
      throw new Error(
        `Audio source ${artifact.source.id} requires OPENAI_API_KEY for transcription.`,
      );
    }
    const path = requiredPath(artifact);
    const audio = await readFile(path);
    const form = new FormData();
    form.append('model', 'gpt-4o-mini-transcribe');
    form.append('file', new Blob([audio]), path.split(/[\\/]/).pop() ?? 'audio');
    const response = await openAiFetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
    });
    if (!response.ok) {
      throw new Error(`Audio transcription failed with status ${response.status}.`);
    }
    const payload = (await response.json()) as { text?: string };
    if (!payload.text?.trim()) {
      throw new Error(`Audio transcription for ${artifact.source.id} returned no text.`);
    }
    return [
      documentFromArtifact(artifact, payload.text, artifact.title, {
        metadata: {
          ...artifact.metadata,
          transcriptionModel: 'gpt-4o-mini-transcribe',
          reviewed: true,
        },
      }),
    ];
  }
}

function documentFromArtifact(
  artifact: AcquiredArtifact,
  text: string,
  title = artifact.title,
  overrides: Partial<IngestionDocument> = {},
): IngestionDocument {
  return {
    source: artifact.source,
    documentKey: artifact.artifactKey,
    canonicalUri: artifact.uri,
    title: title ?? artifact.path?.split(/[\\/]/).pop() ?? artifact.source.id,
    text,
    mediaType: artifact.mediaType,
    updatedAt: artifact.updatedAt,
    etag: artifact.etag,
    metadata: artifact.metadata,
    ...overrides,
  };
}

function normalizeTranscript(text: string, extension: string): string {
  if (extension !== '.vtt' && extension !== '.srt') return text;
  return text
    .replace(/^WEBVTT[^\n]*\n?/i, '')
    .replace(/^\d+\s*$/gm, '')
    .replace(/^(\d\d:\d\d:\d\d[.,]\d\d\d)\s+-->\s+([^\n]+)$/gm, '[$1 - $2]')
    .replace(/<[^>]+>/g, '');
}

async function pdfToText(path: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('pdftotext', ['-layout', path, '-'], {
      maxBuffer: 20 * 1024 * 1024,
    });
    return stdout;
  } catch {
    throw new Error('PDF ingestion requires the pdftotext command from Poppler.');
  }
}

function requiredContent(artifact: AcquiredArtifact): string {
  if (artifact.content === undefined) {
    throw new Error(`Artifact ${artifact.artifactKey} did not include inline content.`);
  }
  return artifact.content;
}

function requiredPath(artifact: AcquiredArtifact): string {
  if (!artifact.path) throw new Error(`Artifact ${artifact.artifactKey} did not include a path.`);
  return artifact.path;
}
