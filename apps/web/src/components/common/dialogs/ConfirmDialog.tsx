import * as AlertDialog from '@radix-ui/react-alert-dialog';
import React, { useRef, type ReactNode } from 'react';

export interface ConfirmDialogProps {
  cancelLabel?: string;
  confirmLabel: string;
  description: ReactNode;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
  open: boolean;
  pending?: boolean;
  pendingLabel?: string;
  title: ReactNode;
  tone?: 'default' | 'danger';
}

export function ConfirmDialog({
  cancelLabel = 'Cancel',
  confirmLabel,
  description,
  error,
  onCancel,
  onConfirm,
  open,
  pending = false,
  pendingLabel = confirmLabel,
  title,
  tone = 'default',
}: ConfirmDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !pending) {
          onCancel();
        }
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="common-dialog-overlay" />
        <AlertDialog.Content
          className="common-confirm-dialog"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            cancelButtonRef.current?.focus();
          }}
        >
          <AlertDialog.Title className="common-confirm-dialog-title">{title}</AlertDialog.Title>
          <AlertDialog.Description className="common-confirm-dialog-description">
            {description}
          </AlertDialog.Description>
          {error ? (
            <p className="common-confirm-dialog-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="common-confirm-dialog-actions">
            <AlertDialog.Cancel asChild>
              <button
                className="common-confirm-dialog-cancel"
                disabled={pending}
                ref={cancelButtonRef}
                type="button"
              >
                {cancelLabel}
              </button>
            </AlertDialog.Cancel>
            <button
              className={
                tone === 'danger' ? 'common-confirm-dialog-danger' : 'common-confirm-dialog-confirm'
              }
              disabled={pending}
              onClick={() => void onConfirm()}
              type="button"
            >
              {pending ? pendingLabel : confirmLabel}
            </button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
