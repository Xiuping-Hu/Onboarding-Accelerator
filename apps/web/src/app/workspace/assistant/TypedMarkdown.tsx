import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const MAX_TYPING_DURATION_MS = 7_000;
const DEFAULT_MS_PER_CHARACTER = 20;

export function TypedMarkdown({
  animate,
  content,
  onComplete,
}: {
  animate: boolean;
  content: string;
  onComplete: () => void;
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

  return (
    <div className="typed-response" data-typing={isTyping || undefined}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content.slice(0, visibleLength)}</ReactMarkdown>
      {isTyping ? <span aria-hidden="true" className="typing-cursor" /> : null}
    </div>
  );
}
