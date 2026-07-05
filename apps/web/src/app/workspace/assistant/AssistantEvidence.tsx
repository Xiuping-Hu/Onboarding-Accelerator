import type { KnowledgeSource } from '@onboarding/shared';

function getSourceLabel(source: KnowledgeSource) {
  return source.kind === 'web' || source.sourceType === 'web' ? 'Web' : 'Knowledge base';
}

export function AssistantEvidence({
  expanded,
  messageId,
  onToggle,
  sources,
}: {
  expanded: boolean;
  messageId: string;
  onToggle: (messageId: string) => void;
  sources: KnowledgeSource[];
}) {
  if (sources.length === 0) {
    return null;
  }

  return (
    <div className="message-evidence">
      <button onClick={() => onToggle(messageId)} type="button">
        {expanded
          ? 'Hide sources'
          : `${sources.length} source${sources.length === 1 ? '' : 's'} available`}
      </button>
      {expanded ? (
        <div className="evidence-list">
          {sources.map((source) => (
            <article className="evidence-item" key={source.id}>
              <span>{getSourceLabel(source)}</span>
              {source.uri ? (
                <a href={source.uri} rel="noreferrer" target="_blank">
                  {source.title}
                </a>
              ) : (
                <strong>{source.title}</strong>
              )}
              <p>{source.excerpt}</p>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
