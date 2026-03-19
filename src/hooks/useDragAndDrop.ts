import { useCallback, useRef } from 'react';

export interface DragSource {
  source: string;
  cardIndex: number;
}

export interface DragState {
  isDragging: boolean;
  source: DragSource | null;
}

const DRAG_THRESHOLD = 8;

/**
 * High-performance drag-and-drop using direct DOM transforms.
 * No setState during pointer move — all position updates are via direct style manipulation.
 */
export function useDragAndDrop(onDrop: (source: DragSource, targetElement: Element | null) => void) {
  const stateRef = useRef<{
    active: boolean;
    thresholdMet: boolean;
    source: DragSource | null;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
    ghostEl: HTMLDivElement | null;
    originElements: HTMLElement[];
    pointerId: number;
  }>({
    active: false,
    thresholdMet: false,
    source: null,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0,
    ghostEl: null,
    originElements: [],
    pointerId: -1,
  });

  // Expose a simple reactive state for UI (only updated on start/end)
  const dragStateRef = useRef<DragState>({ isDragging: false, source: null });
  const listenersRef = useRef<(() => void) | null>(null);
  const forceUpdateRef = useRef<(() => void) | null>(null);

  const setForceUpdate = useCallback((fn: () => void) => {
    forceUpdateRef.current = fn;
  }, []);

  const cleanup = useCallback(() => {
    const s = stateRef.current;
    if (s.ghostEl) {
      s.ghostEl.remove();
      s.ghostEl = null;
    }
    s.originElements.forEach(el => {
      el.style.opacity = '';
    });
    s.originElements = [];
    s.active = false;
    s.thresholdMet = false;
    s.source = null;
    dragStateRef.current = { isDragging: false, source: null };
    forceUpdateRef.current?.();

    if (listenersRef.current) {
      listenersRef.current();
      listenersRef.current = null;
    }
  }, []);

  const createGhost = useCallback((originEl: HTMLElement, e: PointerEvent) => {
    const s = stateRef.current;
    // Find the card elements to clone - this element and subsequent siblings if tableau stack
    const ghost = document.createElement('div');
    ghost.style.position = 'fixed';
    ghost.style.zIndex = '1000';
    ghost.style.pointerEvents = 'none';
    ghost.style.willChange = 'transform';
    ghost.style.left = '0';
    ghost.style.top = '0';
    ghost.style.transform = `translate(${e.clientX - s.offsetX}px, ${e.clientY - s.offsetY}px)`;

    // Clone the drag source element(s)
    const parent = originEl.parentElement;
    if (s.source && s.source.source.startsWith('tableau-') && parent) {
      // Get all sibling elements from cardIndex onward
      const children = Array.from(parent.children) as HTMLElement[];
      const startIdx = children.indexOf(originEl);
      if (startIdx >= 0) {
        for (let i = startIdx; i < children.length; i++) {
          const clone = children[i].cloneNode(true) as HTMLElement;
          clone.style.position = i === startIdx ? 'relative' : 'absolute';
          clone.style.top = i === startIdx ? '0' : `${(i - startIdx) * parseInt(children[i].style.top || '0') - parseInt(originEl.style.top || '0') + parseInt(children[startIdx].style.top || '0')}px`;
          // Simpler: use the actual offset from the first card
          if (i > startIdx) {
            const topVal = parseInt(children[i].style.top || '0') - parseInt(children[startIdx].style.top || '0');
            clone.style.top = `${topVal}px`;
          }
          clone.style.left = '0';
          ghost.appendChild(clone);
          // Fade original
          children[i].style.opacity = '0.3';
          s.originElements.push(children[i]);
        }
      }
    } else {
      const clone = originEl.cloneNode(true) as HTMLElement;
      clone.style.position = 'relative';
      ghost.appendChild(clone);
      originEl.style.opacity = '0.3';
      s.originElements.push(originEl);
    }

    document.body.appendChild(ghost);
    s.ghostEl = ghost;
  }, []);

  const onPointerMove = useCallback((e: PointerEvent) => {
    const s = stateRef.current;
    if (!s.active || e.pointerId !== s.pointerId) return;
    e.preventDefault();

    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;

    if (!s.thresholdMet) {
      if (Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD) return;
      s.thresholdMet = true;
      dragStateRef.current = { isDragging: true, source: s.source };
      // Create ghost from the original element
      const originEl = (e.target as HTMLElement).closest?.('[data-drag-handle]') as HTMLElement;
      // We stored the origin element ref - find it
      if (s.originElements.length > 0) {
        createGhost(s.originElements[0], e);
        // originElements were set by createGhost, which re-sets them
      }
      forceUpdateRef.current?.();
    }

    if (s.ghostEl) {
      s.ghostEl.style.transform = `translate(${e.clientX - s.offsetX}px, ${e.clientY - s.offsetY}px)`;
    }
  }, [createGhost]);

  const onPointerUp = useCallback((e: PointerEvent) => {
    const s = stateRef.current;
    if (!s.active || e.pointerId !== s.pointerId) return;
    e.preventDefault();

    if (s.thresholdMet && s.source) {
      // Hide ghost temporarily to find drop target
      if (s.ghostEl) s.ghostEl.style.display = 'none';
      // Also hide origin elements so they don't block hit-testing
      s.originElements.forEach(el => { el.style.visibility = 'hidden'; });
      const elements = document.elementsFromPoint(e.clientX, e.clientY);
      s.originElements.forEach(el => { el.style.visibility = ''; });
      if (s.ghostEl) s.ghostEl.style.display = '';

      // Walk up the DOM from each hit element to find the nearest drop target
      // This is critical because tableau columns use position:relative with minHeight,
      // but cards are absolutely positioned and can extend beyond the column's bounding box.
      // elementsFromPoint won't return the column div if the pointer is below minHeight,
      // but the card element IS a child of that column, so closest() finds it.
      let dropTarget: Element | null = null;
      for (const el of elements) {
        const target = el.closest('[data-drop-target]');
        if (target) {
          dropTarget = target;
          break;
        }
      }
      onDrop(s.source, dropTarget || null);
    }

    cleanup();
  }, [onDrop, cleanup]);

  const startDrag = useCallback((e: React.PointerEvent, source: string, cardIndex: number) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);

    const rect = el.getBoundingClientRect();
    const s = stateRef.current;
    s.active = true;
    s.thresholdMet = false;
    s.source = { source, cardIndex };
    s.startX = e.clientX;
    s.startY = e.clientY;
    s.offsetX = e.clientX - rect.left;
    s.offsetY = e.clientY - rect.top;
    s.pointerId = e.pointerId;
    s.originElements = [el];
    s.ghostEl = null;

    // Add document-level listeners
    const moveHandler = (ev: PointerEvent) => onPointerMove(ev);
    const upHandler = (ev: PointerEvent) => {
      onPointerUp(ev);
    };

    document.addEventListener('pointermove', moveHandler, { passive: false });
    document.addEventListener('pointerup', upHandler, { passive: false });
    document.addEventListener('pointercancel', upHandler, { passive: false });

    listenersRef.current = () => {
      document.removeEventListener('pointermove', moveHandler);
      document.removeEventListener('pointerup', upHandler);
      document.removeEventListener('pointercancel', upHandler);
    };
  }, [onPointerMove, onPointerUp]);

  return {
    dragState: dragStateRef.current,
    startDrag,
    setForceUpdate,
    cleanup,
  };
}
