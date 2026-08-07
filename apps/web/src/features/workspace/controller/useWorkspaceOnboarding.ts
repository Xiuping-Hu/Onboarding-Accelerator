'use client';

import type {
  OnboardingTaskMutationSource,
  OnboardingTaskStatus,
  OnboardingPlanRevisionEvent,
  RoadmapChangeProposal,
  RoadmapCommand,
  WorkspaceOnboardingState,
} from '@onboarding/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyRoadmapAiProposal,
  applyRoadmapCommand,
  cancelOnboardingPlan,
  dismissRoadmapAiProposal,
  generateOnboardingPlan,
  getOnboardingCancellationImpact,
  getOnboardingPlanHistory,
  getOnboardingState,
  previewRoadmapCommand,
  requestRoadmapAiProposal,
  transitionOnboardingTask,
} from '../api';
import { formatWorkspaceError } from './useWorkspaceSessions';

export function useWorkspaceOnboarding(activeSessionId: string | null) {
  const [state, setState] = useState<WorkspaceOnboardingState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingTaskIds, setPendingTaskIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [proposal, setProposal] = useState<RoadmapChangeProposal | null>(null);
  const [history, setHistory] = useState<OnboardingPlanRevisionEvent[]>([]);
  const requestSequence = useRef(0);

  const reload = useCallback(async () => {
    const sequence = ++requestSequence.current;
    if (!activeSessionId) {
      setState(null);
      setProposal(null);
      setHistory([]);
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

  async function generate(goal: string, role?: string) {
    if (!activeSessionId || isMutating) return;
    setIsMutating(true);
    setError(null);
    try {
      const response = await generateOnboardingPlan(activeSessionId, {
        clientRequestId: crypto.randomUUID(),
        goal,
        ...(role?.trim() ? { role: role.trim() } : {}),
      });
      setState(response.state);
      await loadHistory();
    } catch (cause) {
      setError(formatWorkspaceError(cause, 'Could not generate the onboarding roadmap.'));
    } finally {
      setIsMutating(false);
    }
  }

  async function command(commandValue: RoadmapCommand) {
    if (!activeSessionId || state?.status !== 'ready' || isMutating) return;
    setIsMutating(true);
    setError(null);
    const idempotencyKey = crypto.randomUUID();
    const base = {
      expectedPlanRevision: state.projection.planRevision,
      idempotencyKey,
      command: commandValue,
    };
    try {
      const preview = await previewRoadmapCommand(activeSessionId, base);
      let destructiveImpactHash: string | undefined;
      if (preview.impact.destructive) {
        const confirmed = window.confirm(
          `This change will reset or remove ${preview.impact.completedTasksReset} completed task(s). Apply it now?`,
        );
        if (!confirmed) return;
        destructiveImpactHash = preview.impact.impactHash;
      }
      const response = await applyRoadmapCommand(activeSessionId, {
        ...base,
        ...(destructiveImpactHash ? { destructiveImpactHash } : {}),
      });
      setState(response.state);
      setProposal(null);
      await loadHistory();
    } catch (cause) {
      setError(formatWorkspaceError(cause, 'Could not update the onboarding roadmap.'));
      await reload();
    } finally {
      setIsMutating(false);
    }
  }

  async function propose(instruction: string, selectedStageKey?: string) {
    if (!activeSessionId || isMutating) return;
    setIsMutating(true);
    setError(null);
    try {
      setProposal(
        await requestRoadmapAiProposal(activeSessionId, {
          instruction,
          ...(selectedStageKey ? { selectedStageKey } : {}),
        }),
      );
    } catch (cause) {
      setError(formatWorkspaceError(cause, 'Could not prepare the AI roadmap change.'));
    } finally {
      setIsMutating(false);
    }
  }

  async function applyProposal() {
    if (!activeSessionId || !proposal || state?.status !== 'ready' || isMutating) {
      return;
    }
    setIsMutating(true);
    setError(null);
    try {
      let destructiveImpactHash: string | undefined;
      if (proposal.progressImpact.destructive) {
        const confirmed = window.confirm(
          `This AI change will reset or remove ${proposal.progressImpact.completedTasksReset} completed task(s). Apply it now?`,
        );
        if (!confirmed) return;
        destructiveImpactHash = proposal.progressImpact.impactHash;
      }
      const response = await applyRoadmapAiProposal(activeSessionId, proposal.id, {
        expectedPlanRevision: state.projection.planRevision,
        proposalHash: proposal.proposalHash,
        idempotencyKey: crypto.randomUUID(),
        ...(destructiveImpactHash ? { destructiveImpactHash } : {}),
      });
      setState(response.state);
      setProposal(null);
      await loadHistory();
    } catch (cause) {
      setError(formatWorkspaceError(cause, 'Could not apply the AI roadmap change.'));
      await reload();
    } finally {
      setIsMutating(false);
    }
  }

  async function dismissProposal() {
    if (!activeSessionId || !proposal || isMutating) return;
    setIsMutating(true);
    setError(null);
    try {
      await dismissRoadmapAiProposal(activeSessionId, proposal.id);
      setProposal(null);
    } catch (cause) {
      setError(formatWorkspaceError(cause, 'Could not dismiss the AI roadmap change.'));
    } finally {
      setIsMutating(false);
    }
  }

  const loadHistory = useCallback(async () => {
    if (!activeSessionId) return;
    try {
      const response = await getOnboardingPlanHistory(activeSessionId);
      setHistory(response.events);
    } catch {
      setHistory([]);
    }
  }, [activeSessionId]);

  useEffect(() => {
    if (state?.status === 'ready') void loadHistory();
  }, [loadHistory, state?.status]);

  async function cancel(reason: string) {
    if (!activeSessionId || state?.status !== 'ready' || isMutating) return;
    setIsMutating(true);
    setError(null);
    try {
      const impact = await getOnboardingCancellationImpact(activeSessionId);
      const confirmed = window.confirm(
        `Cancel this roadmap with ${impact.incompleteTaskCount} incomplete task(s)? Its history will be preserved.`,
      );
      if (!confirmed) return;
      setState(
        await cancelOnboardingPlan(activeSessionId, {
          expectedPlanRevision: state.projection.planRevision,
          idempotencyKey: crypto.randomUUID(),
          impactHash: impact.impactHash,
          reason,
        }),
      );
      setProposal(null);
      setHistory([]);
    } catch (cause) {
      setError(formatWorkspaceError(cause, 'Could not cancel the onboarding roadmap.'));
      await reload();
    } finally {
      setIsMutating(false);
    }
  }

  return {
    applyProposal,
    cancel,
    command,
    dismissProposal,
    error,
    generate,
    history,
    isLoading,
    isMutating,
    pendingTaskIds,
    proposal,
    propose,
    reload,
    state,
    transitionTask,
  };
}
