import { ConfirmDialog } from '@/components/common/dialogs/ConfirmDialog';

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
  return (
    <ConfirmDialog
      confirmLabel="Delete plan"
      description={<>Delete {planTitle}? This cannot be undone.</>}
      error={error}
      onCancel={onCancel}
      onConfirm={onConfirm}
      open={open}
      pending={isDeleting}
      pendingLabel="Deleting..."
      title="Delete plan?"
      tone="danger"
    />
  );
}
