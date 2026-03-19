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
const DROP_SEARCH_RADIUS = 60;

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
    const ghost = document.createElement('div');
    ghost.style.position = 'fixed';
    ghost.style.zIndex = '1000';
    ghost.style.pointerEvents = 'none';
    ghost.style.willChange = 'transform';
    ghost.style.left = '0';
    ghost.style.top = '0';
    // Offset card 60px above touch point so it clears the thumb on mobile
    const yOffset = s.offsetY + 60;
    ghost.style.transform = `translate(${e.clientX - s.offsetX}px, ${e.clientY - yOffset}px)`;

    const parent = originEl.parentElement;
    if (s.source && s.source.source.startsWith('tableau-') && parent) {
      const children = Array.from(parent.children) as HTMLElement[];
      const startIdx = children.indexOf(originEl);
      if (startIdx >= 0) {
        for (let i = startIdx; i < children.length; i++) {
          const clone = children[i].cloneNode(true) as HTMLElement;
          clone.style.position = i === startIdx ? 'relative' : 'absolute';
          if (i > startIdx) {
            const topVal = parseInt(children[i].style.top || '0') - parseInt(children[startIdx].style.top || '0');
            clone.style.top = `${topVal}px`;
          }
          clone.style.left = '0';
          ghost.appendChild(clone);
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

  /**
   * Find the best drop target within DROP_SEARCH_RADIUS of the pointer.
   * Checks multiple points and also scans all drop targets by bounding rect proximity.
   */
  const findBestDropTarget = useCallback((clientX: number, clientY: number): Element | null => {
    // Strategy 1: Direct hit via elementsFromPoint
    const directElements = document.elementsFromPoint(clientX, clientY);
    for (const el of directElements) {
      const target = el.closest('[data-drop-target]');
      if (target) return target;
    }

    // Strategy 2: Check all drop targets by proximity
    const allTargets = document.querySelectorAll('[data-drop-target]');
    let bestTarget: Element | null = null;
    let bestDist = DROP_SEARCH_RADIUS;

    allTargets.forEach(target => {
      const rect = target.getBoundingClientRect();
      // Expand hit area by 20px on each side
      const expandedLeft = rect.left - 20;
      const expandedRight = rect.right + 20;
      const expandedTop = rect.top - 10;
      const expandedBottom = rect.bottom + 20;

      // Check if pointer is within horizontal bounds (expanded)
      const inHorizontal = clientX >= expandedLeft && clientX <= expandedRight;

      // For tableau columns, also accept if pointer is below the column (cards extend beyond minHeight)
      const targetId = target.getAttribute('data-drop-target') || '';
      const isTableau = targetId.startsWith('tableau-');

      let dist: number;
      if (inHorizontal && clientY >= expandedTop && clientY <= expandedBottom) {
        // Inside expanded bounds
        dist = 0;
      } else if (isTableau && inHorizontal && clientY > expandedBottom) {
        // Below a tableau column but within its horizontal band — still accept
        dist = clientY - expandedBottom;
      } else {
        // Calculate distance to nearest edge of expanded rect
        const dx = Math.max(expandedLeft - clientX, 0, clientX - expandedRight);
        const dy = Math.max(expandedTop - clientY, 0, clientY - expandedBottom);
        dist = Math.sqrt(dx * dx + dy * dy);
      }

      if (dist < bestDist) {
        bestDist = dist;
        bestTarget = target;
      }
    });

    return bestTarget;
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
      if (s.originElements.length > 0) {
        createGhost(s.originElements[0], e);
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
      // Hide ghost and origin elements for hit-testing
      if (s.ghostEl) s.ghostEl.style.display = 'none';
      s.originElements.forEach(el => { el.style.visibility = 'hidden'; });

      const dropTarget = findBestDropTarget(e.clientX, e.clientY);

      s.originElements.forEach(el => { el.style.visibility = ''; });
      if (s.ghostEl) s.ghostEl.style.display = '';

      onDrop(s.source, dropTarget || null);
    }

    cleanup();
  }, [onDrop, cleanup, findBestDropTarget]);

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

    const moveHandler = (ev: PointerEvent) => onPointerMove(ev);
    const upHandler = (ev: PointerEvent) => onPointerUp(ev);

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
