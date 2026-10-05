import { openDB, type DBSchema } from 'idb';
import type { GameRepository } from '../ports';
import type { GameRecord, Settings } from '../domain/types';

interface ApexDB extends DBSchema {
  games: { key: string; value: GameRecord };
  preferences: { key: string; value: Settings };
}
export class IndexedDbRepository implements GameRepository {
  private database = openDB<ApexDB>('apex-chess', 1, {
    upgrade(db) {
      db.createObjectStore('games', { keyPath: 'id' });
      db.createObjectStore('preferences');
    },
  });
  async list() {
    return (await (await this.database).getAll('games')).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  }
  async save(game: GameRecord) {
    const db = await this.database;
    const tx = db.transaction('games', 'readwrite');
    const previous = await tx.store.get(game.id);
    // A delayed write must never replace a more recent move history.
    if (!previous || game.revision >= previous.revision) await tx.store.put(structuredClone(game));
    await tx.done;
  }
  async loadSettings() {
    return (await this.database).get('preferences', 'settings');
  }
  async saveSettings(settings: Settings) {
    await (await this.database).put('preferences', structuredClone(settings), 'settings');
  }
}
