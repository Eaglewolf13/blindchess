import { collection, doc, onSnapshot, query, runTransaction, where } from 'firebase/firestore';
import type { CloudGame, CloudHistory, PendingGame } from '../domain/sync';
import { GameSession } from '../domain/game';
import { auth, database } from './firebase';

function decode(data: CloudGame, ownerId: string, id: string): CloudGame {
  if (
    data.ownerId !== ownerId ||
    data.id !== id ||
    !Number.isInteger(data.version) ||
    data.version < 1
  )
    throw new Error('A cloud game has an unsupported format.');
  if (data.game) {
    if (
      data.game.ownerId !== ownerId ||
      data.game.id !== id ||
      !['self', 'engine'].includes(data.game.config.mode)
    )
      throw new Error('A cloud game has an unsupported format.');
    new GameSession(data.game); // Do not accept an arbitrary cloud FEN as a playable position.
  }
  return data;
}
export class FirebaseHistory implements CloudHistory {
  constructor(private ownerId: string) {}
  watch(next: (games: CloudGame[]) => void, error: (error: unknown) => void) {
    return onSnapshot(
      query(collection(database, 'games'), where('ownerId', '==', this.ownerId)),
      { includeMetadataChanges: true },
      (snapshot) => {
        // An empty in-memory cache is not proof that the account has no cloud history.
        if (snapshot.metadata.fromCache) return;
        try {
          next(snapshot.docs.map((d) => decode(d.data() as CloudGame, this.ownerId, d.id)));
        } catch (reason) {
          error(reason);
        }
      },
      error,
    );
  }
  async write(change: PendingGame) {
    if (auth.currentUser?.uid !== this.ownerId || change.ownerId !== this.ownerId)
      throw new Error('Sign in to this account again to upload pending games.');
    return runTransaction(database, async (transaction) => {
      const ref = doc(database, 'games', change.id);
      const saved = await transaction.get(ref);
      const current = saved.exists()
        ? decode(saved.data() as CloudGame, this.ownerId, change.id)
        : null;
      if (current && (current.version !== change.version || current.game === null))
        return { accepted: false, current };
      if (!current && change.version !== 0)
        throw new Error('A cloud game is missing. Its local copy has been kept.');
      const updated: CloudGame = {
        id: change.id,
        ownerId: this.ownerId,
        version: (current?.version ?? 0) + 1,
        game: change.game,
      };
      transaction.set(ref, updated);
      return { accepted: true, current: updated };
    });
  }
}
