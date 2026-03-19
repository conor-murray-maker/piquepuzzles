import { motion } from 'framer-motion';
import { Card as CardType, isRed, suitSymbol, Rank } from '@/game/types';

interface PlayingCardProps {
  card: CardType;
  onClick?: () => void;
  onDoubleClick?: () => void;
  style?: React.CSSProperties;
  isDragging?: boolean;
  className?: string;
  compact?: boolean;
}

const CARD_BACK_PATTERN = (
  <div className="w-full h-full rounded-lg bg-primary flex items-center justify-center overflow-hidden">
    <div className="w-full h-full relative">
      <div className="absolute inset-1.5 rounded border border-primary-foreground/20 flex items-center justify-center">
        <span className="text-primary-foreground/40 text-lg font-bold">♠</span>
      </div>
    </div>
  </div>
);

type PipPosition = { row: number; col: number; flip?: boolean };

const PIP_LAYOUTS: Record<string, PipPosition[]> = {
  'A': [{ row: 2, col: 1 }],
  '2': [{ row: 0, col: 1 }, { row: 4, col: 1, flip: true }],
  '3': [{ row: 0, col: 1 }, { row: 2, col: 1 }, { row: 4, col: 1, flip: true }],
  '4': [{ row: 0, col: 0 }, { row: 0, col: 2 }, { row: 4, col: 0, flip: true }, { row: 4, col: 2, flip: true }],
  '5': [{ row: 0, col: 0 }, { row: 0, col: 2 }, { row: 2, col: 1 }, { row: 4, col: 0, flip: true }, { row: 4, col: 2, flip: true }],
  '6': [{ row: 0, col: 0 }, { row: 0, col: 2 }, { row: 2, col: 0 }, { row: 2, col: 2 }, { row: 4, col: 0, flip: true }, { row: 4, col: 2, flip: true }],
  '7': [{ row: 0, col: 0 }, { row: 0, col: 2 }, { row: 1, col: 1 }, { row: 2, col: 0 }, { row: 2, col: 2 }, { row: 4, col: 0, flip: true }, { row: 4, col: 2, flip: true }],
  '8': [{ row: 0, col: 0 }, { row: 0, col: 2 }, { row: 1, col: 1 }, { row: 2, col: 0 }, { row: 2, col: 2 }, { row: 3, col: 1, flip: true }, { row: 4, col: 0, flip: true }, { row: 4, col: 2, flip: true }],
  '9': [{ row: 0, col: 0 }, { row: 0, col: 2 }, { row: 1, col: 0 }, { row: 1, col: 2 }, { row: 2, col: 1 }, { row: 3, col: 0, flip: true }, { row: 3, col: 2, flip: true }, { row: 4, col: 0, flip: true }, { row: 4, col: 2, flip: true }],
  '10': [{ row: 0, col: 0 }, { row: 0, col: 2 }, { row: 1, col: 0 }, { row: 1, col: 1 }, { row: 1, col: 2 }, { row: 3, col: 0, flip: true }, { row: 3, col: 1, flip: true }, { row: 3, col: 2, flip: true }, { row: 4, col: 0, flip: true }, { row: 4, col: 2, flip: true }],
};

function isFaceCard(rank: Rank): boolean {
  return rank === 'J' || rank === 'Q' || rank === 'K';
}

function PipGrid({ rank, symbol, compact }: { rank: Rank; symbol: string; compact?: boolean }) {
  if (rank === 'A') {
    return (
      <div className="flex items-center justify-center flex-1">
        <span className={compact ? 'text-2xl' : 'text-3xl'}>{symbol}</span>
      </div>
    );
  }

  if (isFaceCard(rank)) {
    return (
      <div className="flex items-center justify-center flex-1">
        <span className={`font-bold ${compact ? 'text-xl' : 'text-2xl'}`}>{rank}</span>
      </div>
    );
  }

  const layout = PIP_LAYOUTS[rank];
  if (!layout) return null;

  const pipSize = compact ? 'text-[9px]' : 'text-[11px]';
  // 5 rows x 3 cols grid
  const rowCount = 5;
  const colCount = 3;

  return (
    <div className="flex-1 grid grid-rows-5 grid-cols-3 items-center justify-items-center px-0.5" style={{ gap: 0 }}>
      {Array.from({ length: rowCount * colCount }).map((_, idx) => {
        const row = Math.floor(idx / colCount);
        const col = idx % colCount;
        const pip = layout.find(p => p.row === row && p.col === col);
        if (pip) {
          return (
            <span key={idx} className={`${pipSize} leading-none ${pip.flip ? 'rotate-180' : ''}`}>
              {symbol}
            </span>
          );
        }
        return <span key={idx} />;
      })}
    </div>
  );
}

export function PlayingCard({ card, onClick, onDoubleClick, style, isDragging, className = '', compact }: PlayingCardProps) {
  const red = isRed(card.suit);
  const symbol = suitSymbol(card.suit);
  const h = compact ? 'h-[80px]' : 'h-[100px]';
  const w = compact ? 'w-[56px]' : 'w-[70px]';

  return (
    <motion.div
      className={`playing-card ${w} ${h} ${isDragging ? 'playing-card-dragging z-50' : 'z-0'} cursor-pointer ${className}`}
      style={style}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      whileHover={!isDragging ? { y: -2, transition: { duration: 0.15 } } : undefined}
      whileTap={{ scale: 0.98 }}
      layout
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
    >
      {!card.faceUp ? (
        CARD_BACK_PATTERN
      ) : (
        <div className={`w-full h-full rounded-lg bg-card border border-border flex flex-col p-1 ${red ? 'text-card-red' : 'text-card-black'}`}>
          {/* Top-left rank + suit */}
          <div className="flex flex-col items-start leading-none">
            <span className={`font-semibold ${compact ? 'text-[9px]' : 'text-xs'}`}>{card.rank}</span>
            <span className={compact ? 'text-[8px]' : 'text-[10px]'}>{symbol}</span>
          </div>
          {/* Pip area */}
          <PipGrid rank={card.rank} symbol={symbol} compact={compact} />
          {/* Bottom-right rank + suit (rotated) */}
          <div className="flex flex-col items-end leading-none rotate-180">
            <span className={`font-semibold ${compact ? 'text-[9px]' : 'text-xs'}`}>{card.rank}</span>
            <span className={compact ? 'text-[8px]' : 'text-[10px]'}>{symbol}</span>
          </div>
        </div>
      )}
    </motion.div>
  );
}

export function EmptyPile({ label, onClick, className = '', compact }: { label?: string; onClick?: () => void; className?: string; compact?: boolean }) {
  const h = compact ? 'h-[80px]' : 'h-[100px]';
  const w = compact ? 'w-[56px]' : 'w-[70px]';
  return (
    <div
      className={`${w} ${h} rounded-lg border-2 border-dashed border-border/50 flex items-center justify-center cursor-pointer ${className}`}
      onClick={onClick}
    >
      {label && <span className="text-muted-foreground/40 text-xs font-medium">{label}</span>}
    </div>
  );
}
