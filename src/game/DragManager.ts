/**
 * Centralized drag-and-drop manager for all card games.
 * Singleton class — no React state during drag. All position updates via direct DOM manipulation.
 */

export interface DragSource {
  source: string;
  cardIndex: number;
}

export type DropHandler = (source: DragSource, targetId: string | null) => void;

const DRAG_THRESHOLD = 6;
const LIFT_OFFSET = 24;
const FORGIVENESS_MOUSE = 24;
const FORGIVENESS_TOUCH = 36;

interface DragConfig {
  /** Called when a validated drop occurs */
  onDrop: DropHandler;
  /** If true, treat tableau source as multi-card stack (Klondike) */
  multiCardStacks?: boolean;
}

interface InternalState {
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
  isTouch: boolean;
  config: DragConfig | null;
  dropTargetRects: Map<string, DOMRect>;
}

class DragManagerClass {
  private s: InternalState = this.freshState();
  private listeners: (() => void) | null = null;
  private onChange: (() => void) | null = null;

  // Exposed read-only state
  public isDragging = false;
  public dragSource: DragSource | null = null;

  private freshState(): InternalState {
    return {
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
      isTouch: false,
      config: null,
      dropTargetRects: new Map(),
    };
  }

  /** Register a change listener (called on drag start/end to trigger React re-render) */
  setOnChange(fn: () => void) {
    this.onChange = fn;
  }

  /** Cache all drop target rects at drag start */
  private cacheDropTargets() {
    this.s.dropTargetRects.clear();
    document.querySelectorAll('[data-drop-target]').forEach(el => {
      const id = el.getAttribute('data-drop-target');
      if (id) this.s.dropTargetRects.set(id, el.getBoundingClientRect());
    });
  }

  /** Start tracking a potential drag. Call from onPointerDown on a card element. */
  startDrag(e: React.PointerEvent, source: string, cardIndex: number, config: DragConfig) {
    if (e.button !== 0) return;
    if (this.s.active) return;
    e.preventDefault();
    e.stopPropagation();

    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);

    const rect = el.getBoundingClientRect();
    this.s.active = true;
    this.s.thresholdMet = false;
    this.s.source = { source, cardIndex };
    this.s.startX = e.clientX;
    this.s.startY = e.clientY;
    this.s.offsetX = e.clientX - rect.left;
    this.s.offsetY = e.clientY - rect.top;
    this.s.pointerId = e.pointerId;
    this.s.isTouch = e.pointerType === 'touch';
    this.s.originElements = [el];
    this.s.ghostEl = null;
    this.s.config = config;

    const moveHandler = (ev: PointerEvent) => this.onPointerMove(ev);
    const upHandler = (ev: PointerEvent) => this.onPointerUp(ev);

    document.addEventListener('pointermove', moveHandler, { passive: false });
    document.addEventListener('pointerup', upHandler, { passive: false });
    document.addEventListener('pointercancel', upHandler, { passive: false });

    this.listeners = () => {
      document.removeEventListener('pointermove', moveHandler);
      document.removeEventListener('pointerup', upHandler);
      document.removeEventListener('pointercancel', upHandler);
    };
  }

  private onPointerMove(e: PointerEvent) {
    if (!this.s.active || e.pointerId !== this.s.pointerId) return;
    e.preventDefault();

    const dx = e.clientX - this.s.startX;
    const dy = e.clientY - this.s.startY;

    if (!this.s.thresholdMet) {
      if (Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD) return;
      this.s.thresholdMet = true;
      this.isDragging = true;
      this.dragSource = this.s.source;
      this.cacheDropTargets();
      this.createGhost(e);
      this.onChange?.();
    }

    if (this.s.ghostEl) {
      const ghostLeft = e.clientX - this.s.offsetX;
      const ghostTop = e.clientY - this.s.offsetY - LIFT_OFFSET;
      this.s.ghostEl.style.transform = `translate(${ghostLeft}px, ${ghostTop}px) scale(1.05)`;
    }
  }

  private onPointerUp(e: PointerEvent) {
    if (!this.s.active || e.pointerId !== this.s.pointerId) return;
    e.preventDefault();

    if (this.s.thresholdMet && this.s.source && this.s.config) {
      // Hide ghost for hit testing
      if (this.s.ghostEl) this.s.ghostEl.style.display = 'none';
      this.s.originElements.forEach(el => { el.style.visibility = 'hidden'; });

      const targetId = this.findBestDropTarget(e.clientX, e.clientY);

      this.s.originElements.forEach(el => { el.style.visibility = ''; });

      if (targetId) {
        // Successful drop path — remove ghost immediately
        this.removeGhost();
        this.s.config.onDrop(this.s.source, targetId);
      } else {
        // Snap back animation
        this.animateSnapBack();
        // onDrop with null so the board knows it failed (no-op)
      }
    }

    this.cleanup();
  }

  private createGhost(e: PointerEvent) {
    const originEl = this.s.originElements[0];
    if (!originEl) return;

    const ghost = document.createElement('div');
    ghost.style.position = 'fixed';
    ghost.style.zIndex = '9999';
    ghost.style.pointerEvents = 'none';
    ghost.style.willChange = 'transform';
    ghost.style.left = '0';
    ghost.style.top = '0';
    ghost.style.opacity = '0.95';
    ghost.style.boxShadow = '0 8px 24px rgba(0,0,0,0.25)';
    ghost.style.borderRadius = '6px';
    ghost.style.transition = 'transform 0.12s ease-out';

    const ghostLeft = e.clientX - this.s.offsetX;
    const ghostTop = e.clientY - this.s.offsetY - LIFT_OFFSET;
    ghost.style.transform = `translate(${ghostLeft}px, ${ghostTop}px) scale(1.05)`;

    const parent = originEl.parentElement;
    const isMultiCard = this.s.config?.multiCardStacks && this.s.source?.source.startsWith('tableau-') && parent;

    if (isMultiCard && parent) {
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
          this.s.originElements.push(children[i]);
        }
        // Remove duplicate first element (already in originElements)
        this.s.originElements = Array.from(new Set(this.s.originElements));
      }
    } else {
      const clone = originEl.cloneNode(true) as HTMLElement;
      clone.style.position = 'relative';
      ghost.appendChild(clone);
      originEl.style.opacity = '0.3';
    }

    // Remove transition after initial scale-up
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (ghost.parentElement) {
          ghost.style.transition = 'none';
        }
      });
    });

    document.body.appendChild(ghost);
    this.s.ghostEl = ghost;
  }

  private findBestDropTarget(clientX: number, clientY: number): string | null {
    const forgiveness = this.s.isTouch ? FORGIVENESS_TOUCH : FORGIVENESS_MOUSE;

    // Refresh rects in case layout shifted
    this.cacheDropTargets();

    let bestId: string | null = null;
    let bestDist = Infinity;

    this.s.dropTargetRects.forEach((rect, id) => {
      const expandedLeft = rect.left - forgiveness;
      const expandedRight = rect.right + forgiveness;
      const expandedTop = rect.top - forgiveness;
      const expandedBottom = rect.bottom + forgiveness;

      // Check if pointer is within expanded bounds
      const inHorizontal = clientX >= expandedLeft && clientX <= expandedRight;
      const inVertical = clientY >= expandedTop && clientY <= expandedBottom;

      // For tableau columns, also accept below the column
      const isTableau = id.startsWith('tableau-');

      let withinBounds = false;
      if (inHorizontal && inVertical) {
        withinBounds = true;
      } else if (isTableau && inHorizontal && clientY > expandedBottom) {
        // Below a tableau column but within horizontal band
        withinBounds = (clientY - expandedBottom) < forgiveness * 2;
      }

      if (!withinBounds) return;

      // Distance to center of rect
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dist = Math.sqrt((clientX - cx) ** 2 + (clientY - cy) ** 2);

      if (dist < bestDist) {
        bestDist = dist;
        bestId = id;
      }
    });

    return bestId;
  }

  private animateSnapBack() {
    const ghost = this.s.ghostEl;
    if (!ghost || this.s.originElements.length === 0) return;

    const originRect = this.s.originElements[0].getBoundingClientRect();
    ghost.style.transition = 'transform 250ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 250ms ease';
    ghost.style.transform = `translate(${originRect.left}px, ${originRect.top}px) scale(1.0)`;
    ghost.style.opacity = '0.7';

    ghost.addEventListener('transitionend', () => {
      this.removeGhost();
    }, { once: true });

    // Fallback in case transitionend doesn't fire
    setTimeout(() => this.removeGhost(), 300);
  }

  private removeGhost() {
    if (this.s.ghostEl) {
      this.s.ghostEl.remove();
      this.s.ghostEl = null;
    }
    this.s.originElements.forEach(el => {
      el.style.opacity = '';
    });
  }

  private cleanup() {
    // Don't remove ghost here if snap-back is animating
    if (!this.s.ghostEl) {
      this.s.originElements.forEach(el => {
        el.style.opacity = '';
      });
    }
    this.s.originElements = [];
    this.s.active = false;
    this.s.thresholdMet = false;
    this.s.source = null;
    this.s.config = null;
    this.isDragging = false;
    this.dragSource = null;
    this.onChange?.();

    if (this.listeners) {
      this.listeners();
      this.listeners = null;
    }
  }
}

/** Singleton instance */
export const dragManager = new DragManagerClass();
