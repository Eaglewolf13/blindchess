import type { GameRepository } from '../ports';
import type { GameRecord } from '../domain/types';
import { IndexedDbRepository } from './storage';

/** Guest history survives a reload of this tab, but is never assigned to an account. */
export class GuestRepository implements GameRepository {
  private preferences = new IndexedDbRepository();
  private games: GameRecord[];
  private deleted = new Set<string>();
  constructor(private storage: Storage = sessionStorage) {
    try {
      this.games = JSON.parse(storage.getItem('apex-guest-games') ?? '[]');
    } catch {
      this.games = [];
    }
  }
  async list() {
    return structuredClone(this.games).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async save(game: GameRecord) {
    if (game.ownerId) throw new Error('Account games cannot be saved as guest games.');
    if (this.deleted.has(game.id)) return;
    const previous = this.games.find((g) => g.id === game.id);
    if (previous && previous.revision > game.revision) return;
    this.games = [structuredClone(game), ...this.games.filter((g) => g.id !== game.id)];
    this.storage.setItem('apex-guest-games', JSON.stringify(this.games));
  }
  async delete(id: string) {
    this.deleted.add(id);
    this.games = this.games.filter((g) => g.id !== id);
    this.storage.setItem('apex-guest-games', JSON.stringify(this.games));
  }
  loadSettings = () => this.preferences.loadSettings();
  saveSettings: GameRepository['saveSettings'] = (settings) =>
    this.preferences.saveSettings(settings);
}
