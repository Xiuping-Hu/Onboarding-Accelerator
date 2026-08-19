'use client';

import type { OnboardingTaskStatus, WorkspaceOnboardingState } from '@onboarding/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { acknowledgeRoadmapNotice, getOnboardingState, transitionOnboardingTask } from '../api';
import { formatWorkspaceError } from './useWorkspaceSessions';

export function useWorkspaceOnboarding() {
  const [state, setState] = useState<WorkspaceOnboardingState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingTaskIds, setPendingTaskIds] = useState<string[]>([]);
  const [pendingNoticeId, setPendingNoticeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noticeError, setNoticeError] = useState<string | null>(null);
  const requestSequence = useRef(0);

  const reload = useCallback(async (): Promise<WorkspaceOnboardingState | null> => {
    const sequence = ++requestSequence.current;
    setIsLoading(true);
    setError(null);
    try {
      const next = await getOnboardingState();
      if (requestSequence.current !== sequence) return null;
      setState(next);
      return next;
    } catch (cause) {
      if (requestSequence.current === sequence) {
        setError(formatWorkspaceError(cause, 'Could not load onboarding progress.'));
      }
      return null;
    } finally {
      if (requestSequence.current === sequence) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();

    const reloadOnFocus = () => void reload();
    const reloadWhenVisible = () => {
      if (document.visibilityState === 'visible') void reload();
    };

    window.addEventListener('focus', reloadOnFocus);
    document.addEventListener('visibilitychange', reloadWhenVisible);
    return () => {
      window.removeEventListener('focus', reloadOnFocus);
      document.removeEventListener('visibilitychange', reloadWhenVisible);
    };
  }, [reload]);

  async function transitionTask(
    taskId: string,
    status: OnboardingTaskStatus,
    expectedTaskRevision: number,
  ) {
    if (state?.status !== 'ready' || pendingTaskIds.includes(taskId)) return;
    setPendingTaskIds((current) => [...current, taskId]);
    setError(null);
    try {
      await transitionOnboardingTask(taskId, {
        status,
        expectedTaskRevision,
        expectedStateRevision: state.userState.stateRevision,
        clientRequestId: crypto.randomUUID(),
      });
      await reload();
    } catch (cause) {
      const message = formatWorkspaceError(cause, 'Could not update the onboarding task.');
      await reload();
      setError(message);
    } finally {
      setPendingTaskIds((current) => current.filter((id) => id !== taskId));
    }
  }

  const acknowledgeNotice = useCallback(
    async (noticeId: string): Promise<boolean> => {
      if (pendingNoticeId) return false;
      setPendingNoticeId(noticeId);
      setNoticeError(null);
      try {
        await acknowledgeRoadmapNotice(noticeId);
        setState((current) => {
          if (current?.status !== 'ready' || current.newestUnreadNotice?.id !== noticeId) {
            return current;
          }
          return { ...current, newestUnreadNotice: null, unreadNoticeCount: 0 };
        });
        await reload();
        return true;
      } catch (cause) {
        setNoticeError(formatWorkspaceError(cause, 'Could not dismiss the roadmap update.'));
        return false;
      } finally {
        setPendingNoticeId(null);
      }
    },
    [pendingNoticeId, reload],
  );

  return {
    acknowledgeNotice,
    clearNoticeError: () => setNoticeError(null),
    error,
    isLoading,
    noticeError,
    pendingNoticeId,
    pendingTaskIds,
    reload,
    reportNoticeError: setNoticeError,
    state,
    transitionTask,
  };
}
