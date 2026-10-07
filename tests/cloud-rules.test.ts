import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { newRecord } from '../src/domain/game';

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-apex',
    firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync('firestore.rules', 'utf8') },
  });
});
beforeEach(() => env.clearFirestore());
afterAll(() => env.cleanup());
function data() {
  const game = newRecord({ mode: 'self', level: 3, playerColor: 'w' });
  game.ownerId = 'alice';
  return { id: game.id, ownerId: 'alice', version: 1, game };
}
describe('deployed Firestore authorization', () => {
  it('allows public history reads but only the owner can create, edit or tombstone', async () => {
    const entry = data();
    const alice = doc(env.authenticatedContext('alice').firestore(), 'games', entry.id);
    const bob = doc(env.authenticatedContext('bob').firestore(), 'games', entry.id);
    const guest = doc(env.unauthenticatedContext().firestore(), 'games', entry.id);
    await assertFails(setDoc(guest, entry));
    await assertFails(setDoc(bob, entry));
    await assertSucceeds(setDoc(alice, entry));
    await assertSucceeds(getDoc(guest));
    await assertFails(updateDoc(bob, { version: 2, game: null }));
    await assertFails(updateDoc(alice, { ownerId: 'bob', version: 2 }));
    await assertFails(updateDoc(alice, { version: 1 }));
    await assertFails(deleteDoc(alice));
    await assertSucceeds(updateDoc(alice, { version: 2, game: null }));
    await assertFails(setDoc(alice, { ...entry, version: 3 }));
  });
  it('rejects mismatched ownership and private fields in public documents', async () => {
    const entry = data();
    const ref = doc(env.authenticatedContext('alice').firestore(), 'games', entry.id);
    await assertFails(setDoc(ref, { ...entry, email: 'private@example.com' }));
    await assertFails(setDoc(ref, { ...entry, game: { ...entry.game, ownerId: 'bob' } }));
    await assertFails(setDoc(ref, { ...entry, game: { ...entry.game, revision: 12 } }));
  });
  it('reserves a unique public username atomically, without allowing email fields', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await assertFails(setDoc(doc(alice, 'profiles', 'alice'), { username: 'alice' }));
    const batch = writeBatch(alice);
    batch.set(doc(alice, 'profiles', 'alice'), { username: 'alice' });
    batch.set(doc(alice, 'usernames', 'alice'), { ownerId: 'alice' });
    await assertSucceeds(batch.commit());
    await assertSucceeds(
      getDoc(doc(env.unauthenticatedContext().firestore(), 'profiles', 'alice')),
    );
    await assertFails(
      setDoc(doc(env.authenticatedContext('bob').firestore(), 'usernames', 'alice'), {
        ownerId: 'bob',
      }),
    );
    await assertFails(updateDoc(doc(alice, 'profiles', 'alice'), { email: 'private@example.com' }));
    await assertFails(setDoc(doc(alice, 'usernames', 'extra_name'), { ownerId: 'alice' }));
  });
});
