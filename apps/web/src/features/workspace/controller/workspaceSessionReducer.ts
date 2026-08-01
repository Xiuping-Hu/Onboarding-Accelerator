import type { ChatMessage, OnboardingSession } from '@onboarding/shared';
import {
  appendSessionMessage,
  indexSessionMessages,
  removeSessionMessages,
  replaceSessionMessages,
} from '../workspaceThreadModel';

export type DeleteError = { message: string; sessionId: string } | null;

export interface WorkspaceSessionState {
  sessions: OnboardingSession[];
  activeSessionId: string | null;
  guideSessionId: string | null;
  messagesBySessionId: Record<string, ChatMessage[]>;
  runningSessionIds: string[];
  deletingSessionId: string | null;
  deleteError: DeleteError;
}

export const initialWorkspaceSessionState: WorkspaceSessionState = {
  sessions: [],
  activeSessionId: null,
  guideSessionId: null,
  messagesBySessionId: {},
  runningSessionIds: [],
  deletingSessionId: null,
  deleteError: null,
};

export type WorkspaceSessionAction =
  | { type: 'bootstrapped'; sessions: OnboardingSession[] }
  | { type: 'session-created'; session: OnboardingSession }
  | { type: 'session-selected'; sessionId: string }
  | { type: 'session-updated'; session: OnboardingSession }
  | { type: 'delete-started'; sessionId: string }
  | { type: 'delete-failed'; sessionId: string; message: string }
  | { type: 'delete-finished'; sessionId: string }
  | { type: 'message-appended'; sessionId: string; message: ChatMessage }
  | { type: 'messages-replaced'; sessionId: string; messages: ChatMessage[] }
  | { type: 'run-started'; sessionId: string }
  | { type: 'run-finished'; sessionId: string };

export function workspaceSessionReducer(
  state: WorkspaceSessionState,
  action: WorkspaceSessionAction,
): WorkspaceSessionState {
  switch (action.type) {
    case 'bootstrapped': {
      const initialSessionId = action.sessions[0]?.id ?? null;
      return {
        ...state,
        sessions: action.sessions,
        messagesBySessionId: indexSessionMessages(action.sessions),
        activeSessionId: initialSessionId,
        guideSessionId: initialSessionId,
      };
    }
    case 'session-created':
      return {
        ...state,
        sessions: [action.session, ...state.sessions],
        messagesBySessionId: { ...state.messagesBySessionId, [action.session.id]: [] },
        activeSessionId: action.session.id,
      };
    case 'session-selected':
      return state.sessions.some((session) => session.id === action.sessionId)
        ? { ...state, activeSessionId: action.sessionId }
        : state;
    case 'session-updated':
      return {
        ...state,
        sessions: state.sessions.map((session) =>
          session.id === action.session.id ? action.session : session,
        ),
      };
    case 'delete-started':
      if (state.sessions.length <= 1 || state.deletingSessionId !== null) return state;
      return { ...state, deletingSessionId: action.sessionId, deleteError: null };
    case 'delete-failed':
      return {
        ...state,
        deletingSessionId: null,
        deleteError: { sessionId: action.sessionId, message: action.message },
      };
    case 'delete-finished': {
      const remaining = state.sessions.filter((session) => session.id !== action.sessionId);
      if (remaining.length === state.sessions.length) {
        return { ...state, deletingSessionId: null };
      }
      const fallbackId = remaining[0]?.id ?? null;
      return {
        ...state,
        sessions: remaining,
        messagesBySessionId: removeSessionMessages(state.messagesBySessionId, action.sessionId),
        runningSessionIds: state.runningSessionIds.filter((id) => id !== action.sessionId),
        activeSessionId:
          state.activeSessionId === action.sessionId ? fallbackId : state.activeSessionId,
        guideSessionId:
          state.guideSessionId === action.sessionId ? fallbackId : state.guideSessionId,
        deletingSessionId: null,
        deleteError: null,
      };
    }
    case 'message-appended':
      return {
        ...state,
        messagesBySessionId: appendSessionMessage(
          state.messagesBySessionId,
          action.sessionId,
          action.message,
        ),
      };
    case 'messages-replaced':
      return {
        ...state,
        messagesBySessionId: replaceSessionMessages(
          state.messagesBySessionId,
          action.sessionId,
          action.messages,
        ),
      };
    case 'run-started':
      return {
        ...state,
        runningSessionIds: [...new Set([...state.runningSessionIds, action.sessionId])],
      };
    case 'run-finished':
      return {
        ...state,
        runningSessionIds: state.runningSessionIds.filter((id) => id !== action.sessionId),
      };
  }
}
