import { Card, SUITS, RANKS } from './types';

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ id: `${rank}_${suit}`, suit, rank, faceUp: false });
    }
  }
  return deck;
}

// Seeded random for reproducible deals (daily challenge)
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

export function shuffleDeck(deck: Card[], seed?: number): Card[] {
  const cards = [...deck];
  const rand = seed !== undefined ? seededRandom(seed) : Math.random;
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

export function generateDealId(seed?: number): string {
  if (seed !== undefined) return `daily-${seed}`;
  return `deal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function generateSeed(): number {
  return Math.floor(Math.random() * 2147483647);
}
