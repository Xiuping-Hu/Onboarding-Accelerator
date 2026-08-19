import type { KnowledgeSource, SourceReference } from '@onboarding/shared';

type DisplaySource = KnowledgeSource | SourceReference;

export interface DisplaySourceLink {
  id: string;
  title: string;
  excerpt: string;
  href: string;
  label: string;
}

export type DisplaySourceState =
  | { status: 'empty'; links: [] }
  | { status: 'error'; links: [] }
  | { status: 'ready'; links: DisplaySourceLink[] };

export function getDisplaySourceState(sources: DisplaySource[]): DisplaySourceState {
  if (sources.length === 0) {
    return { status: 'empty', links: [] };
  }

  const links = new Map<string, DisplaySourceLink>();

  for (const source of sources) {
    const href = getResolvedSourceHref(source);
    if (!href) {
      return { status: 'error', links: [] };
    }

    const key = getCanonicalSourceKey(source, href);
    if (links.has(key)) {
      continue;
    }

    links.set(key, {
      id: source.id,
      title: source.title,
      excerpt: source.excerpt ?? '',
      href,
      label: getSourceLabel(source, href),
    });
  }

  return { status: 'ready', links: [...links.values()] };
}

export function isSafeMarkdownHref(href: string | undefined): href is string {
  if (!href) return false;

  try {
    const url = new URL(href);
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password
    );
  } catch {
    return false;
  }
}

export function isSafeResolvedSourceHref(href: string | undefined): href is string {
  if (!href) return false;
  if (href.startsWith('/') && !href.startsWith('//')) return true;
  return isSafeMarkdownHref(href);
}

function getResolvedSourceHref(source: DisplaySource): string | undefined {
  if (isSafeResolvedSourceHref(source.href)) return source.href;
  if ('uri' in source && isSafeMarkdownHref(source.uri)) return source.uri;
  return undefined;
}

function getCanonicalSourceKey(source: DisplaySource, href: string): string {
  const rootSourceId = source.metadata?.rootSourceId;
  if (typeof rootSourceId === 'string' && rootSourceId.trim()) {
    return `root:${rootSourceId}`;
  }

  return `href:${href}`;
}

function getSourceLabel(source: DisplaySource, href: string): string {
  if (('kind' in source && source.kind === 'web') || source.sourceType === 'web') {
    try {
      return new URL(href, 'http://local.invalid').hostname || 'Web';
    } catch {
      return 'Web';
    }
  }

  return 'Company knowledge';
}
