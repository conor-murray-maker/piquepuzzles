import { PuzzleEngine, GameMode } from './PuzzleEngine';

class EngineRegistryClass {
  private engines: Map<string, PuzzleEngine> = new Map();

  register(engine: PuzzleEngine): void {
    this.engines.set(engine.gameMode, engine);
  }

  get(gameMode: GameMode): PuzzleEngine {
    const engine = this.engines.get(gameMode);
    if (!engine) {
      throw new Error(`No engine registered for game mode: ${gameMode}`);
    }
    return engine;
  }

  getAllModes(): GameMode[] {
    return Array.from(this.engines.keys());
  }
}

export const EngineRegistry = new EngineRegistryClass();
