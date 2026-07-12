import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { useRef } from 'react';

export function DeletePlanDialog({
  error,
  isDeleting,
  onCancel,
  onConfirm,
  open,
  planTitle,
}: {
  error: string | null;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
  open: boolean;
  planTitle: string;
}) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !isDeleting) {
          onCancel();
        }
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog-overlay" />
        <AlertDialog.Content
          aria-describedby="delete-plan-description"
          className="delete-plan-dialog"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            cancelButtonRef.current?.focus();
          }}
        >
          <AlertDialog.Title>Delete plan?</AlertDialog.Title>
          <AlertDialog.Description id="delete-plan-description">
            Delete {planTitle}? This cannot be undone.
          </AlertDialog.Description>
          {error ? (
            <p className="delete-plan-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="dialog-actions">
            <AlertDialog.Cancel asChild>
              <button
                className="ghost-button"
                disabled={isDeleting}
                ref={cancelButtonRef}
                type="button"
              >
                Cancel
              </button>
            </AlertDialog.Cancel>
            <button
              className="danger-button"
              disabled={isDeleting}
              onClick={() => void onConfirm()}
              type="button"
            >
              {isDeleting ? 'Deleting…' : 'Delete plan'}
            </button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
