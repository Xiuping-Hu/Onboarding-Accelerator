'use client';

import { PlusIcon, XIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { OnboardingSession } from '@onboarding/shared';
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
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { DeleteError } from '@/features/workspace/controller/workspaceSessionReducer';
import { cn } from '@/lib/utils';

export function WorkspaceSessionTabs({
  deleteError,
  deletingSessionId,
  onCreate,
  onDelete,
  sessions,
}: {
  deleteError: DeleteError;
  deletingSessionId: string | null;
  onCreate: () => Promise<void>;
  onDelete: (sessionId: string) => Promise<void>;
  sessions: OnboardingSession[];
}) {
  const [sessionPendingDelete, setSessionPendingDelete] = useState<OnboardingSession | null>(null);

  useEffect(() => {
    if (
      sessionPendingDelete &&
      !sessions.some((session) => session.id === sessionPendingDelete.id)
    ) {
      setSessionPendingDelete(null);
    }
  }, [sessionPendingDelete, sessions]);

  const isDeleting = deletingSessionId === sessionPendingDelete?.id;
  const dialogError =
    deleteError && sessionPendingDelete && deleteError.sessionId === sessionPendingDelete.id
      ? deleteError.message
      : null;

  return (
    <>
      <TabsList
        aria-label="Onboarding sessions"
        className="h-auto w-full min-w-0 justify-start overflow-x-auto rounded-none border-b border-workspace-border bg-[#f8f9ff] px-2 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {sessions.map((session) => (
          <div
            className="group relative flex min-w-0 shrink-0 items-center rounded-t-lg text-workspace-muted"
            key={session.id}
          >
            <TabsTrigger
              className="h-9 max-w-36 rounded-t-lg rounded-b-none bg-transparent px-3 text-[13px] font-semibold shadow-none data-[state=active]:bg-white data-[state=active]:shadow-none"
              title={session.title}
              value={session.id}
            >
              <span className="truncate">{session.title}</span>
            </TabsTrigger>
            {sessions.length > 1 ? (
              <Button
                aria-label={`Delete ${session.title}`}
                className="mr-1 -ml-1 size-7 opacity-0 group-hover:opacity-70 group-focus-within:opacity-70 hover:bg-red-100 hover:text-red-800 hover:opacity-100"
                disabled={deletingSessionId !== null}
                onClick={() => setSessionPendingDelete(session)}
                size="icon"
                title={`Delete ${session.title}`}
                type="button"
                variant="ghost"
              >
                <XIcon aria-hidden="true" className="size-4" />
              </Button>
            ) : null}
          </div>
        ))}
        <Button
          aria-label="New session"
          className="size-9 shrink-0 text-workspace-assistant hover:bg-workspace-assistant-soft"
          disabled={deletingSessionId !== null}
          onClick={() => void onCreate()}
          size="icon"
          title="New session"
          type="button"
          variant="ghost"
        >
          <PlusIcon aria-hidden="true" className="size-4" />
        </Button>
      </TabsList>

      <AlertDialog
        open={sessionPendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setSessionPendingDelete(null);
        }}
      >
        <AlertDialogContent
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            document.getElementById('cancel-session-deletion')?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete &ldquo;{sessionPendingDelete?.title ?? 'this session'}&rdquo;?
            </AlertDialogTitle>
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
                id="cancel-session-deletion"
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
            </AlertDialogCancel>
            <Button
              className={cn(isDeleting && 'cursor-wait')}
              disabled={isDeleting}
              onClick={() => {
                if (sessionPendingDelete) void onDelete(sessionPendingDelete.id);
              }}
              type="button"
              variant="destructive"
            >
              {isDeleting
                ? 'Deleting session…'
                : `Delete ${sessionPendingDelete?.title ?? 'session'}`}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
