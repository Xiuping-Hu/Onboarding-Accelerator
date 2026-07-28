import type { ChatMessage, OnboardingSession, SourceProvenance } from '@onboarding/shared';
import type { KnowledgeMapService } from './modules/knowledge-maps/knowledgeMap.application.service';
import type { RagService, RetrievalOptions } from './modules/rag/rag.service';

export const PERSISTED_SOURCE_EXCERPT =
  'Evidence is resolved after the current access policy is checked.';

export interface ResolvedSourceSet {
  sources: SourceProvenance[];
  status: 'ready' | 'unavailable';
}

export interface SourceLinkResolver {
  resolveSources(sources: SourceProvenance[], userId: string): Promise<ResolvedSourceSet>;
  hydrateSession<T extends OnboardingSession>(session: T, userId: string): Promise<T>;
}

export class SourceLinkService implements SourceLinkResolver {
  constructor(
    private readonly rag: Pick<RagService, 'resolveSource'>,
    private readonly resolveAccessScopes: (userId: string) => Promise<string[]>,
    private readonly knowledgeMaps?: Pick<KnowledgeMapService, 'resolveSource'>,
  ) {}

  async resolveSources(sources: SourceProvenance[], userId: string): Promise<ResolvedSourceSet> {
    if (sources.length === 0) return { sources: [], status: 'ready' };

    let resolved: Array<SourceProvenance | null>;
    try {
      const accessScopes = await this.resolveAccessScopes(userId);
      resolved = await Promise.all(
        sources.map((source) => this.resolveReference(source, accessScopes)),
      );
    } catch (error) {
      console.error('Assistant source-link resolution failed.', error);
      return { sources: [], status: 'unavailable' };
    }

    if (resolved.some((source) => source === null)) {
      console.error('An authorized assistant source could not be resolved for display.');
      return { sources: [], status: 'unavailable' };
    }

    return { sources: resolved as SourceProvenance[], status: 'ready' };
  }

  async hydrateSession<T extends OnboardingSession>(session: T, userId: string): Promise<T> {
    const chatHistory = await Promise.all(
      session.chatHistory.map((message) => this.hydrateMessage(message, userId)),
    );
    return { ...session, chatHistory };
  }

  async resolveSource(sourceId: string, userId: string): Promise<SourceProvenance | null> {
    try {
      const accessScopes = await this.resolveAccessScopes(userId);
      return this.lookupSource(sourceId, accessScopes);
    } catch (error) {
      console.error('Assistant source lookup failed.', error);
      return null;
    }
  }

  private async hydrateMessage(message: ChatMessage, userId: string): Promise<ChatMessage> {
    if (message.role !== 'assistant' || !message.sources?.length) return message;

    const resolved = await this.resolveSources(message.sources, userId);
    return {
      ...message,
      sources: resolved.sources,
      ...(resolved.status === 'unavailable' ? { sourceLinkStatus: 'unavailable' as const } : {}),
    };
  }

  private async resolveReference(
    reference: SourceProvenance,
    accessScopes: string[],
  ): Promise<SourceProvenance | null> {
    const directHref = safeHttpHref(reference.uri);
    if (directHref) {
      return { ...reference, href: directHref };
    }

    const isHydrated = reference.excerpt !== PERSISTED_SOURCE_EXCERPT;
    const resolved = isHydrated
      ? reference
      : await this.lookupSource(sourceIdentity(reference), accessScopes);
    if (!resolved) return null;

    const href = safeHttpHref(resolved.uri) ?? internalSourceHref(sourceIdentity(resolved));
    return {
      ...reference,
      title: resolved.title,
      excerpt: resolved.excerpt,
      sourceType: resolved.sourceType ?? reference.sourceType ?? 'knowledge_base',
      kind: resolved.kind ?? reference.kind,
      metadata: resolved.metadata ?? reference.metadata,
      href,
    };
  }

  private async lookupSource(
    sourceId: string,
    accessScopes: string[],
  ): Promise<SourceProvenance | null> {
    const knowledgeSource = await this.knowledgeMaps?.resolveSource(sourceId, accessScopes);
    if (knowledgeSource) return knowledgeSource;

    const options: RetrievalOptions = {
      webSearchEnabled: false,
      allowedAccessScopes: accessScopes,
    };
    return this.rag.resolveSource(sourceId, options);
  }
}

export class DirectSourceLinkResolver implements SourceLinkResolver {
  async resolveSources(sources: SourceProvenance[]): Promise<ResolvedSourceSet> {
    const resolved = sources.map((source) => ({
      ...source,
      href: safeHttpHref(source.uri) ?? internalSourceHref(sourceIdentity(source)),
    }));
    return { sources: resolved, status: 'ready' };
  }

  async hydrateSession<T extends OnboardingSession>(session: T): Promise<T> {
    const chatHistory = await Promise.all(
      session.chatHistory.map(async (message) => {
        if (message.role !== 'assistant' || !message.sources?.length) return message;
        const resolved = await this.resolveSources(message.sources);
        return { ...message, sources: resolved.sources };
      }),
    );
    return { ...session, chatHistory };
  }
}

export function safeHttpHref(value: string | undefined): string | undefined {
  if (!value) return undefined;

  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
    if (url.username || url.password) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

export function internalSourceHref(sourceId: string): string {
  return `/api/sources/${encodeURIComponent(sourceId)}`;
}

function sourceIdentity(source: SourceProvenance): string {
  const rootSourceId = source.metadata?.rootSourceId;
  return typeof rootSourceId === 'string' && rootSourceId ? rootSourceId : source.id;
}
