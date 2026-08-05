import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import type { CitationSegment, KnowledgeSource } from '@onboarding/shared';
import remarkGfm from 'remark-gfm';
import { isSafeMarkdownHref } from '@/features/workspace/sourceLinks';
import { AssistantSourcesPopover } from './AssistantSourcesPopover';

const MAX_TYPING_DURATION_MS = 7_000;
const DEFAULT_MS_PER_CHARACTER = 20;
const INLINE_CITATION_HREF = 'citation:segment';

interface MarkdownNode {
  type: string;
  value?: string;
  url?: string;
  children?: MarkdownNode[];
}

interface InlineCitation {
  sources: KnowledgeSource[];
  unavailable: boolean;
}

function createMarkdownComponents(citation?: InlineCitation): Components {
  return {
    a: ({ children, href, node: _node, ...props }) => {
      if (href === INLINE_CITATION_HREF) {
        if (!citation) return <>{children}</>;

        return (
          <AssistantSourcesPopover
            inline
            sources={citation.sources}
            unavailable={citation.unavailable}
          />
        );
      }

      if (!isSafeMarkdownHref(href)) {
        return <>{children}</>;
      }

      return (
        <a
          className="text-indigo-700 underline [overflow-wrap:anywhere] focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          href={href}
          rel="noopener noreferrer"
          target="_blank"
          {...props}
        >
          {children}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      );
    },
  };
}

export function TypedMarkdown({
  animate,
  citationSegments,
  content,
  onComplete,
  sources = [],
  sourcesUnavailable = false,
}: {
  animate: boolean;
  citationSegments?: CitationSegment[];
  content: string;
  onComplete: () => void;
  sources?: KnowledgeSource[];
  sourcesUnavailable?: boolean;
}) {
  const structuredContent = citationSegments?.length
    ? citationSegments.map((segment) => segment.markdown).join('\n\n')
    : undefined;
  const renderedContent = structuredContent ?? stripLegacyCitationMarkers(content);
  const [visibleLength, setVisibleLength] = useState(animate ? 0 : renderedContent.length);

  useEffect(() => {
    if (!animate) {
      setVisibleLength(renderedContent.length);
      return;
    }

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion || renderedContent.length === 0) {
      setVisibleLength(renderedContent.length);
      onComplete();
      return;
    }

    setVisibleLength(0);
    const startedAt = performance.now();
    const millisecondsPerCharacter = Math.min(
      DEFAULT_MS_PER_CHARACTER,
      MAX_TYPING_DURATION_MS / renderedContent.length,
    );
    let animationFrame = 0;

    const revealText = (now: number) => {
      const nextLength = Math.min(
        renderedContent.length,
        Math.max(1, Math.floor((now - startedAt) / millisecondsPerCharacter)),
      );
      setVisibleLength(nextLength);

      if (nextLength < renderedContent.length) {
        animationFrame = window.requestAnimationFrame(revealText);
      } else {
        onComplete();
      }
    };

    animationFrame = window.requestAnimationFrame(revealText);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [animate, onComplete, renderedContent]);

  const isTyping = animate && visibleLength < renderedContent.length;

  return (
    <div
      className="min-w-0 leading-relaxed [overflow-wrap:anywhere] [&_:is(h1,h2,h3,h4,h5,h6)]:mt-3 [&_:is(h1,h2,h3,h4,h5,h6)]:mb-2 [&_:is(h1,h2,h3,h4,h5,h6)]:text-base [&_:is(h1,h2,h3,h4,h5,h6)]:font-bold [&_:is(h1,h2,h3,h4,h5,h6)]:text-slate-800 [&_blockquote]:mb-2 [&_blockquote]:border-l-3 [&_blockquote]:border-blue-300 [&_blockquote]:pl-2 [&_blockquote]:text-slate-600 [&_li+li]:mt-1 [&_ol]:mb-2 [&_ol]:pl-5 [&_p]:mb-2 [&_p]:last:mb-0 [&_pre]:mb-2 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-slate-900 [&_pre]:p-2.5 [&_pre]:text-slate-50 [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_td]:border [&_td]:border-slate-300 [&_td]:p-1.5 [&_th]:border [&_th]:border-slate-300 [&_th]:p-1.5 [&_ul]:mb-2 [&_ul]:pl-5 [&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-slate-100 [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:text-[0.9em]"
      data-typing={isTyping || undefined}
    >
      {citationSegments?.length ? (
        <StructuredMarkdown
          segments={citationSegments}
          sources={sources}
          sourcesUnavailable={sourcesUnavailable}
          visibleLength={visibleLength}
        />
      ) : (
        <>
          <Markdown content={renderedContent.slice(0, visibleLength)} />
          {!isTyping ? (
            <AssistantSourcesPopover sources={sources} unavailable={sourcesUnavailable} />
          ) : null}
        </>
      )}
      {isTyping ? (
        <span
          aria-hidden="true"
          className="ml-0.5 inline-block h-[1em] w-0.5 animate-pulse bg-current align-[-0.12em] motion-reduce:animate-none"
        />
      ) : null}
    </div>
  );
}

function StructuredMarkdown({
  segments,
  sources,
  sourcesUnavailable,
  visibleLength,
}: {
  segments: CitationSegment[];
  sources: KnowledgeSource[];
  sourcesUnavailable: boolean;
  visibleLength: number;
}) {
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  let offset = 0;

  return segments.map((segment, index) => {
    const start = offset;
    const end = start + segment.markdown.length;
    offset = end + 2;
    if (visibleLength <= start) return null;

    const visibleMarkdown = segment.markdown.slice(
      0,
      Math.min(segment.markdown.length, visibleLength - start),
    );
    const isComplete = visibleLength >= end;
    const citationSources = segment.sourceIds.map((sourceId) => sourceById.get(sourceId));
    const citationUnavailable = sourcesUnavailable || citationSources.some((source) => !source);
    const resolvedSources = citationSources.filter((source): source is KnowledgeSource =>
      Boolean(source),
    );
    const citation =
      isComplete && segment.sourceIds.length > 0
        ? { sources: resolvedSources, unavailable: citationUnavailable }
        : undefined;

    return (
      <div className="mb-2 last:mb-0" key={`${index}:${segment.sourceIds.join(',')}`}>
        <Markdown citation={citation} content={visibleMarkdown} />
      </div>
    );
  });
}

function Markdown({ content, citation }: { content: string; citation?: InlineCitation }) {
  return (
    <ReactMarkdown
      components={createMarkdownComponents(citation)}
      remarkPlugins={citation ? [remarkGfm, remarkInlineCitation] : [remarkGfm]}
      urlTransform={(url) => (url === INLINE_CITATION_HREF || isSafeMarkdownHref(url) ? url : '')}
    >
      {content}
    </ReactMarkdown>
  );
}

function remarkInlineCitation() {
  return (tree: MarkdownNode) => {
    const marker: MarkdownNode = {
      type: 'link',
      children: [{ type: 'text', value: 'sources' }],
      url: INLINE_CITATION_HREF,
    };
    const container = findLastPhrasingContainer(tree);

    if (container?.children) {
      container.children.push({ type: 'text', value: ' ' }, marker);
      return;
    }

    tree.children?.push({ type: 'paragraph', children: [marker] });
  };
}

function findLastPhrasingContainer(node: MarkdownNode): MarkdownNode | undefined {
  if (['paragraph', 'heading', 'tableCell'].includes(node.type)) return node;
  const lastChild = node.children?.at(-1);
  return lastChild ? findLastPhrasingContainer(lastChild) : undefined;
}

function stripLegacyCitationMarkers(content: string): string {
  return content.replace(/\s*\[\[\d+(?:\s*,\s*\d+)*\]\]/g, '');
}
