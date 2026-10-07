import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { AccountStorage } from './account-storage';
import { GameSession, newRecord } from '../domain/game';
import type { CloudGame } from '../domain/sync';

function game(ownerId = 'alice') {
  const session = new GameSession(newRecord({ mode: 'self', level: 3, playerColor: 'w' }));
  session.record.ownerId = ownerId;
  session.play({ type: 'move', piece: 'p', from: 'e2', to: 'e4' });
  return session;
}
function fixture() {
  const name = crypto.randomUUID();
  return { name, store: new AccountStorage('alice', name) };
}

describe('durable account cache and conflict handling', () => {
  it('isolates accounts and restores the offline outbox after reopening', async () => {
    const { store, name } = fixture();
    const session = game();
    await store.save(session.record);
    await store.close();
    const reopened = new AccountStorage('alice', name);
    expect((await reopened.entries())[0]).toMatchObject({ dirty: true, game: session.record });
    expect(await new AccountStorage('bob', name).entries()).toEqual([]);
    await expect(new AccountStorage('bob', name).save(session.record)).rejects.toThrow('owner');
  });
  it('does not mark a move made during upload as synced', async () => {
    const { store } = fixture();
    const session = game();
    await store.save(session.record);
    const sent = (await store.entries())[0];
    session.play({ type: 'move', piece: 'p', from: 'e7', to: 'e5' });
    await store.save(session.record);
    await store.acknowledge(sent, { ...sent, version: 1 }, true);
    expect((await store.entries())[0]).toMatchObject({
      dirty: true,
      version: 1,
      game: { revision: 2 },
    });
  });
  it('preserves a divergent offline branch instead of overwriting another device', async () => {
    const { store } = fixture();
    const local = game();
    const other = new GameSession(local.record);
    other.play({ type: 'move', piece: 'p', from: 'd7', to: 'd5' });
    local.play({ type: 'move', piece: 'p', from: 'e7', to: 'e5' });
    await store.save(local.record);
    const sent = (await store.entries())[0];
    const remote: CloudGame = {
      id: local.record.id,
      ownerId: 'alice',
      version: 2,
      game: other.record,
    };
    expect(await store.acknowledge(sent, remote, false)).toBe(true);
    const entries = await store.entries();
    expect(entries).toHaveLength(2);
    expect(entries.find((e) => e.id === local.record.id)).toMatchObject({
      dirty: false,
      game: other.record,
    });
    expect(entries.find((e) => e.id !== local.record.id)).toMatchObject({
      dirty: true,
      version: 0,
      game: { moves: local.record.moves },
    });
  });
  it('retries compatible continuations against the newer server version', async () => {
    const { store } = fixture();
    const session = game();
    const remote: CloudGame = {
      id: session.record.id,
      ownerId: 'alice',
      version: 1,
      game: structuredClone(session.record),
    };
    session.play({ type: 'move', piece: 'p', from: 'e7', to: 'e5' });
    await store.save(session.record);
    const sent = (await store.entries())[0];
    expect(await store.acknowledge(sent, remote, false)).toBe(false);
    expect((await store.entries())[0]).toMatchObject({
      dirty: true,
      version: 1,
      game: { revision: 2 },
    });
  });
  it('a remote deletion prevents a stale offline save from resurrecting the game', async () => {
    const { store } = fixture();
    const session = game();
    await store.save(session.record);
    const sent = (await store.entries())[0];
    await store.acknowledge(sent, { id: sent.id, ownerId: 'alice', version: 3, game: null }, false);
    await store.save(session.record);
    expect((await store.entries())[0]).toMatchObject({ game: null, dirty: false, version: 3 });
  });
  it('a pending deletion survives an incoming cloud snapshot and an in-flight upload', async () => {
    const { store } = fixture();
    const session = game();
    await store.save(session.record);
    const sent = (await store.entries())[0];
    await store.delete(sent.id);
    await store.receive([{ ...sent, version: 1 }]);
    await store.acknowledge(sent, { ...sent, version: 1 }, true);
    expect((await store.entries())[0]).toMatchObject({ dirty: true, game: null, version: 1 });
    await store.save(session.record);
    expect((await store.entries())[0].game).toBeNull();
  });
  it('keeps newer dirty data when cloud snapshots arrive late', async () => {
    const { store } = fixture();
    const session = game();
    await store.save(session.record);
    const cloud = { ...(await store.entries())[0], version: 1 };
    session.play({ type: 'move', piece: 'p', from: 'e7', to: 'e5' });
    await store.save(session.record);
    await store.receive([cloud]);
    expect((await store.entries())[0].game?.revision).toBe(2);
  });
});
