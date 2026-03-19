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

const RED = '#DC2626';
const BLACK = '#1a1a1a';

// Standard pip positions as percentages [x%, y%] within the card body
// x: 0=left col, 50=center, 100=right col
// y: 0=top, 100=bottom
type PipPos = [number, number, boolean?]; // [x%, y%, flipped?]

const PIP_POSITIONS: Record<string, PipPos[]> = {
  'A': [[50, 50]],
  '2': [[50, 15], [50, 85, true]],
  '3': [[50, 15], [50, 50], [50, 85, true]],
  '4': [[30, 15], [70, 15], [30, 85, true], [70, 85, true]],
  '5': [[30, 15], [70, 15], [50, 50], [30, 85, true], [70, 85, true]],
  '6': [[30, 15], [70, 15], [30, 50], [70, 50], [30, 85, true], [70, 85, true]],
  '7': [[30, 15], [70, 15], [50, 32.5], [30, 50], [70, 50], [30, 85, true], [70, 85, true]],
  '8': [[30, 15], [70, 15], [50, 32.5], [30, 50], [70, 50], [50, 67.5, true], [30, 85, true], [70, 85, true]],
  '9': [[30, 12], [70, 12], [30, 37], [70, 37], [50, 50], [30, 63, true], [70, 63, true], [30, 88, true], [70, 88, true]],
  '10': [[30, 12], [70, 12], [50, 25], [30, 37], [70, 37], [30, 63, true], [70, 63, true], [50, 75, true], [30, 88, true], [70, 88, true]],
};

function isFaceCard(rank: Rank): boolean {
  return rank === 'J' || rank === 'Q' || rank === 'K' || rank === 'A';
}

function CardFace({ card, compact }: { card: CardType; compact?: boolean }) {
  const red = isRed(card.suit);
  const color = red ? RED : BLACK;
  const symbol = suitSymbol(card.suit);
  const w = compact ? 56 : 70;
  const h = compact ? 80 : 100;
  const cornerFontSize = compact ? 9 : 11;
  const cornerSymbolSize = compact ? 8 : 10;

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="rounded-lg"
      style={{ display: 'block' }}
    >
      {/* Card background */}
      <rect x="0" y="0" width={w} height={h} rx="6" ry="6" fill="white" stroke="#d4d4d8" strokeWidth="1" />

      {/* Top-left corner: rank + suit */}
      <text x="4" y={cornerFontSize + 3} fontSize={cornerFontSize} fontWeight="600" fill={color} fontFamily="Inter, system-ui, sans-serif">
        {card.rank}
      </text>
      <text x="4" y={cornerFontSize + cornerSymbolSize + 4} fontSize={cornerSymbolSize} fill={color} fontFamily="Inter, system-ui, sans-serif">
        {symbol}
      </text>

      {/* Bottom-right corner: rank + suit (rotated) */}
      <g transform={`translate(${w}, ${h}) rotate(180)`}>
        <text x="4" y={cornerFontSize + 3} fontSize={cornerFontSize} fontWeight="600" fill={color} fontFamily="Inter, system-ui, sans-serif">
          {card.rank}
        </text>
        <text x="4" y={cornerFontSize + cornerSymbolSize + 4} fontSize={cornerSymbolSize} fill={color} fontFamily="Inter, system-ui, sans-serif">
          {symbol}
        </text>
      </g>

      {/* Center content */}
      {isFaceCard(card.rank) ? (
        // Face card / Ace: large centered letter
        <text
          x={w / 2}
          y={h / 2 + (compact ? 10 : 12)}
          fontSize={compact ? 28 : 34}
          fontWeight="700"
          fill={color}
          textAnchor="middle"
          fontFamily="Inter, system-ui, sans-serif"
        >
          {card.rank}
        </text>
      ) : (
        // Number card: pip layout
        <PipsSVG rank={card.rank} symbol={symbol} color={color} w={w} h={h} compact={compact} />
      )}
    </svg>
  );
}

function PipsSVG({ rank, symbol, color, w, h, compact }: { rank: Rank; symbol: string; color: string; w: number; h: number; compact?: boolean }) {
  const positions = PIP_POSITIONS[rank];
  if (!positions) return null;

  // Pip area: inset from corners to avoid overlapping rank labels
  const padX = compact ? 10 : 13;
  const padTop = compact ? 18 : 22;
  const padBottom = compact ? 18 : 22;
  const areaW = w - padX * 2;
  const areaH = h - padTop - padBottom;
  const pipSize = compact ? 10 : 13;

  return (
    <>
      {positions.map(([px, py, flipped], i) => {
        const cx = padX + (px / 100) * areaW;
        const cy = padTop + (py / 100) * areaH;
        return (
          <text
            key={i}
            x={cx}
            y={cy + pipSize * 0.35}
            fontSize={pipSize}
            fill={color}
            textAnchor="middle"
            fontFamily="Inter, system-ui, sans-serif"
            transform={flipped ? `rotate(180, ${cx}, ${cy})` : undefined}
          >
            {symbol}
          </text>
        );
      })}
    </>
  );
}

function CardBack({ compact }: { compact?: boolean }) {
  const w = compact ? 56 : 70;
  const h = compact ? 80 : 100;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="rounded-lg" style={{ display: 'block' }}>
      <rect x="0" y="0" width={w} height={h} rx="6" ry="6" fill="hsl(160, 60%, 40%)" />
      <rect x="3" y="3" width={w - 6} height={h - 6} rx="4" ry="4" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
      <text x={w / 2} y={h / 2 + 6} fontSize="16" fill="rgba(255,255,255,0.3)" textAnchor="middle" fontWeight="bold">♠</text>
    </svg>
  );
}

export function PlayingCard({ card, onClick, onDoubleClick, style, isDragging, className = '', compact }: PlayingCardProps) {
  const h = compact ? 'h-[80px]' : 'h-[100px]';
  const w = compact ? 'w-[56px]' : 'w-[70px]';

  return (
    <div
      className={`playing-card ${w} ${h} ${isDragging ? 'playing-card-dragging z-50' : 'z-0'} cursor-pointer ${className}`}
      style={style}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      {!card.faceUp ? <CardBack compact={compact} /> : <CardFace card={card} compact={compact} />}
    </div>
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
