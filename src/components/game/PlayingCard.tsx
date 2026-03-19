import { motion } from 'framer-motion';
import { Card as CardType, isRed, suitSymbol } from '@/game/types';

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
        <div className={`w-full h-full rounded-lg bg-card border border-border flex flex-col justify-between p-1 ${red ? 'text-card-red' : 'text-card-black'}`}>
          <div className="flex flex-col items-start leading-none">
            <span className={`font-semibold ${compact ? 'text-xs' : 'text-sm'}`}>{card.rank}</span>
            <span className={compact ? 'text-xs' : 'text-sm'}>{symbol}</span>
          </div>
          <div className="flex items-center justify-center flex-1">
            <span className={compact ? 'text-lg' : 'text-2xl'}>{symbol}</span>
          </div>
          <div className="flex flex-col items-end leading-none rotate-180">
            <span className={`font-semibold ${compact ? 'text-xs' : 'text-sm'}`}>{card.rank}</span>
            <span className={compact ? 'text-xs' : 'text-sm'}>{symbol}</span>
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
