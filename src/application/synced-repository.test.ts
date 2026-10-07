import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { AccountStorage } from '../adapters/account-storage';
import { newRecord } from '../domain/game';
import { SyncedRepository } from './synced-repository';
import type { CloudHistory } from '../domain/sync';

describe('offline-first repository', () => {
  it('saves offline without a network write, then uploads the durable outbox', async () => {
    let online = false;
    const write: CloudHistory['write'] = vi.fn(async (change) => ({
      accepted: true,
      current: { ...change, version: change.version + 1 },
    }));
    const local = new AccountStorage('alice', crypto.randomUUID());
    const repo = new SyncedRepository(
      local,
      { watch: () => () => {}, write },
      { loadSettings: async () => undefined, saveSettings: async () => {} },
      () => online,
    );
    await repo.save(newRecord({ mode: 'self', level: 1, playerColor: 'w' }));
    await repo.sync();
    expect(write).not.toHaveBeenCalled();
    expect(repo.getSnapshot()).toMatchObject({ phase: 'offline', pending: 1 });
    online = true;
    await repo.sync();
    expect(write).toHaveBeenCalledTimes(1);
    expect((await local.entries())[0].dirty).toBe(false);
  });
  it('preserves pending games on permission/network failure instead of reporting success', async () => {
    const local = new AccountStorage('alice', crypto.randomUUID());
    const repo = new SyncedRepository(
      local,
      {
        watch: () => () => {},
        write: async () => {
          throw new Error('Permission denied');
        },
      },
      { loadSettings: async () => undefined, saveSettings: async () => {} },
      () => true,
    );
    await local.save(newRecord({ mode: 'self', level: 1, playerColor: 'w' }));
    await repo.sync();
    expect(repo.getSnapshot()).toMatchObject({ phase: 'error', pending: 1 });
    expect(await repo.list()).toHaveLength(1);
    expect((await local.entries())[0].dirty).toBe(true);
  });
});
