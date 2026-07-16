import type { GuideGraph, GuideStep } from '@onboarding/shared';

export type CanvasView = { offsetX: number; offsetY: number; scale: number };

export const minCanvasScale = 0.65;
export const maxCanvasScale = 1.45;

export function getVisibleGraph(
  graph: GuideGraph | null,
  _selectedStepId: string | null,
): GuideGraph | null {
  return graph;
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
  return isCollapsed ? 'Open assistant' : 'Close assistant';
}
