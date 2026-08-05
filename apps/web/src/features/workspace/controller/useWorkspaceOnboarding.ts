'use client';

import type {
  OnboardingTaskMutationSource,
  OnboardingTaskStatus,
  WorkspaceOnboardingState,
} from '@onboarding/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getOnboardingState, transitionOnboardingTask } from '../api';
import { formatWorkspaceError } from './useWorkspaceSessions';

export function useWorkspaceOnboarding(activeSessionId: string | null) {
  const [state, setState] = useState<WorkspaceOnboardingState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingTaskIds, setPendingTaskIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);

  const reload = useCallback(async () => {
    const sequence = ++requestSequence.current;
    if (!activeSessionId) {
      setState(null);
      setError(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const next = await getOnboardingState(activeSessionId);
      if (requestSequence.current === sequence) setState(next);
    } catch (cause) {
      if (requestSequence.current === sequence) {
        setError(formatWorkspaceError(cause, 'Could not load onboarding progress.'));
      }
    } finally {
      if (requestSequence.current === sequence) setIsLoading(false);
    }
  }, [activeSessionId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function transitionTask(
    taskId: string,
    status: OnboardingTaskStatus,
    expectedRevision: number,
    source: OnboardingTaskMutationSource,
  ) {
    if (!activeSessionId || pendingTaskIds.includes(taskId)) return;
    setPendingTaskIds((current) => [...current, taskId]);
    setError(null);
    try {
      const response = await transitionOnboardingTask(activeSessionId, taskId, {
        status,
        expectedRevision,
        idempotencyKey: crypto.randomUUID(),
        source,
      });
      setState(response.state);
    } catch (cause) {
      const message = formatWorkspaceError(cause, 'Could not update the onboarding task.');
      await reload();
      setError(message);
    } finally {
      setPendingTaskIds((current) => current.filter((id) => id !== taskId));
    }
  }

  return { error, isLoading, pendingTaskIds, reload, state, transitionTask };
}
