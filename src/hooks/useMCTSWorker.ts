import { useState, useEffect, useRef, useCallback } from 'react';
import { KlondikeState, FreeCellState, GameMode } from '@/game/types';

interface MCTSHintResult {
  bestMove: {
    type: string;
    from: string;
    to: string;
    cardIndex?: number;
    description: string;
  } | null;
  winRate: number;
  baselineWinRate: number;
  candidateCount: number;
}

interface MCTSWinProbResult {
  winProbability: number;
  simulationsRun: number;
}

function serializeKlondikeState(state: KlondikeState) {
  return {
    gameMode: 'klondike' as const,
    tableau: state.tableau,
    foundation: state.foundation,
    stock: state.stock,
    waste: state.waste,
    drawMode: state.drawMode,
    moves: state.moves,
  };
}

function serializeFreeCellState(state: FreeCellState) {
  return {
    gameMode: 'freecell' as const,
    tableau: state.tableau,
    foundation: state.foundation,
    freeCells: state.freeCells,
    moves: state.moves,
  };
}

export function useMCTSWorker() {
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef<Map<string, { resolve: (value: any) => void; reject: (err: any) => void; timeout: ReturnType<typeof setTimeout> }>>(new Map());
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    try {
      const worker = new Worker(
        new URL('../workers/mctsWorker.ts', import.meta.url),
        { type: 'module' }
      );

      worker.onmessage = (e: MessageEvent) => {
        const { type } = e.data;
        const pending = pendingRef.current.get(type);
        if (pending) {
          clearTimeout(pending.timeout);
          pendingRef.current.delete(type);
          pending.resolve(e.data);
        }
      };

      worker.onerror = () => {
        console.warn('[MCTS] Worker crashed — disabling MCTS features');
        setAvailable(false);
        // Reject all pending
        pendingRef.current.forEach(p => {
          clearTimeout(p.timeout);
          p.reject(new Error('Worker crashed'));
        });
        pendingRef.current.clear();
      };

      workerRef.current = worker;
    } catch {
      console.warn('[MCTS] Web Worker not supported — disabling MCTS features');
      setAvailable(false);
    }

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      pendingRef.current.forEach(p => {
        clearTimeout(p.timeout);
        p.reject(new Error('Unmounted'));
      });
      pendingRef.current.clear();
    };
  }, []);

  const postRequest = useCallback(<T>(message: any, resultType: string, timeoutMs: number): Promise<T> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current || !available) {
        reject(new Error('Worker not available'));
        return;
      }

      // Cancel existing request of same type
      const existing = pendingRef.current.get(resultType);
      if (existing) {
        clearTimeout(existing.timeout);
        existing.reject(new Error('Cancelled'));
        pendingRef.current.delete(resultType);
      }

      const timeout = setTimeout(() => {
        pendingRef.current.delete(resultType);
        reject(new Error('Timeout'));
      }, timeoutMs);

      pendingRef.current.set(resultType, { resolve, reject, timeout });
      workerRef.current.postMessage(message);
    });
  }, [available]);

  const requestHint = useCallback(async (
    state: KlondikeState | FreeCellState,
    gameMode: GameMode,
    simulations = 50
  ): Promise<MCTSHintResult | null> => {
    try {
      const gameState = gameMode === 'klondike'
        ? serializeKlondikeState(state as KlondikeState)
        : serializeFreeCellState(state as FreeCellState);

      const result = await postRequest<MCTSHintResult>(
        { type: 'HINT', gameState, simulations },
        'HINT_RESULT',
        2000
      );
      return result;
    } catch {
      return null;
    }
  }, [postRequest]);

  const requestWinProbability = useCallback(async (
    state: KlondikeState | FreeCellState,
    gameMode: GameMode,
    simulations = 30
  ): Promise<number | null> => {
    try {
      const gameState = gameMode === 'klondike'
        ? serializeKlondikeState(state as KlondikeState)
        : serializeFreeCellState(state as FreeCellState);

      const result = await postRequest<MCTSWinProbResult>(
        { type: 'WIN_PROBABILITY', gameState, simulations },
        'WIN_PROBABILITY_RESULT',
        3000
      );
      return result.winProbability;
    } catch {
      return null;
    }
  }, [postRequest]);

  return { requestHint, requestWinProbability, available };
}
