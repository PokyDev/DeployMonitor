import type { DragRect } from '../../../hooks/use-drag-select';

type Props = {
  dragRect: DragRect;
};

export default function HistoryDragOverlay({ dragRect }: Props) {
  return (
    <div className="history-drag-overlay" aria-hidden="true">
      <div
        className="history-drag-overlay__rect"
        style={{
          left: dragRect.x,
          top: dragRect.y,
          width: dragRect.width,
          height: dragRect.height,
        }}
      />
    </div>
  );
}
