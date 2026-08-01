'use client';

import { useEffect, useReducer, useRef, useState } from 'react';
import { createSession, deleteSession, listSessions } from '../api';
import {
  initialWorkspaceSessionState,
  workspaceSessionReducer,
  type WorkspaceSessionAction,
} from './workspaceSessionReducer';

export function formatWorkspaceError(error: unknown, fallback: string): string {
  return error instanceof Error ? `${fallback} ${error.message}` : fallback;
}

export function useWorkspaceSessions() {
  const [state, dispatch] = useReducer(workspaceSessionReducer, initialWorkspaceSessionState);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeSessionIdRef.current = state.activeSessionId;
  }, [state.activeSessionId]);

  useEffect(() => {
    void (async () => {
      setIsBootstrapping(true);
      try {
        setApiError(null);
        const response = await listSessions();
        let nextSessions = response.sessions;
        if (nextSessions.length === 0) {
          const created = await createSession({ title: 'Chat 1' });
          nextSessions = [created.session];
        }
        dispatch({ type: 'bootstrapped', sessions: nextSessions });
      } catch (error) {
        setApiError(formatWorkspaceError(error, 'Could not load chat sessions.'));
      } finally {
        setIsBootstrapping(false);
      }
    })();
  }, []);

  async function createWorkspaceSession() {
    try {
      setApiError(null);
      const created = await createSession({ title: `Chat ${state.sessions.length + 1}` });
      dispatch({ type: 'session-created', session: created.session });
    } catch (error) {
      setApiError(formatWorkspaceError(error, 'Could not create a new chat session.'));
    }
  }

  async function deleteWorkspaceSession(sessionId: string) {
    if (state.sessions.length <= 1 || state.deletingSessionId !== null) return;
    dispatch({ type: 'delete-started', sessionId });
    try {
      await deleteSession(sessionId);
      dispatch({ type: 'delete-finished', sessionId });
    } catch (error) {
      dispatch({
        type: 'delete-failed',
        sessionId,
        message: formatWorkspaceError(error, 'Could not delete the chat session.'),
      });
    }
  }

  function selectWorkspaceSession(sessionId: string) {
    dispatch({ type: 'session-selected', sessionId });
  }

  return {
    activeSessionIdRef,
    apiError,
    clearApiError: () => setApiError(null),
    createWorkspaceSession,
    deleteWorkspaceSession,
    dispatch: dispatch as React.Dispatch<WorkspaceSessionAction>,
    isBootstrapping,
    selectWorkspaceSession,
    setApiError,
    state,
  };
}
