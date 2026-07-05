# Limited Zoomable Client Canvas Spec

## Status

Proposed.

## Repo Findings

- The workspace UI lives in `apps/web/src/app/workspace/WorkspaceClient.tsx`.
- The central guide is rendered by a custom `<canvas>` component named `GuideCanvas`.
- `GuideCanvas` currently computes node positions with `getNodeLayout`, draws a grid, draws nodes and
  edges, and supports node selection through hit targets.
- The current viewport automatically animates toward the selected or focused node, but users cannot
  pan, zoom, or reset the canvas themselves.
- The shell already has collapsible left and right states through `isLeftPanelCollapsed`,
  `isRightPanelCollapsed`, and related CSS in `apps/web/src/app/globals.css`.
- `handleNavigateToStep` currently collapses the right panel automatically when a user selects a step.

## Goal

Change the client-facing workspace into a bounded canvas experience where the visible guide content
automatically fits the available area, users can zoom and move the canvas, and both side panels can
be collapsed without losing context.

## Non-Goals

- Change guide generation, RAG, chat orchestration, or session persistence.
- Replace the canvas renderer with SVG or DOM nodes.
- Build a whiteboard editor.
- Add multi-user cursors or collaboration.
- Redesign the right assistant drawer internals. That belongs to `008-assistant-ui-agent-drawer.md`.

## Parallelization Notes

- This spec can be implemented in parallel with `006-internal-ops-logging-no-ai-fees.md`.
- This spec can be implemented in parallel with `008-assistant-ui-agent-drawer.md` if the shell layout
  owns panel collapse state and the assistant drawer only consumes the width it is given.
- Shared touch and pointer handling should remain inside the canvas module so assistant-ui work does
  not need to know about pan or zoom internals.

## Target Experience

- The central workspace is a finite canvas, not an endless plane.
- When guide content loads or changes, the canvas calculates the content bounds and fits the full
  visible graph into the available viewport.
- Users can zoom in, zoom out, reset to fit, and pan the canvas.
- Panning is bounded so the guide cannot be dragged completely out of view.
- Collapsing or expanding either side panel causes the canvas to refit or preserve the user's chosen
  view without visual jumps.
- Left session manager collapse and right assistant drawer collapse are explicit user actions, not
  side effects of selecting a guide node.

## Canvas Model

Introduce a canvas viewport model:

```ts
interface CanvasViewport {
  offsetX: number;
  offsetY: number;
  scale: number;
  mode: 'fit' | 'manual';
}
```

Introduce a content bounds model:

```ts
interface CanvasBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
```

Required calculations:

- Derive content bounds from all visible nodes, including node width, node height, edge control
  padding, and a minimum outer margin.
- Derive the fit scale from `wrapperWidth`, `wrapperHeight`, and content bounds.
- Clamp fit scale between configured `minScale` and `maxScale`.
- Clamp manual scale between configured `minScale` and `maxScale`.
- Clamp offsets so content remains at least partially visible in the viewport.
- Recalculate bounds whenever `visibleGraph`, layout dimensions, or panel widths change.

Recommended defaults:

- `minScale`: `0.35`
- `maxScale`: `1.8`
- `fitPadding`: `48`
- `panBoundaryPadding`: `96`

## Interaction Requirements

- Mouse wheel or trackpad pinch zooms around the pointer location.
- Dragging an empty canvas area pans the viewport.
- Dragging less than a small threshold still allows a node click.
- Double-clicking a node selects or expands it. Single click may keep the current select behavior if
  that is preferred during implementation.
- A compact canvas toolbar includes zoom out, fit, zoom in, and reset controls.
- Keyboard support includes plus or equals to zoom in, minus to zoom out, `0` to fit, and arrow keys
  to pan when the canvas has focus.
- Touch support includes one-finger pan and two-finger pinch zoom.
- The canvas exposes useful `aria-label` text and focus handling even though the drawing itself is a
  bitmap.

## Auto-Fit Rules

- On initial guide load, fit all visible content.
- On session change, fit all visible content.
- On graph expansion, fit all visible content unless the user is in manual mode and the selected node
  remains visible.
- On side panel collapse or expansion, preserve manual viewport when possible, otherwise refit.
- On "Fit" toolbar action, set mode back to `fit`.
- On user pan or zoom, set mode to `manual`.
- Assistant focus events may center highlighted nodes only when the user is still in `fit` mode or
  when the user explicitly chooses a "focus" action.

## Panel Behavior

- Keep the left session manager collapsible on desktop and mobile.
- Keep the right assistant drawer collapsible on desktop and mobile.
- Replace text-only chevrons with accessible icon buttons during implementation if an icon package is
  present or added for the UI work.
- Persist panel collapsed state in `localStorage` so returning users keep their preferred layout.
- Do not collapse the right drawer automatically on node select.
- On narrow screens, panels may stack, but their collapse controls must remain reachable.
- Canvas resize handling must use `ResizeObserver` and refit or clamp the viewport after panel width
  changes.

## Implementation Checklist

- [ ] Extract canvas viewport math into testable helper functions.
- [ ] Add content bounds calculation from visible nodes and edges.
- [ ] Add fit-to-content viewport calculation.
- [ ] Add scale and offset clamping.
- [ ] Add pointer drag panning.
- [ ] Add wheel or trackpad zoom around pointer.
- [ ] Add touch pan and pinch zoom.
- [ ] Add keyboard pan and zoom controls.
- [ ] Add a compact canvas toolbar.
- [ ] Add fit and reset actions.
- [ ] Persist left and right collapsed states.
- [ ] Remove automatic right drawer collapse from node selection.
- [ ] Refit or clamp viewport after graph changes and panel resize.
- [ ] Update CSS so text and controls do not overlap at desktop or mobile widths.
- [ ] Add unit tests for bounds, fit scale, zoom, and pan clamping.
- [ ] Add component tests for collapse state and canvas toolbar behavior.
- [ ] Manually verify desktop, tablet, and mobile responsive layouts.
- [ ] Verify `npm run lint`.
- [ ] Verify `npm test`.
- [ ] Verify `npm run build`.

## Acceptance Criteria

- Guide content fits automatically when a session or guide first loads.
- Users can zoom and pan the guide canvas.
- The canvas is bounded, and users cannot lose the graph entirely off-screen.
- Canvas controls remain usable with either side panel collapsed.
- Left session manager and right assistant drawer can each be collapsed and expanded.
- Panel collapse state persists across reloads.
- Selecting a guide node does not unexpectedly collapse the assistant drawer.
- Canvas layout remains stable after guide expansion, session change, and browser resize.
- Tests cover viewport math and key interaction state transitions.
