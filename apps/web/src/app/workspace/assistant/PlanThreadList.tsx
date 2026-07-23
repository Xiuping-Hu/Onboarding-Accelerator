import { useState } from 'react';
import { ThreadListItemPrimitive, ThreadListPrimitive, useAuiState } from '@assistant-ui/react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/common/overlays/Popover';
import { Button } from '@/components/ui/button';

type DeleteError = {
  message: string;
  sessionId: string;
} | null;

function PlanThreadListItem({
  canDelete,
  deleteError,
  deletingSessionId,
  onDelete,
}: {
  canDelete: boolean;
  deleteError: DeleteError;
  deletingSessionId: string | null;
  onDelete: (sessionId: string) => Promise<void>;
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
        <Popover
          open={isConfirmingDelete}
          onOpenChange={(open) => {
            if (!open && !isDeleting) {
              setIsConfirmingDelete(false);
            }
          }}
        >
          <PopoverTrigger asChild>
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
          </PopoverTrigger>
          <PopoverContent
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
              <Button
                aria-label={`Confirm delete ${planTitle}`}
                disabled={isDeleting}
                onClick={(event) => {
                  event.stopPropagation();
                  setIsConfirmingDelete(false);
                  void onDelete(sessionId);
                }}
                size="sm"
                type="button"
                variant="destructive"
              >
                {isDeleting ? 'Deleting…' : 'Confirm'}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
    </ThreadListItemPrimitive.Root>
  );
}

export function PlanThreadList({
  canDelete,
  deleteError,
  deletingSessionId,
  onDelete,
}: {
  canDelete: boolean;
  deleteError: DeleteError;
  deletingSessionId: string | null;
  onDelete: (sessionId: string) => Promise<void>;
}) {
  return (
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
              onDelete={onDelete}
            />
          )}
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
