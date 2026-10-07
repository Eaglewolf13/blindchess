import { openDB, type DBSchema } from 'idb';
import type { GameRecord } from '../domain/types';
import { isContinuation, type CloudGame, type PendingGame } from '../domain/sync';

interface AccountDB extends DBSchema {
  games: { key: [string, string]; value: PendingGame; indexes: { owner: string } };
}
/** Account-scoped cache and durable outbox. Never contains guest games or passwords. */
export class AccountStorage {
  private db;
  constructor(
    readonly ownerId: string,
    databaseName = 'apex-accounts-v1',
  ) {
    this.db = openDB<AccountDB>(databaseName, 1, {
      upgrade(db) {
        db.createObjectStore('games', { keyPath: ['ownerId', 'id'] }).createIndex(
          'owner',
          'ownerId',
        );
      },
    });
  }
  async entries() {
    return (await this.db).getAllFromIndex('games', 'owner', this.ownerId);
  }
  async save(game: GameRecord) {
    if (game.ownerId && game.ownerId !== this.ownerId) throw new Error('Wrong game owner.');
    const tx = (await this.db).transaction('games', 'readwrite');
    const previous = await tx.store.get([this.ownerId, game.id]);
    if (previous && !previous.game) {
      await tx.done;
      return;
    }
    // A stale tab must not overwrite a longer history, or another device's branch.
    if (previous?.game && !isContinuation(previous.game, game)) {
      if (!isContinuation(game, previous.game)) {
        const id = crypto.randomUUID();
        await tx.store.put(this.pending({ ...game, id, ownerId: this.ownerId }, 0));
      }
      await tx.done;
      return;
    }
    await tx.store.put(this.pending({ ...game, ownerId: this.ownerId }, previous?.version ?? 0));
    await tx.done;
  }
  private pending(game: GameRecord, version: number): PendingGame {
    return {
      id: game.id,
      ownerId: this.ownerId,
      version,
      game: structuredClone(game),
      dirty: true,
      changeId: crypto.randomUUID(),
    };
  }
  async delete(id: string) {
    const tx = (await this.db).transaction('games', 'readwrite');
    const previous = await tx.store.get([this.ownerId, id]);
    await tx.store.put({
      id,
      ownerId: this.ownerId,
      version: previous?.version ?? 0,
      game: null,
      dirty: true,
      changeId: crypto.randomUUID(),
    });
    await tx.done;
  }
  async receive(games: CloudGame[]) {
    const tx = (await this.db).transaction('games', 'readwrite');
    for (const game of games) {
      if (game.ownerId !== this.ownerId) throw new Error('Wrong cloud owner.');
      const local = await tx.store.get([this.ownerId, game.id]);
      if (!local || (!local.dirty && game.version > local.version))
        await tx.store.put({ ...game, dirty: false, changeId: crypto.randomUUID() });
    }
    await tx.done;
  }
  async acknowledge(sent: PendingGame, remote: CloudGame, accepted: boolean): Promise<boolean> {
    if (remote.ownerId !== this.ownerId || remote.id !== sent.id)
      throw new Error('Wrong cloud owner.');
    const tx = (await this.db).transaction('games', 'readwrite');
    const local = await tx.store.get([this.ownerId, sent.id]);
    let conflict = false;
    if (local?.dirty && local.changeId === sent.changeId) {
      if (accepted || !remote.game) {
        await tx.store.put({ ...remote, dirty: false, changeId: crypto.randomUUID() });
      } else if (!local.game || isContinuation(remote.game, local.game)) {
        // Deletion wins; a longer compatible local history can be retried against this version.
        await tx.store.put({ ...local, version: remote.version, changeId: crypto.randomUUID() });
      } else {
        if (!isContinuation(local.game, remote.game)) {
          const id = crypto.randomUUID();
          await tx.store.put(this.pending({ ...local.game, id }, 0));
          conflict = true;
        }
        await tx.store.put({ ...remote, dirty: false, changeId: crypto.randomUUID() });
      }
    } else if (local?.dirty && accepted && local.version === sent.version) {
      // A move arrived during upload. Advance its base, without clearing the new pending move.
      await tx.store.put({ ...local, version: remote.version });
    }
    await tx.done;
    return conflict;
  }
  async close() {
    (await this.db).close();
  }
}
