'use client';

import React from 'react';
import { PlusIcon } from 'lucide-react';
import type { OnboardingSession } from '@onboarding/shared';
import { Button } from '@/components/ui/button';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { DeleteError } from '@/features/workspace/controller/workspaceSessionReducer';
import { DeleteWorkspaceSessionDialog } from './DeleteWorkspaceSessionDialog';

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
  return (
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
            <DeleteWorkspaceSessionDialog
              deleteError={deleteError}
              deletingSessionId={deletingSessionId}
              onDelete={onDelete}
              session={session}
            />
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
  );
}
