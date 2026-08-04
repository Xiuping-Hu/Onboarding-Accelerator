import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import type { KnowledgeSource } from '@onboarding/shared';
import remarkGfm from 'remark-gfm';
import { isSafeMarkdownHref } from '@/features/workspace/sourceLinks';
import { AssistantSourcesPopover } from './AssistantSourcesPopover';

const MAX_TYPING_DURATION_MS = 7_000;
const DEFAULT_MS_PER_CHARACTER = 20;

interface MarkdownNode {
  type: string;
  value?: string;
  url?: string;
  children?: MarkdownNode[];
}

function createMarkdownComponents(
  sources: KnowledgeSource[],
  sourcesUnavailable: boolean,
): Components {
  return {
    a: ({ children, href, node: _node, ...props }) => {
      const citationNumbers = parseCitationHref(href);
      if (citationNumbers) {
        const citationSources = citationNumbers.map((number) => sources[number - 1]);
        const citationUnavailable = sourcesUnavailable || citationSources.some((source) => !source);

        const resolvedCitationSources = citationSources.filter(
          (source): source is KnowledgeSource => Boolean(source),
        );

        return (
          <AssistantSourcesPopover
            inline
            sources={resolvedCitationSources}
            unavailable={citationUnavailable}
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
  content,
  onComplete,
  sources = [],
  sourcesUnavailable = false,
}: {
  animate: boolean;
  content: string;
  onComplete: () => void;
  sources?: KnowledgeSource[];
  sourcesUnavailable?: boolean;
}) {
  const [visibleLength, setVisibleLength] = useState(animate ? 0 : content.length);

  useEffect(() => {
    if (!animate) {
      setVisibleLength(content.length);
      return;
    }

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion || content.length === 0) {
      setVisibleLength(content.length);
      onComplete();
      return;
    }

    setVisibleLength(0);
    const startedAt = performance.now();
    const millisecondsPerCharacter = Math.min(
      DEFAULT_MS_PER_CHARACTER,
      MAX_TYPING_DURATION_MS / content.length,
    );
    let animationFrame = 0;

    const revealText = (now: number) => {
      const nextLength = Math.min(
        content.length,
        Math.max(1, Math.floor((now - startedAt) / millisecondsPerCharacter)),
      );
      setVisibleLength(nextLength);

      if (nextLength < content.length) {
        animationFrame = window.requestAnimationFrame(revealText);
      } else {
        onComplete();
      }
    };

    animationFrame = window.requestAnimationFrame(revealText);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [animate, content, onComplete]);

  const isTyping = animate && visibleLength < content.length;
  const markdownComponents = createMarkdownComponents(sources, sourcesUnavailable);

  return (
    <div
      className="min-w-0 leading-relaxed [overflow-wrap:anywhere] [&_:is(h1,h2,h3,h4,h5,h6)]:mt-3 [&_:is(h1,h2,h3,h4,h5,h6)]:mb-2 [&_:is(h1,h2,h3,h4,h5,h6)]:text-base [&_:is(h1,h2,h3,h4,h5,h6)]:font-bold [&_:is(h1,h2,h3,h4,h5,h6)]:text-slate-800 [&_blockquote]:mb-2 [&_blockquote]:border-l-3 [&_blockquote]:border-blue-300 [&_blockquote]:pl-2 [&_blockquote]:text-slate-600 [&_li+li]:mt-1 [&_ol]:mb-2 [&_ol]:pl-5 [&_p]:mb-2 [&_p]:last:mb-0 [&_pre]:mb-2 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-slate-900 [&_pre]:p-2.5 [&_pre]:text-slate-50 [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_td]:border [&_td]:border-slate-300 [&_td]:p-1.5 [&_th]:border [&_th]:border-slate-300 [&_th]:p-1.5 [&_ul]:mb-2 [&_ul]:pl-5 [&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-slate-100 [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:text-[0.9em]"
      data-typing={isTyping || undefined}
    >
      <ReactMarkdown
        components={markdownComponents}
        remarkPlugins={[remarkGfm, remarkCitationMarkers]}
        urlTransform={(url) => (parseCitationHref(url) || isSafeMarkdownHref(url) ? url : '')}
      >
        {content.slice(0, visibleLength)}
      </ReactMarkdown>
      {isTyping ? (
        <span
          aria-hidden="true"
          className="ml-0.5 inline-block h-[1em] w-0.5 animate-pulse bg-current align-[-0.12em] motion-reduce:animate-none"
        />
      ) : null}
    </div>
  );
}

function remarkCitationMarkers() {
  return (tree: MarkdownNode) => replaceCitationMarkers(tree);
}

function replaceCitationMarkers(node: MarkdownNode): void {
  if (!node.children) return;

  for (let index = 0; index < node.children.length; index += 1) {
    const child = node.children[index];
    if (!child) continue;

    if (child.type === 'text' && typeof child.value === 'string') {
      const replacement = citationNodes(child.value);
      if (replacement) {
        node.children.splice(index, 1, ...replacement);
        index += replacement.length - 1;
      }
      continue;
    }

    if (child.type !== 'link') replaceCitationMarkers(child);
  }
}

function citationNodes(value: string): MarkdownNode[] | null {
  const pattern = /\[\[(\d+(?:\s*,\s*\d+)*)\]\]/g;
  const nodes: MarkdownNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value))) {
    if (match.index > cursor) {
      nodes.push({ type: 'text', value: value.slice(cursor, match.index) });
    }

    const numbers = match[1]?.replace(/\s/g, '') ?? '';
    nodes.push({
      type: 'link',
      children: [{ type: 'text', value: match[0] }],
      url: `citation:${numbers}`,
    });
    cursor = match.index + match[0].length;
  }

  if (cursor === 0) return null;
  if (cursor < value.length) nodes.push({ type: 'text', value: value.slice(cursor) });
  return nodes;
}

function parseCitationHref(href: string | undefined): number[] | null {
  const match = /^citation:(\d+(?:,\d+)*)$/.exec(href ?? '');
  if (!match?.[1]) return null;

  const numbers = [...new Set(match[1].split(',').map(Number))].filter((number) => number > 0);
  return numbers.length > 0 ? numbers : null;
}
