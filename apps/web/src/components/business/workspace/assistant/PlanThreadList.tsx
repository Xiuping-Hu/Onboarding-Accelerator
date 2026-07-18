import { ThreadListItemPrimitive, ThreadListPrimitive, useAuiState } from '@assistant-ui/react';

function PlanThreadListItem({ canDelete }: { canDelete: boolean }) {
  const updatedAt = useAuiState((state) => state.threadListItem.custom?.updatedAt);

  return (
    <ThreadListItemPrimitive.Root className="plan-thread-item">
      <ThreadListItemPrimitive.Trigger className="plan-thread-trigger">
        <span className="plan-thread-title">
          <ThreadListItemPrimitive.Title fallback="Untitled onboarding plan" />
        </span>
        {typeof updatedAt === 'string' ? <small>Updated {formatPlanTime(updatedAt)}</small> : null}
      </ThreadListItemPrimitive.Trigger>
      {canDelete ? (
        <ThreadListItemPrimitive.Delete
          aria-label="Delete plan"
          className="plan-thread-delete"
          title="Delete plan"
          type="button"
        >
          ×
        </ThreadListItemPrimitive.Delete>
      ) : null}
    </ThreadListItemPrimitive.Root>
  );
}

export function PlanThreadList({ canDelete }: { canDelete: boolean }) {
  return (
    <ThreadListPrimitive.Root className="plan-thread-list">
      <ThreadListPrimitive.New className="primary-button plan-new-button" type="button">
        New plan
      </ThreadListPrimitive.New>
      <div className="plan-thread-items" aria-label="Onboarding plans">
        <ThreadListPrimitive.Items>
          {() => <PlanThreadListItem canDelete={canDelete} />}
        </ThreadListPrimitive.Items>
      </div>
    </ThreadListPrimitive.Root>
  );
}

function formatPlanTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}
