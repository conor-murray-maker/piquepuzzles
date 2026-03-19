export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
  faceUp: boolean;
}

export type GameMode = 'klondike' | 'freecell';
export type DrawMode = 1 | 3;
export type Difficulty = 'Easy' | 'Medium' | 'Hard' | 'Expert';

export interface FreeCellState {
  tableau: Card[][];        // 8 columns
  foundation: Card[][];     // 4 piles
  freeCells: (Card | null)[]; // 4 free cells
  moves: number;
  startTime: number;
  hintsUsed: number;
  undosUsed: number;
  isWon: boolean;
  dealId: string;
  dealUuid?: string;
  difficulty: Difficulty;
  difficultyScore: number;
  seed?: number;
  minMoves?: number;
}

export interface KlondikeState {
  tableau: Card[][];        // 7 columns
  foundation: Card[][];     // 4 piles (hearts, diamonds, clubs, spades)
  stock: Card[];
  waste: Card[];
  drawMode: DrawMode;
  moves: number;
  startTime: number;
  hintsUsed: number;
  undosUsed: number;
  isWon: boolean;
  dealId: string;
  difficulty: Difficulty;
  difficultyScore: number;
  seed?: number;
  minMoves?: number;
}

export interface MoveRecord {
  type: 'tableau-to-tableau' | 'tableau-to-foundation' | 'waste-to-tableau' | 'waste-to-foundation' | 'stock-draw' | 'stock-reset' | 'foundation-to-tableau';
  from: { pile: string; index: number };
  to: { pile: string; index: number };
  cards: Card[];
  previousState: KlondikeState;
}

export interface RatingTier {
  name: string;
  min: number;
  max: number;
  color: string;
}

export const RATING_TIERS: RatingTier[] = [
  { name: 'Bronze', min: 0, max: 999, color: 'bronze' },
  { name: 'Silver', min: 1000, max: 1249, color: 'silver' },
  { name: 'Gold', min: 1250, max: 1499, color: 'gold' },
  { name: 'Platinum', min: 1500, max: 1749, color: 'platinum' },
  { name: 'Elite', min: 1750, max: 9999, color: 'elite' },
];

export function getTier(rating: number): RatingTier {
  return RATING_TIERS.find(t => rating >= t.min && rating <= t.max) || RATING_TIERS[0];
}

export const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
export const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function rankValue(rank: Rank): number {
  const vals: Record<Rank, number> = { A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13 };
  return vals[rank];
}

export function isRed(suit: Suit): boolean {
  return suit === 'hearts' || suit === 'diamonds';
}

export function suitSymbol(suit: Suit): string {
  const symbols: Record<Suit, string> = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
  return symbols[suit];
}
