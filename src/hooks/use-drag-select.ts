import { useEffect, useRef, useState } from 'react';

export type DragRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Options = {
  enabled: boolean;
  onDragEnd: (ids: string[]) => void;
};

const THRESHOLD = 8;

// Selector for elements that should suppress drag activation — actual interactive
// controls. `[role="button"]` is intentionally excluded so history cards
// (which use that role on their outer div) can still serve as drag start points.
const IGNORE_SELECTOR = 'button, input, a, [role="menu"], [role="menuitem"]';

function toRect(sx: number, sy: number, cx: number, cy: number): DragRect {
  return {
    x: Math.min(sx, cx),
    y: Math.min(sy, cy),
    width: Math.abs(cx - sx),
    height: Math.abs(cy - sy),
  };
}

function hitTest(rect: DragRect): string[] {
  const elements = document.querySelectorAll<HTMLElement>('[data-entry-id]');
  const ids: string[] = [];
  elements.forEach((el) => {
    const id = el.dataset.entryId;
    if (!id) return;
    const b = el.getBoundingClientRect();
    const intersects =
      b.left < rect.x + rect.width &&
      b.right > rect.x &&
      b.top < rect.y + rect.height &&
      b.bottom > rect.y;
    if (intersects) ids.push(id);
  });
  return ids;
}

/** Rubber-band / lasso selection over any `[data-entry-id]` element in the DOM.
 *
 * Registers pointer listeners on `document` so drags can start from anywhere
 * (including outside the card grid). Activates only after the pointer moves
 * more than `THRESHOLD` pixels, so normal clicks pass through unaffected.
 *
 * Set `enabled` to `false` when a modal or detail panel is open so the drag
 * rect doesn't appear on top of unrelated content.
 *
 * `onDragEnd` receives the IDs of all `[data-entry-id]` elements whose bounding
 * rect intersects the final selection rectangle. */
export function useDragSelect({ enabled, onDragEnd }: Options) {
  const [dragRect, setDragRect] = useState<DragRect | null>(null);
  const [liveIds, setLiveIds] = useState<Set<string>>(new Set());

  const startRef = useRef<{ x: number; y: number } | null>(null);
  const activeRef = useRef(false);
  const onDragEndRef = useRef(onDragEnd);
  onDragEndRef.current = onDragEnd;

  useEffect(() => {
    if (!enabled) return;

    function onPointerDown(e: PointerEvent) {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest(IGNORE_SELECTOR)) return;
      startRef.current = { x: e.clientX, y: e.clientY };
    }

    function onPointerMove(e: PointerEvent) {
      if (!startRef.current) return;
      const { x: sx, y: sy } = startRef.current;

      if (!activeRef.current) {
        if (Math.hypot(e.clientX - sx, e.clientY - sy) < THRESHOLD) return;
        activeRef.current = true;
        document.body.style.userSelect = 'none';
      }

      const rect = toRect(sx, sy, e.clientX, e.clientY);
      setDragRect(rect);
      setLiveIds(new Set(hitTest(rect)));
    }

    function cancel() {
      document.body.style.userSelect = '';
      activeRef.current = false;
      startRef.current = null;
      setDragRect(null);
      setLiveIds(new Set());
    }

    function onPointerUp(e: PointerEvent) {
      if (!startRef.current) return;
      if (activeRef.current) {
        const rect = toRect(startRef.current.x, startRef.current.y, e.clientX, e.clientY);
        const ids = hitTest(rect);
        if (ids.length > 0) onDragEndRef.current(ids);
      }
      cancel();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && activeRef.current) cancel();
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.userSelect = '';
      startRef.current = null;
      activeRef.current = false;
      setDragRect(null);
      setLiveIds(new Set());
    };
  }, [enabled]);

  return { isDragging: dragRect !== null, dragRect, liveIds };
}
