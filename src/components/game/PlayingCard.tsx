import { Card as CardType, isRed, suitSymbol, Rank, Suit } from '@/game/types';
import { RotateCcw } from 'lucide-react';

interface PlayingCardProps {
  card: CardType;
  onClick?: () => void;
  onDoubleClick?: () => void;
  style?: React.CSSProperties;
  isDragging?: boolean;
  className?: string;
  cardWidth?: number;
}

const RED = '#DC2626';
const BLACK = '#1a1a1a';
const NAVY = '#1B2340';

export const CARD_ASPECT_RATIO = 1.5;

type PipPos = [number, number, boolean?];

const PIP_POSITIONS: Record<string, PipPos[]> = {
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
  return rank === 'J' || rank === 'Q' || rank === 'K';
}

function CardFace({ card, w, h }: { card: CardType; w: number; h: number }) {
  const red = isRed(card.suit);
  const color = red ? RED : BLACK;
  const symbol = suitSymbol(card.suit);

  const cornerRankSize = Math.max(11, w * 0.25);
  const cornerSuitSize = Math.max(9, w * 0.22);
  const cornerX = w * 0.08;
  const cornerRankY = cornerRankSize + 2;
  const cornerSuitY = cornerRankY + cornerSuitSize + 1;

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="rounded-lg"
      style={{ display: 'block' }}
    >
      <rect x="0" y="0" width={w} height={h} rx="5" ry="5" fill="white" stroke="#e2e8f0" strokeWidth="1" />

      {/* Top-left corner */}
      <text x={cornerX} y={cornerRankY} fontSize={cornerRankSize} fontWeight="800" fill={color} fontFamily="Inter, system-ui, sans-serif">
        {card.rank}
      </text>
      <text x={cornerX} y={cornerSuitY} fontSize={cornerSuitSize} fontWeight="700" fill={color} fontFamily="Inter, system-ui, sans-serif">
        {symbol}
      </text>

      {/* Bottom-right corner (rotated) */}
      <g transform={`translate(${w}, ${h}) rotate(180)`}>
        <text x={cornerX} y={cornerRankY} fontSize={cornerRankSize} fontWeight="800" fill={color} fontFamily="Inter, system-ui, sans-serif">
          {card.rank}
        </text>
        <text x={cornerX} y={cornerSuitY} fontSize={cornerSuitSize} fontWeight="700" fill={color} fontFamily="Inter, system-ui, sans-serif">
          {symbol}
        </text>
      </g>

      {/* Center content */}
      {card.rank === 'A' ? (
        <AceCenterSVG suit={card.suit} w={w} h={h} color={color} />
      ) : isFaceCard(card.rank) ? (
        <FaceCardCenterSVG rank={card.rank} w={w} h={h} color={color} />
      ) : (
        <PipsSVG rank={card.rank} symbol={symbol} color={color} w={w} h={h} />
      )}
    </svg>
  );
}

function AceCenterSVG({ suit, w, h, color }: { suit: Suit; w: number; h: number; color: string }) {
  const symbol = suitSymbol(suit);
  const fontSize = Math.min(w * 0.55, h * 0.35);
  return (
    <text
      x={w / 2}
      y={h / 2 + fontSize * 0.35}
      fontSize={fontSize}
      fill={color}
      textAnchor="middle"
      fontFamily="Inter, system-ui, sans-serif"
    >
      {symbol}
    </text>
  );
}

function FaceCardCenterSVG({ rank, w, h, color }: { rank: Rank; w: number; h: number; color: string }) {
  const boxW = w * 0.52;
  const boxH = h * 0.38;
  const boxX = (w - boxW) / 2;
  const boxY = (h - boxH) / 2;
  const fontSize = Math.min(boxW * 0.65, boxH * 0.7);

  return (
    <g>
      <rect x={boxX} y={boxY} width={boxW} height={boxH} rx="4" ry="4" fill={NAVY} />
      <rect x={boxX + 2} y={boxY + 2} width={boxW - 4} height={boxH - 4} rx="3" ry="3" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
      <text
        x={w / 2}
        y={h / 2 + fontSize * 0.32}
        fontSize={fontSize}
        fontWeight="800"
        fill="white"
        textAnchor="middle"
        fontFamily="Inter, system-ui, sans-serif"
        letterSpacing="1"
      >
        {rank}
      </text>
    </g>
  );
}

function PipsSVG({ rank, symbol, color, w, h }: { rank: Rank; symbol: string; color: string; w: number; h: number }) {
  const positions = PIP_POSITIONS[rank];
  if (!positions) return null;

  const padX = w * 0.18;
  const padTop = h * 0.22;
  const padBottom = h * 0.22;
  const areaW = w - padX * 2;
  const areaH = h - padTop - padBottom;
  const pipSize = Math.max(10, w * 0.24);

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

function CardBack({ w, h }: { w: number; h: number }) {
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="rounded-lg" style={{ display: 'block' }}>
      <rect x="0" y="0" width={w} height={h} rx="5" ry="5" fill="hsl(160, 60%, 40%)" />
      <rect x="3" y="3" width={w - 6} height={h - 6} rx="3" ry="3" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
      <g opacity="0.12">
        {Array.from({ length: 3 }).map((_, row) =>
          Array.from({ length: 2 }).map((_, col) => {
            const cx = w * 0.3 + col * w * 0.4;
            const cy = h * 0.25 + row * h * 0.25;
            return (
              <text key={`${row}-${col}`} x={cx} y={cy + 6} fontSize="12" fill="white" textAnchor="middle" fontWeight="bold">♦</text>
            );
          })
        )}
      </g>
    </svg>
  );
}

export function PlayingCard({ card, onClick, onDoubleClick, style, isDragging, className = '', cardWidth = 70 }: PlayingCardProps) {
  const w = cardWidth;
  const h = Math.round(w * CARD_ASPECT_RATIO);

  return (
    <div
      className={`playing-card ${isDragging ? 'playing-card-dragging z-50' : 'z-0'} cursor-pointer ${className}`}
      style={{
        width: w,
        height: h,
        boxShadow: isDragging ? 'var(--shadow-playing-card-drag)' : '0 1px 3px rgba(0,0,0,0.12)',
        ...style,
      }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      {!card.faceUp ? <CardBack w={w} h={h} /> : <CardFace card={card} w={w} h={h} />}
    </div>
  );
}

/** Get suit color for foundation styling */
function getSuitColor(label?: string): { border: string; bg: string; text: string } {
  if (label === '♥' || label === '♦') {
    return { border: 'rgba(220, 38, 38, 0.4)', bg: 'rgba(220, 38, 38, 0.05)', text: 'rgba(220, 38, 38, 0.4)' };
  }
  if (label === '♣' || label === '♠') {
    return { border: 'rgba(26, 26, 26, 0.35)', bg: 'rgba(26, 26, 26, 0.04)', text: 'rgba(26, 26, 26, 0.35)' };
  }
  return { border: '#cbd5e1', bg: 'transparent', text: 'rgba(203, 213, 225, 0.6)' };
}

export function EmptyPile({ label, onClick, className = '', cardWidth = 70, variant = 'default' }: {
  label?: string;
  onClick?: () => void;
  className?: string;
  cardWidth?: number;
  variant?: 'default' | 'foundation' | 'freecell' | 'stock-empty';
}) {
  const w = cardWidth;
  const h = Math.round(w * CARD_ASPECT_RATIO);

  if (variant === 'freecell') {
    return (
      <div
        className={`rounded-lg flex items-center justify-center cursor-pointer ${className}`}
        style={{
          width: w,
          height: h,
          backgroundColor: '#F3F4F6',
          border: '1.5px solid #D1D5DB',
        }}
        onClick={onClick}
      />
    );
  }

  if (variant === 'foundation') {
    const colors = getSuitColor(label);
    return (
      <div
        className={`rounded-lg flex items-center justify-center cursor-pointer ${className}`}
        style={{
          width: w,
          height: h,
          border: `1.5px solid ${colors.border}`,
          backgroundColor: colors.bg,
        }}
        onClick={onClick}
      >
        {label && (
          <span style={{
            color: colors.text,
            fontSize: Math.max(20, w * 0.45),
            fontWeight: 500,
            lineHeight: 1,
          }}>
            {label}
          </span>
        )}
      </div>
    );
  }

  if (variant === 'stock-empty') {
    return (
      <div
        className={`rounded-lg flex items-center justify-center cursor-pointer ${className}`}
        style={{
          width: w,
          height: h,
          border: '2px dashed #cbd5e1',
        }}
        onClick={onClick}
      >
        <RotateCcw style={{ width: w * 0.35, height: w * 0.35, color: '#94a3b8' }} />
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border-2 border-dashed border-border/50 flex items-center justify-center cursor-pointer ${className}`}
      style={{ width: w, height: h }}
      onClick={onClick}
    >
      {label && <span className="text-muted-foreground/40 text-xs font-medium">{label}</span>}
    </div>
  );
}
