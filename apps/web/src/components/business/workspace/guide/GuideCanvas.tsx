import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { GuideEdge, GuideGraph, GuideStep } from '@onboarding/shared';
import { getZoomedCanvasView } from '@/features/workspace/workspaceModel';

type NodePoint = GuideStep & { x: number; y: number };
type HitTarget = { id: string; x: number; y: number; width: number; height: number };

const canvasZoomStep = 1.16;

const statusLabel: Record<GuideStep['status'], string> = {
  locked: 'Locked',
  ready: 'Ready',
  'in-progress': 'In progress',
  complete: 'Complete',
};

const statusColor: Record<GuideStep['status'], string> = {
  locked: '#7a7a7a',
  ready: '#0f6cbd',
  'in-progress': '#6264a7',
  complete: '#107c10',
};

export function getNodeLayout(graph: GuideGraph | null): NodePoint[] {
  if (!graph) {
    return [];
  }

  const byDepth = new Map<number, GuideStep[]>();
  for (const step of graph.steps) {
    byDepth.set(step.depth, [...(byDepth.get(step.depth) ?? []), step]);
  }

  const nodes: NodePoint[] = [];
  for (const [depth, steps] of [...byDepth.entries()].sort(([a], [b]) => a - b)) {
    const laneHeight = Math.max(132, 520 / Math.max(steps.length, 1));
    steps.forEach((step, index) => {
      nodes.push({
        ...step,
        x: 150 + depth * 300,
        y: 120 + index * laneHeight + (depth % 2) * 34,
      });
    });
  }

  return nodes;
}

export function GuideCanvas({
  graph,
  sessionId,
  selectedStepId,
  focusStepIds,
  onSelectStep,
}: {
  graph: GuideGraph | null;
  sessionId: string | null;
  selectedStepId: string | null;
  focusStepIds: string[];
  onSelectStep: (stepId: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const hitsRef = useRef<HitTarget[]>([]);
  const viewRef = useRef({ offsetX: 120, offsetY: 160, scale: 1, pulse: 0 });
  const targetViewRef = useRef({ offsetX: 120, offsetY: 160, scale: 1 });
  const initializedSessionIdRef = useRef<string | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
    moved: boolean;
  } | null>(null);
  const nodes = useMemo(() => getNodeLayout(graph), [graph]);
  const nodesById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) {
      return;
    }

    const resize = () => {
      const rect = wrapper.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * ratio));
      canvas.height = Math.max(1, Math.floor(rect.height * ratio));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const rootNode = graph?.rootId ? nodesById.get(graph.rootId) : undefined;
    const rect = canvas.getBoundingClientRect();

    if (
      rootNode &&
      rect.width > 0 &&
      rect.height > 0 &&
      initializedSessionIdRef.current !== sessionId
    ) {
      const nextView = {
        scale: 1,
        offsetX: rect.width / 2 - rootNode.x,
        offsetY: rect.height / 2 - rootNode.y,
      };
      targetViewRef.current = nextView;
      viewRef.current = { ...nextView, pulse: viewRef.current.pulse };
      initializedSessionIdRef.current = sessionId;
    }
  }, [graph?.rootId, nodesById, sessionId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    let frame = 0;
    const draw = () => {
      frame = window.requestAnimationFrame(draw);
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      const width = rect.width;
      const height = rect.height;

      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);

      const view = viewRef.current;
      view.pulse += 0.035;

      const gradient = context.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#f8fbff');
      gradient.addColorStop(0.58, '#ffffff');
      gradient.addColorStop(1, '#f5f7fb');
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);

      context.save();
      context.translate(view.offsetX, view.offsetY);
      context.scale(view.scale, view.scale);

      context.strokeStyle = 'rgba(98, 100, 167, 0.08)';
      context.lineWidth = 1;
      for (let x = -400; x < 2200; x += 40) {
        context.beginPath();
        context.moveTo(x, -400);
        context.lineTo(x, 1400);
        context.stroke();
      }
      for (let y = -400; y < 1400; y += 40) {
        context.beginPath();
        context.moveTo(-400, y);
        context.lineTo(2200, y);
        context.stroke();
      }

      const hitTargets: HitTarget[] = [];
      const edgeLookup = graph?.edges ?? [];
      for (const edge of edgeLookup) {
        drawEdge(context, edge, nodesById, view.pulse, focusStepIds.includes(edge.to));
      }

      for (const node of nodes) {
        const selected = node.id === selectedStepId;
        const focused = focusStepIds.includes(node.id);
        drawNode(context, node, selected, focused);
        hitTargets.push({
          id: node.id,
          x: node.x - 92,
          y: node.y - 38,
          width: 184,
          height: 76,
        });
      }

      hitsRef.current = hitTargets;
      context.restore();
    };

    draw();
    return () => window.cancelAnimationFrame(frame);
  }, [focusStepIds, graph?.edges, nodes, nodesById, selectedStepId]);

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: targetViewRef.current.offsetX,
      offsetY: targetViewRef.current.offsetY,
      moved: false,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (Math.hypot(deltaX, deltaY) > 3) {
      drag.moved = true;
    }

    const nextView = {
      ...targetViewRef.current,
      offsetX: drag.offsetX + deltaX,
      offsetY: drag.offsetY + deltaY,
    };
    targetViewRef.current = nextView;
    viewRef.current.offsetX = nextView.offsetX;
    viewRef.current.offsetY = nextView.offsetY;
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const drag = dragRef.current;
    dragRef.current = null;

    if (!canvas || (drag && drag.moved)) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const view = viewRef.current;
    const x = (event.clientX - rect.left - view.offsetX) / view.scale;
    const y = (event.clientY - rect.top - view.offsetY) / view.scale;
    const hit = hitsRef.current.find(
      (target) =>
        x >= target.x &&
        x <= target.x + target.width &&
        y >= target.y &&
        y <= target.y + target.height,
    );

    if (hit) {
      onSelectStep(hit.id);
    }
  };

  const zoomCanvas = useCallback((scaleMultiplier: number, point?: { x: number; y: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const anchor = point ?? { x: rect.width / 2, y: rect.height / 2 };
    const nextView = getZoomedCanvasView(
      targetViewRef.current,
      anchor,
      targetViewRef.current.scale * scaleMultiplier,
    );
    targetViewRef.current = nextView;
    viewRef.current.offsetX = nextView.offsetX;
    viewRef.current.offsetY = nextView.offsetY;
    viewRef.current.scale = nextView.scale;
  }, []);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const rect = canvas.getBoundingClientRect();
      zoomCanvas(event.deltaY > 0 ? 1 / canvasZoomStep : canvasZoomStep, {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    };

    wrapper.addEventListener('wheel', handleWheel, { passive: false });
    return () => wrapper.removeEventListener('wheel', handleWheel);
  }, [zoomCanvas]);

  return (
    <div className="canvas-shell" ref={wrapperRef}>
      <div className="canvas-controls" aria-label="Map zoom controls">
        <button aria-label="Zoom in" onClick={() => zoomCanvas(canvasZoomStep)} type="button">
          +
        </button>
        <button aria-label="Zoom out" onClick={() => zoomCanvas(1 / canvasZoomStep)} type="button">
          -
        </button>
      </div>
      <canvas
        ref={canvasRef}
        aria-label="Interactive onboarding guidance map. Drag to pan and scroll to zoom."
        className="guide-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        role="img"
      />
      <div className="canvas-hint" aria-hidden="true">
        Drag to pan. Scroll or use +/- to zoom.
      </div>
    </div>
  );
}

function drawEdge(
  context: CanvasRenderingContext2D,
  edge: GuideEdge,
  nodesById: Map<string, NodePoint>,
  pulse: number,
  highlighted: boolean,
) {
  const from = nodesById.get(edge.from);
  const to = nodesById.get(edge.to);
  if (!from || !to) {
    return;
  }

  const startX = from.x + 92;
  const startY = from.y;
  const endX = to.x - 92;
  const endY = to.y;
  const controlX = startX + (endX - startX) * 0.5;
  const alpha = highlighted ? 0.92 : 0.42;

  context.save();
  context.lineWidth = highlighted ? 4 : 2;
  context.strokeStyle = `rgba(98, 100, 167, ${alpha})`;
  context.setLineDash(highlighted ? [10, 8] : []);
  context.lineDashOffset = -pulse * 24;
  context.beginPath();
  context.moveTo(startX, startY);
  context.bezierCurveTo(controlX, startY, controlX, endY, endX, endY);
  context.stroke();

  context.fillStyle = highlighted ? '#6264a7' : '#8a8cc7';
  context.beginPath();
  context.moveTo(endX, endY);
  context.lineTo(endX - 12, endY - 6);
  context.lineTo(endX - 12, endY + 6);
  context.closePath();
  context.fill();

  if (edge.label) {
    context.font = '12px Segoe UI, sans-serif';
    context.fillStyle = '#4f52a3';
    context.fillText(edge.label, controlX - 14, (startY + endY) / 2 - 8);
  }
  context.restore();
}

function drawNode(
  context: CanvasRenderingContext2D,
  node: NodePoint,
  selected: boolean,
  focused: boolean,
) {
  const width = 184;
  const height = 76;
  const x = node.x - width / 2;
  const y = node.y - height / 2;
  const radius = 8;
  const accentColor = statusColor[node.status] ?? '#6264a7';

  context.save();
  context.fillStyle = selected || focused ? '#f7f8ff' : '#ffffff';
  roundRect(context, x, y, width, height, radius);
  context.fill();

  context.lineWidth = focused ? 3 : selected ? 2 : 1;
  context.strokeStyle = focused ? '#0f6cbd' : selected ? '#6264a7' : '#b8bfd6';
  roundRect(context, x, y, width, height, radius);
  context.stroke();

  context.fillStyle = accentColor;
  roundRect(context, x + 12, y + 12, 10, 38, 4);
  context.fill();

  context.fillStyle = '#1f1f1f';
  context.font = '650 15px Segoe UI, sans-serif';
  context.fillText(trimText(context, node.title, 138), x + 32, y + 26);
  context.fillStyle = '#424242';
  context.font = '12px Segoe UI, sans-serif';
  context.fillText(trimText(context, node.summary, 132), x + 32, y + 47);
  context.fillStyle = '#303030';
  context.font = '600 11px Segoe UI, sans-serif';
  context.fillText(`${statusLabel[node.status]} | ${node.childIds.length} sub`, x + 32, y + 64);
  context.restore();
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
}

function trimText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (context.measureText(text).width <= maxWidth) {
    return text;
  }

  let next = text;
  while (next.length > 6 && context.measureText(`${next}...`).width > maxWidth) {
    next = next.slice(0, -1);
  }
  return `${next}...`;
}
