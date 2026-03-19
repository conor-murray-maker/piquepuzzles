import { Card as CardType } from '@/game/types';
import { PlayingCard } from './PlayingCard';

interface DragOverlayProps {
  cards: CardType[];
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
  compact?: boolean;
}

export function DragOverlay({ cards, x, y, offsetX, offsetY, compact }: DragOverlayProps) {
  if (cards.length === 0) return null;

  const offset = compact ? 18 : 22;

  return (
    <div
      className="fixed pointer-events-none z-[100]"
      style={{
        left: x - offsetX,
        top: y - offsetY,
      }}
    >
      {cards.map((card, i) => (
        <div key={card.id} style={{ position: i === 0 ? 'relative' : 'absolute', top: i * offset, left: 0 }}>
          <PlayingCard card={card} isDragging compact={compact} />
        </div>
      ))}
    </div>
  );
}
