import type { GameRecord } from './types';

/** Cloud version is independent of chess ply/revision (deletion is also a change). */
export interface CloudGame {
  id: string;
  ownerId: string;
  version: number;
  game: GameRecord | null;
}
export interface PendingGame extends CloudGame {
  dirty: boolean;
  changeId: string;
}
export interface CloudHistory {
  watch(next: (games: CloudGame[]) => void, error: (error: unknown) => void): () => void;
  /** Compare-and-swap. Return the current server record when another device changed it. */
  write(change: PendingGame): Promise<{ accepted: boolean; current: CloudGame }>;
}
export interface SyncStatus {
  phase: 'guest' | 'connecting' | 'syncing' | 'synced' | 'offline' | 'error';
  pending: number;
  message: string | null;
}
export function isContinuation(shorter: GameRecord, longer: GameRecord) {
  return (
    shorter.config.mode === longer.config.mode &&
    shorter.config.level === longer.config.level &&
    shorter.config.playerColor === longer.config.playerColor &&
    shorter.moves.length <= longer.moves.length &&
    shorter.moves.every((move, i) => {
      const other = longer.moves[i];
      return move.from === other.from && move.to === other.to && move.promotion === other.promotion;
    })
  );
}
