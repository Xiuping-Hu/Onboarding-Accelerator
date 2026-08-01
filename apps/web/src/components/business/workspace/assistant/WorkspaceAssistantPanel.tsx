'use client';

import { SparklesIcon } from 'lucide-react';
import type { WorkspaceController } from '@/features/workspace/controller/workspaceController.types';
import { getAssistantDrawerToggleLabel } from '@/features/workspace/workspaceModel';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { AgentChatDrawer } from './AgentChatDrawer';
import { WorkspaceAssistantRuntimeProvider } from './WorkspaceAssistantRuntimeProvider';
import { WorkspaceSessionTabs } from './WorkspaceSessionTabs';

export function WorkspaceAssistantPanel({
  assistant,
  isLoading,
  userLabel,
}: {
  assistant: WorkspaceController['assistant'];
  isLoading: boolean;
  userLabel: string;
}) {
  return (
    <WorkspaceAssistantRuntimeProvider
      activeSessionId={assistant.activeSessionId}
      isLoading={isLoading}
      isRunning={assistant.isRunning}
      messages={assistant.activeMessages}
      onCreatePlan={assistant.onCreateSession}
      onDeletePlan={assistant.onDeleteSession}
      onSelectPlan={(sessionId) => {
        assistant.onSelectSession(sessionId);
        return Promise.resolve();
      }}
      onSendMessage={assistant.onSendMessage}
      sessions={assistant.sessions}
    >
      <aside
        aria-label="Onboarding assistant"
        className={cn(
          'relative flex h-full min-h-0 min-w-0 overflow-hidden border-l border-workspace-border bg-white shadow-[0_5px_18px_rgb(31_38_61_/_7%)] max-lg:mx-6 max-lg:mb-8 max-lg:h-[min(640px,82vh)] max-lg:w-[calc(100%-48px)] max-lg:rounded-xl max-lg:border max-md:mx-4 max-md:mb-7 max-md:h-[min(680px,82vh)] max-md:w-[calc(100%-32px)]',
          assistant.isMinimized &&
            'h-16 min-h-16 items-center justify-center border-workspace-assistant/20 bg-workspace-assistant-soft max-lg:ml-auto max-lg:h-16 max-lg:w-16 max-md:h-16 max-md:w-16',
        )}
        data-minimized={assistant.isMinimized ? 'true' : 'false'}
        data-slot="workspace-assistant-panel"
      >
        {assistant.isMinimized ? (
          <Button
            aria-controls="onboarding-assistant-content"
            aria-expanded="false"
            aria-label={getAssistantDrawerToggleLabel(true)}
            className="size-11 bg-workspace-assistant text-white hover:bg-indigo-700"
            onClick={() => assistant.setMinimized(false)}
            size="icon"
            type="button"
          >
            <SparklesIcon aria-hidden="true" className="size-6" />
          </Button>
        ) : (
          <Tabs
            className="h-full min-h-0 w-full min-w-0"
            onValueChange={assistant.onSelectSession}
            value={assistant.activeSessionId ?? ''}
          >
            <WorkspaceSessionTabs
              deleteError={assistant.deleteError}
              deletingSessionId={assistant.deletingSessionId}
              onCreate={assistant.onCreateSession}
              onDelete={assistant.onDeleteSession}
              sessions={assistant.sessions}
            />
            {assistant.activeSessionId ? (
              <TabsContent
                className="mt-0 flex min-h-0 min-w-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
                id="assistant-session-content"
                value={assistant.activeSessionId}
              >
                <div className="flex min-h-0 min-w-0 flex-1" id="onboarding-assistant-content">
                  <AgentChatDrawer
                    canSend={Boolean(assistant.activeSessionId)}
                    isRunning={assistant.isRunning}
                    messages={assistant.activeMessages}
                    onAddReference={assistant.onAddReference}
                    onMinimize={() => assistant.setMinimized(true)}
                    onRemoveReference={assistant.onRemoveReference}
                    onSendSuggestion={assistant.onSendMessage}
                    referenceCandidate={assistant.referenceCandidate}
                    referencedStep={assistant.referencedStep}
                    userLabel={userLabel}
                  />
                </div>
              </TabsContent>
            ) : null}
          </Tabs>
        )}
      </aside>
    </WorkspaceAssistantRuntimeProvider>
  );
}
