import { useState } from 'react';
import { ThreadListItemPrimitive, ThreadListPrimitive, useAuiState } from '@assistant-ui/react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/common/overlays/Tooltip';
import { Button } from '@/components/ui/button';

type DeleteError = {
  message: string;
  sessionId: string;
} | null;

function PlanThreadListItem({
  canDelete,
  deleteError,
  deletingSessionId,
}: {
  canDelete: boolean;
  deleteError: DeleteError;
  deletingSessionId: string | null;
}) {
  const sessionId = useAuiState((state) => state.threadListItem.id);
  const planTitle = useAuiState(
    (state) => state.threadListItem.title ?? 'Untitled onboarding plan',
  );
  const updatedAt = useAuiState((state) => state.threadListItem.custom?.updatedAt);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const isDeleting = deletingSessionId === sessionId;
  const error = deleteError?.sessionId === sessionId ? deleteError.message : null;

  return (
    <ThreadListItemPrimitive.Root className="plan-thread-item">
      <ThreadListItemPrimitive.Trigger className="plan-thread-trigger">
        <span className="plan-thread-title">
          <ThreadListItemPrimitive.Title fallback="Untitled onboarding plan" />
        </span>
        {typeof updatedAt === 'string' ? <small>Updated {formatPlanTime(updatedAt)}</small> : null}
      </ThreadListItemPrimitive.Trigger>
      {canDelete ? (
        <Tooltip
          open={isConfirmingDelete}
          onOpenChange={(open) => {
            if (!open && !isDeleting) {
              setIsConfirmingDelete(false);
            }
          }}
        >
          <TooltipTrigger asChild>
            <Button
              aria-label={isDeleting ? `Deleting ${planTitle}` : `Delete ${planTitle}`}
              className="plan-thread-delete"
              data-confirming={isConfirmingDelete ? 'true' : undefined}
              disabled={isDeleting}
              onClick={() => setIsConfirmingDelete(true)}
              size="icon"
              type="button"
              variant="ghost"
            >
              ×
            </Button>
          </TooltipTrigger>
          <TooltipContent
            align="end"
            aria-label={`Delete ${planTitle}? This cannot be undone.`}
            className="delete-plan-tooltip"
            side="right"
          >
            <strong>Delete “{planTitle}”?</strong>
            <span>{isDeleting ? 'Deleting plan…' : 'This cannot be undone.'}</span>
            {error ? (
              <span className="delete-plan-tooltip-error" role="alert">
                {error}
              </span>
            ) : null}
            <div className="delete-plan-tooltip-actions">
              <Button
                disabled={isDeleting}
                onClick={() => setIsConfirmingDelete(false)}
                size="sm"
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button asChild disabled={isDeleting} size="sm" variant="destructive">
                <ThreadListItemPrimitive.Delete
                  aria-label={`Confirm delete ${planTitle}`}
                  type="button"
                >
                  {isDeleting ? 'Deleting…' : 'Confirm'}
                </ThreadListItemPrimitive.Delete>
              </Button>
            </div>
          </TooltipContent>
        </Tooltip>
      ) : null}
    </ThreadListItemPrimitive.Root>
  );
}

export function PlanThreadList({
  canDelete,
  deleteError,
  deletingSessionId,
}: {
  canDelete: boolean;
  deleteError: DeleteError;
  deletingSessionId: string | null;
}) {
  return (
    <TooltipProvider delayDuration={0}>
      <ThreadListPrimitive.Root className="plan-thread-list">
        <ThreadListPrimitive.New className="primary-button plan-new-button" type="button">
          New plan
        </ThreadListPrimitive.New>
        <div className="plan-thread-items" aria-label="Onboarding plans">
          <ThreadListPrimitive.Items>
            {() => (
              <PlanThreadListItem
                canDelete={canDelete}
                deleteError={deleteError}
                deletingSessionId={deletingSessionId}
              />
            )}
          </ThreadListPrimitive.Items>
        </div>
      </ThreadListPrimitive.Root>
    </TooltipProvider>
  );
}

function formatPlanTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}
