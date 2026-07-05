import type { GuideGraph, GuideStep } from '@onboarding/shared';

export type CanvasView = { offsetX: number; offsetY: number; scale: number };

export const minCanvasScale = 0.65;
export const maxCanvasScale = 1.45;

export function getVisibleGraph(
  graph: GuideGraph | null,
  selectedStepId: string | null,
): GuideGraph | null {
  if (!graph || !selectedStepId) {
    return graph;
  }

  const stepsById = new Map(graph.steps.map((step) => [step.id, step]));
  const visibleIds = new Set<string>();
  let current = stepsById.get(selectedStepId);

  while (current) {
    visibleIds.add(current.id);
    current = current.parentId ? stepsById.get(current.parentId) : undefined;
  }

  const visitDescendants = (stepId: string) => {
    const step = stepsById.get(stepId);
    if (!step) {
      return;
    }

    for (const childId of step.childIds) {
      visibleIds.add(childId);
      visitDescendants(childId);
    }
  };

  visitDescendants(selectedStepId);

  if (selectedStepId === graph.rootId) {
    visibleIds.add(graph.rootId);
  }

  return {
    ...graph,
    steps: graph.steps.filter((step) => visibleIds.has(step.id)),
    edges: graph.edges.filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to)),
  };
}

export function clampCanvasScale(scale: number) {
  return Math.min(maxCanvasScale, Math.max(minCanvasScale, scale));
}

export function getZoomedCanvasView(
  view: CanvasView,
  point: { x: number; y: number },
  scale: number,
): CanvasView {
  const nextScale = clampCanvasScale(scale);
  const worldX = (point.x - view.offsetX) / view.scale;
  const worldY = (point.y - view.offsetY) / view.scale;

  return {
    scale: nextScale,
    offsetX: point.x - worldX * nextScale,
    offsetY: point.y - worldY * nextScale,
  };
}

export function getSelectedGuideStep(
  graph: GuideGraph | null,
  selectedStepId: string | null,
): GuideStep | null {
  if (!graph || !selectedStepId) {
    return null;
  }

  return graph.steps.find((step) => step.id === selectedStepId) ?? null;
}

export function getAssistantDrawerToggleLabel(isCollapsed: boolean) {
  return isCollapsed ? 'Open agent drawer' : 'Close agent drawer';
}
