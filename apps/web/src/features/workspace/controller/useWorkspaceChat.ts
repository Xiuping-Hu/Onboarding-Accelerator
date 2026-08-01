'use client';

import type {
  ChatMessage,
  GuideStep,
  KnowledgeSource,
  OnboardingSession,
} from '@onboarding/shared';
import { sendChat } from '../api';
import { formatWorkspaceError } from './useWorkspaceSessions';
import type { WorkspaceSessionAction, WorkspaceSessionState } from './workspaceSessionReducer';

export function useWorkspaceChat({
  clearApiError,
  clearReference,
  dispatch,
  focusFromChat,
  mergeChatSources,
  referencedStep,
  state,
}: {
  clearApiError: () => void;
  clearReference: () => void;
  dispatch: React.Dispatch<WorkspaceSessionAction>;
  focusFromChat: (stepIds: string[] | undefined, responseSessionId: string) => void;
  mergeChatSources: (sources: KnowledgeSource[], responseSessionId: string) => void;
  referencedStep: GuideStep | null;
  state: WorkspaceSessionState;
}) {
  async function sendWorkspaceMessage(message: string) {
    const sessionId = state.activeSessionId;
    if (!sessionId || message.trim().length === 0) return;

    const reference = referencedStep;
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: message.trim(),
      createdAt: new Date().toISOString(),
      ...(reference
        ? {
            guideNodeIds: [reference.id],
            roadmapReferences: [
              { nodeId: reference.id, title: reference.title, summary: reference.summary },
            ],
          }
        : {}),
    };

    dispatch({ type: 'message-appended', sessionId, message: userMessage });
    dispatch({ type: 'run-started', sessionId });
    clearReference();

    try {
      clearApiError();
      const response = await sendChat({
        sessionId,
        message: userMessage.content,
        webSearchEnabled: false,
        referencedNodeId: reference?.id,
      });
      if (response.session) {
        dispatch({ type: 'session-updated', session: response.session as OnboardingSession });
        dispatch({
          type: 'messages-replaced',
          sessionId,
          messages: response.session.chatHistory,
        });
      } else {
        dispatch({ type: 'message-appended', sessionId, message: response.message });
      }
      mergeChatSources(response.sources, sessionId);
      focusFromChat(response.focusStepIds, sessionId);
    } catch (error) {
      dispatch({
        type: 'message-appended',
        sessionId,
        message: {
          id: `assistant-error-${Date.now()}`,
          role: 'assistant',
          content: formatWorkspaceError(
            error,
            "I couldn't complete that request. Please try again.",
          ),
          createdAt: new Date().toISOString(),
        },
      });
    } finally {
      dispatch({ type: 'run-finished', sessionId });
    }
  }

  return { sendWorkspaceMessage };
}
