'use client';

import type { GuideGraph, KnowledgeSource } from '@onboarding/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getRootGuide } from '../api';
import { mergeSources, mergeSourcesForActiveSession } from '../workspaceThreadModel';
import { formatWorkspaceError } from './useWorkspaceSessions';

export function useWorkspaceGuide({
  activeSessionId,
  guideSessionId,
}: {
  activeSessionId: string | null;
  guideSessionId: string | null;
}) {
  const [graph, setGraph] = useState<GuideGraph | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [referencedStepId, setReferencedStepId] = useState<string | null>(null);
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [knowledgeMapEnabled, setKnowledgeMapEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const activeSessionIdRef = useRef(activeSessionId);
  const guideSessionIdRef = useRef(guideSessionId);
  const guideLoadRequestRef = useRef(0);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  useEffect(() => {
    guideSessionIdRef.current = guideSessionId;
  }, [guideSessionId]);

  const selectedStep = useMemo(
    () => graph?.steps.find((step) => step.id === selectedStepId) ?? null,
    [graph, selectedStepId],
  );
  const referencedStep = useMemo(
    () => graph?.steps.find((step) => step.id === referencedStepId) ?? null,
    [graph, referencedStepId],
  );
  const referenceCandidate = selectedStep?.id === graph?.rootId ? null : selectedStep;

  const loadGuide = useCallback(async (sessionId: string) => {
    const requestId = ++guideLoadRequestRef.current;
    setIsLoading(true);
    try {
      setApiError(null);
      const response = await getRootGuide({ sessionId, webSearchEnabled: false });
      if (requestId !== guideLoadRequestRef.current || guideSessionIdRef.current !== sessionId) {
        return;
      }
      setKnowledgeMapEnabled(response.knowledgeMapEnabled === true);
      setGraph(response.graph);
      setSources((current) => mergeSources(current, response.graph.sources));
      const focusId = response.focusStepId ?? response.graph.rootId;
      setSelectedStepId(response.graph.emptyReason === 'not_created' ? null : focusId);
    } catch (error) {
      if (requestId !== guideLoadRequestRef.current || guideSessionIdRef.current !== sessionId) {
        return;
      }
      setApiError(formatWorkspaceError(error, 'Could not load the onboarding roadmap.'));
    } finally {
      if (requestId === guideLoadRequestRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!guideSessionId) return;
    setGraph(null);
    setSelectedStepId(null);
    setReferencedStepId(null);
    setSources([]);
    void loadGuide(guideSessionId);
  }, [guideSessionId, loadGuide]);

  function referenceStep(stepId: string) {
    if (!graph?.steps.some((step) => step.id === stepId)) return;
    setSelectedStepId(stepId);
    setReferencedStepId(stepId);
  }

  function mergeChatSources(incoming: KnowledgeSource[], responseSessionId: string) {
    setSources((current) =>
      mergeSourcesForActiveSession(
        current,
        incoming,
        activeSessionIdRef.current,
        responseSessionId,
      ),
    );
  }

  function focusFromChat(stepIds: string[] | undefined, responseSessionId: string) {
    if (activeSessionIdRef.current !== responseSessionId || !stepIds?.length) return;
    setSelectedStepId((current) => stepIds[0] ?? current);
  }

  return {
    apiError,
    clearReference: () => setReferencedStepId(null),
    focusFromChat,
    graph,
    isGuideEmpty: graph?.emptyReason === 'not_created',
    isLoading,
    knowledgeMapEnabled,
    mergeChatSources,
    referenceCandidate,
    referencedStep,
    referenceStep,
    retry: () => {
      if (guideSessionId) void loadGuide(guideSessionId);
      else window.location.reload();
    },
    selectReferenceCandidate: () => {
      if (referenceCandidate) setReferencedStepId(referenceCandidate.id);
    },
    sources,
  };
}
