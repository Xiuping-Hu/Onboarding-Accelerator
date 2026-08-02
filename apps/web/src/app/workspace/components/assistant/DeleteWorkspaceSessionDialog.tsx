'use client';

import React, { useState } from 'react';
import type { OnboardingSession } from '@onboarding/shared';
import { XIcon } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import type { DeleteError } from '@/features/workspace/controller/workspaceSessionReducer';
import { cn } from '@/lib/utils';

export function DeleteWorkspaceSessionDialog({
  deleteError,
  deletingSessionId,
  onDelete,
  session,
}: {
  deleteError: DeleteError;
  deletingSessionId: string | null;
  onDelete: (sessionId: string) => Promise<void>;
  session: OnboardingSession;
}) {
  const [open, setOpen] = useState(false);
  const isDeleting = deletingSessionId === session.id;
  const dialogError = deleteError?.sessionId === session.id ? deleteError.message : null;

  return (
    <AlertDialog open={open} onOpenChange={(nextOpen) => !isDeleting && setOpen(nextOpen)}>
      <AlertDialogTrigger asChild>
        <Button
          aria-label={`Delete ${session.title}`}
          className="mr-1 -ml-1 size-7 opacity-0 group-hover:opacity-70 group-focus-within:opacity-70 hover:bg-red-100 hover:text-red-800 hover:opacity-100"
          disabled={deletingSessionId !== null}
          size="icon"
          title={`Delete ${session.title}`}
          type="button"
          variant="ghost"
        >
          <XIcon aria-hidden="true" className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          document.getElementById(`cancel-session-deletion-${session.id}`)?.focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &ldquo;{session.title}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription>
            This AI chat session and its conversation history will be permanently removed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {dialogError ? (
          <p className="text-sm font-semibold text-destructive" role="alert">
            {dialogError}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button
              disabled={isDeleting}
              id={`cancel-session-deletion-${session.id}`}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
          </AlertDialogCancel>
          <Button
            className={cn(isDeleting && 'cursor-wait')}
            disabled={isDeleting}
            onClick={() => void onDelete(session.id)}
            type="button"
            variant="destructive"
          >
            {isDeleting ? 'Deleting session…' : `Delete ${session.title}`}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
