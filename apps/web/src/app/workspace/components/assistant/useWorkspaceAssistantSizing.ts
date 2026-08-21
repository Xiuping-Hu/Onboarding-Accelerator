'use client';

import {
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

export const ASSISTANT_MIN_WIDTH = 300;
export const ASSISTANT_DEFAULT_WIDTH = 360;
export const ASSISTANT_EXPANDED_WIDTH = 560;
export const ASSISTANT_MAX_WIDTH = 720;

const WORKSPACE_MAIN_MIN_WIDTH = 420;
const WORKSPACE_COLUMN_GAP = 24;
const KEYBOARD_RESIZE_STEP = 16;

type DragState = {
  pointerId: number;
  removeWindowListeners: () => void;
  startClientX: number;
  startWidth: number;
  target: HTMLDivElement;
};

export interface WorkspaceAssistantSizing {
  isExpanded: boolean;
  isResizing: boolean;
  maxWidth: number;
  minWidth: number;
  onSeparatorKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onSeparatorLostPointerCapture: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onSeparatorPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onSeparatorPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onSeparatorPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onToggle: () => void;
  width: number;
}

export function getWorkspaceAssistantMaxWidth(gridWidth: number): number {
  return Math.max(
    ASSISTANT_MIN_WIDTH,
    Math.min(
      ASSISTANT_MAX_WIDTH,
      Math.floor(gridWidth - WORKSPACE_MAIN_MIN_WIDTH - WORKSPACE_COLUMN_GAP),
    ),
  );
}

export function useWorkspaceAssistantSizing(
  dashboardGridRef: RefObject<HTMLDivElement | null>,
): WorkspaceAssistantSizing {
  const [desiredWidth, setDesiredWidth] = useState(ASSISTANT_DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [maxWidth, setMaxWidth] = useState(ASSISTANT_MAX_WIDTH);
  const dragStateRef = useRef<DragState | null>(null);
  const isExpandedRef = useRef(false);
  const lastExpandedWidthRef = useRef(ASSISTANT_EXPANDED_WIDTH);
  const maxWidthRef = useRef(ASSISTANT_MAX_WIDTH);
  const width = clampWidth(desiredWidth, ASSISTANT_MIN_WIDTH, maxWidth);
  const isExpanded = width > Math.min(ASSISTANT_DEFAULT_WIDTH, maxWidth);
  const widthRef = useRef(width);

  const applyManualWidth = useCallback((requestedWidth: number) => {
    const nextWidth = clampWidth(requestedWidth, ASSISTANT_MIN_WIDTH, maxWidthRef.current);
    const expanded = nextWidth > Math.min(ASSISTANT_DEFAULT_WIDTH, maxWidthRef.current);

    widthRef.current = nextWidth;
    isExpandedRef.current = expanded;
    setDesiredWidth(nextWidth);
    if (expanded) lastExpandedWidthRef.current = nextWidth;
  }, []);

  const onToggle = useCallback(() => {
    if (isExpandedRef.current) {
      const nextWidth = Math.min(ASSISTANT_DEFAULT_WIDTH, maxWidthRef.current);
      widthRef.current = nextWidth;
      isExpandedRef.current = false;
      setDesiredWidth(nextWidth);
      return;
    }

    const nextWidth = Math.max(ASSISTANT_MIN_WIDTH, lastExpandedWidthRef.current);
    widthRef.current = clampWidth(nextWidth, ASSISTANT_MIN_WIDTH, maxWidthRef.current);
    isExpandedRef.current =
      widthRef.current > Math.min(ASSISTANT_DEFAULT_WIDTH, maxWidthRef.current);
    setDesiredWidth(nextWidth);
  }, []);

  const stopResize = useCallback((pointerId: number) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== pointerId) return;

    dragState.removeWindowListeners();
    dragStateRef.current = null;
    setIsResizing(false);
    if (dragState.target.hasPointerCapture(pointerId)) {
      dragState.target.releasePointerCapture(pointerId);
    }
  }, []);

  const finishResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      stopResize(event.pointerId);
    },
    [stopResize],
  );

  const onSeparatorPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || dragStateRef.current) return;

      event.preventDefault();
      const pointerId = event.pointerId;
      const target = event.currentTarget;
      const onWindowPointerMove = (pointerEvent: PointerEvent) => {
        const dragState = dragStateRef.current;
        if (!dragState || dragState.pointerId !== pointerEvent.pointerId) return;

        pointerEvent.preventDefault();
        applyManualWidth(dragState.startWidth + dragState.startClientX - pointerEvent.clientX);
      };
      const onWindowPointerEnd = (pointerEvent: PointerEvent) => {
        stopResize(pointerEvent.pointerId);
      };
      const onWindowBlur = () => stopResize(pointerId);
      const removeWindowListeners = () => {
        window.removeEventListener('pointermove', onWindowPointerMove);
        window.removeEventListener('pointerup', onWindowPointerEnd);
        window.removeEventListener('pointercancel', onWindowPointerEnd);
        window.removeEventListener('blur', onWindowBlur);
      };

      dragStateRef.current = {
        pointerId,
        removeWindowListeners,
        startClientX: event.clientX,
        startWidth: widthRef.current,
        target,
      };
      window.addEventListener('pointermove', onWindowPointerMove, { passive: false });
      window.addEventListener('pointerup', onWindowPointerEnd);
      window.addEventListener('pointercancel', onWindowPointerEnd);
      window.addEventListener('blur', onWindowBlur);
      setIsResizing(true);
      target.focus();
      target.setPointerCapture(pointerId);
    },
    [applyManualWidth, stopResize],
  );

  const onSeparatorKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const resizeStep = event.shiftKey ? KEYBOARD_RESIZE_STEP * 3 : KEYBOARD_RESIZE_STEP;

      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          applyManualWidth(widthRef.current + resizeStep);
          break;
        case 'ArrowRight':
          event.preventDefault();
          applyManualWidth(widthRef.current - resizeStep);
          break;
        case 'Home':
          event.preventDefault();
          applyManualWidth(ASSISTANT_MIN_WIDTH);
          break;
        case 'End':
          event.preventDefault();
          applyManualWidth(maxWidthRef.current);
          break;
        case 'Enter':
          event.preventDefault();
          onToggle();
          break;
      }
    },
    [applyManualWidth, onToggle],
  );

  useEffect(() => {
    const dashboardGrid = dashboardGridRef.current;
    if (!dashboardGrid) return;

    const updateMaxWidth = () => {
      const gridWidth = dashboardGrid.getBoundingClientRect().width || dashboardGrid.clientWidth;
      if (gridWidth <= 0) return;

      const nextMaxWidth = getWorkspaceAssistantMaxWidth(gridWidth);
      maxWidthRef.current = nextMaxWidth;
      setMaxWidth((currentMaxWidth) =>
        currentMaxWidth === nextMaxWidth ? currentMaxWidth : nextMaxWidth,
      );
    };

    updateMaxWidth();
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateMaxWidth);
    resizeObserver?.observe(dashboardGrid);
    window.addEventListener('resize', updateMaxWidth);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateMaxWidth);
    };
  }, [dashboardGridRef]);

  useLayoutEffect(() => {
    widthRef.current = width;
    isExpandedRef.current = isExpanded;
    dashboardGridRef.current?.style.setProperty('--workspace-assistant-width', `${width}px`);
  }, [dashboardGridRef, isExpanded, width]);

  useEffect(
    () => () => {
      dragStateRef.current?.removeWindowListeners();
    },
    [],
  );

  useEffect(() => {
    if (!isResizing) return;

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [isResizing]);

  return {
    isExpanded,
    isResizing,
    maxWidth,
    minWidth: ASSISTANT_MIN_WIDTH,
    onSeparatorKeyDown,
    onSeparatorLostPointerCapture: finishResize,
    onSeparatorPointerCancel: finishResize,
    onSeparatorPointerDown,
    onSeparatorPointerUp: finishResize,
    onToggle,
    width,
  };
}

function clampWidth(width: number, minWidth: number, maxWidth: number): number {
  return Math.min(Math.max(width, minWidth), maxWidth);
}
