import React, { useRef, type ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

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
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !pending) {
          onCancel();
        }
      }}
    >
      <AlertDialogContent
        className="max-w-[420px]"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancelButtonRef.current?.focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p className="text-sm font-semibold text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button disabled={pending} ref={cancelButtonRef} type="button" variant="outline">
              {cancelLabel}
            </Button>
          </AlertDialogCancel>
          <Button
            disabled={pending}
            onClick={() => void onConfirm()}
            type="button"
            variant={tone === 'danger' ? 'destructive' : 'default'}
          >
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
