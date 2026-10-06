import { openDB, type DBSchema } from 'idb';
import type { GameRepository } from '../ports';
import type { GameRecord, Settings } from '../domain/types';

interface ApexDB extends DBSchema {
  games: { key: string; value: GameRecord };
  preferences: { key: string; value: Settings };
  deletedGames: { key: string; value: boolean };
}
export class IndexedDbRepository implements GameRepository {
  private database = openDB<ApexDB>('apex-chess', 2, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('games', { keyPath: 'id' });
        db.createObjectStore('preferences');
      }
      db.createObjectStore('deletedGames');
    },
  });
  async list() {
    return (await (await this.database).getAll('games')).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  }
  async save(game: GameRecord) {
    const db = await this.database;
    const tx = db.transaction(['games', 'deletedGames'], 'readwrite');
    if (await tx.objectStore('deletedGames').get(game.id)) {
      await tx.done;
      return;
    }
    const store = tx.objectStore('games');
    const previous = await store.get(game.id);
    // A delayed write must never replace a more recent move history.
    if (!previous || game.revision >= previous.revision) await store.put(structuredClone(game));
    await tx.done;
  }
  async delete(id: string) {
    const tx = (await this.database).transaction(['games', 'deletedGames'], 'readwrite');
    // A delayed save, including one from another tab, cannot resurrect a deleted game.
    await tx.objectStore('deletedGames').put(true, id);
    await tx.objectStore('games').delete(id);
    await tx.done;
  }
  async loadSettings() {
    return (await this.database).get('preferences', 'settings');
  }
  async saveSettings(settings: Settings) {
    await (await this.database).put('preferences', structuredClone(settings), 'settings');
  }
}
