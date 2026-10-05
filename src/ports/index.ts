import type { GameRecord, Settings } from '../domain/types';

/** Implement these contracts for a native shell or an authenticated online backend. */
export interface GameRepository {
  list(): Promise<GameRecord[]>;
  save(game: GameRecord): Promise<void>;
  loadSettings(): Promise<Settings | undefined>;
  saveSettings(settings: Settings): Promise<void>;
}
export interface EngineResult {
  bestMove: string | null;
  centipawns?: number;
  mate?: number;
  depth: number;
}
export interface ChessEngine {
  search(
    fen: string,
    options: { level: number; evaluation: boolean; moves?: string[] },
  ): Promise<EngineResult>;
  cancel(): void;
  dispose(): void;
}
export interface SpeechOutput {
  say(text: string): void;
  setEnabled(enabled: boolean): void;
  stop(): void;
}
export interface SpeechInput {
  start(onText: (text: string) => void, onStatus: (status: string) => void): Promise<void>;
  stop(): Promise<void>;
}

// Online games will be server-authoritative. A client cannot submit an arbitrary board.
export interface OnlineGameTransport {
  submitMove(
    gameId: string,
    expectedRevision: number,
    move: { from: string; to: string; promotion?: string },
  ): Promise<GameRecord>;
  subscribe(gameId: string, onGame: (game: GameRecord) => void): () => void;
}
