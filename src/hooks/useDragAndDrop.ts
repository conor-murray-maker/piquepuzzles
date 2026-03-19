import { useState, useCallback, useRef } from 'react';

export interface DragSource {
  source: string;
  cardIndex: number;
}

export interface DragState {
  isDragging: boolean;
  source: DragSource | null;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  offsetX: number;
  offsetY: number;
}

const DRAG_THRESHOLD = 8;

export function useDragAndDrop(onDrop: (source: DragSource, targetElement: Element | null) => void) {
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    source: null,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    offsetX: 0,
    offsetY: 0,
  });

  const dragRef = useRef<DragState>(dragState);
  dragRef.current = dragState;

  const startDrag = useCallback((e: React.PointerEvent, source: string, cardIndex: number) => {
    // Only primary button / touch
    if (e.button !== 0) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDragState({
      isDragging: false,
      source: { source, cardIndex },
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
    });
  }, []);

  const moveDrag = useCallback((e: React.PointerEvent) => {
    const state = dragRef.current;
    if (!state.source) return;
    e.preventDefault();

    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    setDragState(prev => ({
      ...prev,
      isDragging: prev.isDragging || distance > DRAG_THRESHOLD,
      currentX: e.clientX,
      currentY: e.clientY,
    }));
  }, []);

  const endDrag = useCallback((e: React.PointerEvent) => {
    const state = dragRef.current;
    if (!state.source) return;
    e.preventDefault();

    if (state.isDragging) {
      // Find drop target under pointer
      const elements = document.elementsFromPoint(e.clientX, e.clientY);
      const dropTarget = elements.find(el => el.hasAttribute('data-drop-target'));
      onDrop(state.source, dropTarget || null);
    }

    setDragState({
      isDragging: false,
      source: null,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
      offsetX: 0,
      offsetY: 0,
    });
  }, [onDrop]);

  const cancelDrag = useCallback(() => {
    setDragState({
      isDragging: false,
      source: null,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
      offsetX: 0,
      offsetY: 0,
    });
  }, []);

  return {
    dragState,
    startDrag,
    moveDrag,
    endDrag,
    cancelDrag,
  };
}
