'use client';

import { ChevronLeftIcon, ChevronRightIcon, SparklesIcon } from 'lucide-react';
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
  isExpanded,
  isLoading,
  onExpandedChange,
  userLabel,
}: {
  assistant: WorkspaceController['assistant'];
  isExpanded: boolean;
  isLoading: boolean;
  onExpandedChange: (expanded: boolean) => void;
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
          'relative flex h-full min-h-0 min-w-0 max-lg:mx-6 max-lg:mb-8 max-lg:h-[min(640px,82vh)] max-lg:w-[calc(100%-48px)] max-md:mx-4 max-md:mb-7 max-md:h-[min(680px,82vh)] max-md:w-[calc(100%-32px)]',
          assistant.isMinimized &&
            'h-16 min-h-16 max-lg:ml-auto max-lg:h-16 max-lg:w-16 max-md:h-16 max-md:w-16',
        )}
        data-expanded={isExpanded ? 'true' : 'false'}
        data-minimized={assistant.isMinimized ? 'true' : 'false'}
        data-slot="workspace-assistant-panel"
      >
        <div
          className={cn(
            'relative flex h-full min-h-0 w-full min-w-0 overflow-hidden border-l border-workspace-border bg-white shadow-[0_5px_18px_rgb(31_38_61_/_7%)] max-lg:rounded-xl max-lg:border',
            assistant.isMinimized &&
              'items-center justify-center border-workspace-assistant/20 bg-workspace-assistant-soft',
          )}
          id="onboarding-assistant-panel-body"
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
        </div>
        {!assistant.isMinimized ? (
          <Button
            aria-controls="onboarding-assistant-panel-body"
            aria-label={
              isExpanded ? 'Restore onboarding assistant width' : 'Expand onboarding assistant'
            }
            aria-pressed={isExpanded}
            className="absolute top-1/2 left-0 z-20 hidden h-14 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-indigo-200 bg-white p-0 text-workspace-assistant shadow-[0_4px_14px_rgb(31_38_61_/_14%)] transition-[width,background-color,border-color,color,box-shadow] duration-200 hover:w-7 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 hover:shadow-[0_6px_18px_rgb(31_38_61_/_18%)] focus-visible:ring-2 focus-visible:ring-workspace-assistant focus-visible:ring-offset-2 motion-reduce:transition-none lg:inline-flex"
            onClick={() => onExpandedChange(!isExpanded)}
            size="icon"
            title={
              isExpanded ? 'Restore onboarding assistant width' : 'Expand onboarding assistant'
            }
            type="button"
            variant="outline"
          >
            {isExpanded ? (
              <ChevronRightIcon aria-hidden="true" className="size-3.5" />
            ) : (
              <ChevronLeftIcon aria-hidden="true" className="size-3.5" />
            )}
          </Button>
        ) : null}
      </aside>
    </WorkspaceAssistantRuntimeProvider>
  );
}
