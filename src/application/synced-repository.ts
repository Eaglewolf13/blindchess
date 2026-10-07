import type { GameRepository } from '../ports';
import type { GameRecord } from '../domain/types';
import type { CloudGame, CloudHistory, SyncStatus } from '../domain/sync';
import { AccountStorage } from '../adapters/account-storage';

/** Local commits finish before network work. Network failures never prevent a chess move. */
export class SyncedRepository implements GameRepository {
  private listeners = new Set<() => void>();
  private gameListeners = new Set<() => void>();
  private status: SyncStatus = { phase: 'connecting', pending: 0, message: null };
  private stopped = false;
  private running: Promise<void> | null = null;
  private again = false;
  private unwatch?: () => void;
  private timer?: ReturnType<typeof setInterval>;
  private cloudReady = false;
  private conflictNotice: string | null = null;
  get ownerId() {
    return this.local.ownerId;
  }
  constructor(
    readonly local: AccountStorage,
    private cloud: CloudHistory,
    private preferences: Pick<GameRepository, 'loadSettings' | 'saveSettings'>,
    private online = () => navigator.onLine,
  ) {}
  getSnapshot = () => this.status;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  onGamesChanged = (fn: () => void) => {
    this.gameListeners.add(fn);
    return () => {
      this.gameListeners.delete(fn);
    };
  };
  private changed() {
    if (!this.stopped) this.gameListeners.forEach((fn) => fn());
  }
  private update(patch: Partial<SyncStatus>) {
    if (!this.stopped) {
      this.status = { ...this.status, ...patch };
      this.listeners.forEach((fn) => fn());
    }
  }
  async list() {
    return (await this.local.entries())
      .flatMap((e) => (e.game ? [e.game] : []))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async save(game: GameRecord) {
    await this.local.save(game);
    this.changed();
    void this.sync();
  }
  async delete(id: string) {
    await this.local.delete(id);
    void this.sync();
  }
  loadSettings = () => this.preferences.loadSettings();
  saveSettings: GameRepository['saveSettings'] = (settings) =>
    this.preferences.saveSettings(settings);
  start() {
    this.unwatch = this.cloud.watch(this.received, this.failed);
    window.addEventListener('online', this.reconnect);
    window.addEventListener('offline', this.connection);
    window.addEventListener('focus', this.connection);
    // Retry pending uploads after a transient network failure, without rereading the whole library.
    this.timer = setInterval(this.connection, 30000);
    void this.sync();
  }
  reconnect = () => {
    this.cloudReady = false;
    this.update({ phase: 'connecting', message: null });
    this.unwatch?.();
    this.unwatch = this.cloud.watch(this.received, this.failed);
    void this.sync();
  };
  private received = (games: CloudGame[]) => {
    if (this.stopped) return;
    void this.local
      .receive(games)
      .then(() => {
        this.cloudReady = true;
        if (this.status.phase === 'error')
          this.update({ phase: 'connecting', message: this.conflictNotice });
        this.changed();
        void this.sync();
      })
      .catch(this.failed);
  };
  private connection = () => {
    void this.sync();
  };
  private failed = (error: unknown) =>
    this.update({
      phase: this.online() ? 'error' : 'offline',
      message: this.online()
        ? `Games are saved on this device, but cloud sync failed. ${error instanceof Error ? error.message : 'Try syncing again.'}`
        : null,
    });
  sync = (): Promise<void> => {
    if (this.stopped) return Promise.resolve();
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.flush()
      .catch(this.failed)
      .finally(() => {
        this.running = null;
        if (this.again && !this.stopped) {
          this.again = false;
          void this.sync();
        }
      });
    return this.running;
  };
  private async flush() {
    const dirty = (await this.local.entries()).filter((e) => e.dirty);
    this.update({ pending: dirty.length });
    if (!this.online()) {
      this.cloudReady = false;
      this.update({ phase: 'offline' });
      return;
    }
    if (!dirty.length) {
      if (this.status.phase !== 'error')
        this.update({ phase: this.cloudReady ? 'synced' : 'connecting' });
      return;
    }
    this.update({ phase: 'syncing', message: this.conflictNotice });
    for (const entry of dirty) {
      if (this.stopped) return;
      const result = await this.cloud.write(entry);
      const conflict = await this.local.acknowledge(entry, result.current, result.accepted);
      if (conflict) {
        this.conflictNotice =
          'This game changed differently on two devices. Both versions were kept as separate games in My games.';
        this.update({ message: this.conflictNotice });
      }
      if (!result.accepted) this.again = true;
      this.changed();
    }
    const pending = (await this.local.entries()).filter((e) => e.dirty).length;
    this.update({
      pending,
      phase: pending ? 'syncing' : this.cloudReady ? 'synced' : 'connecting',
    });
    if (pending) this.again = true;
  }
  stop() {
    this.stopped = true;
    this.unwatch?.();
    clearInterval(this.timer);
    window.removeEventListener('online', this.reconnect);
    window.removeEventListener('offline', this.connection);
    window.removeEventListener('focus', this.connection);
    this.listeners.clear();
    this.gameListeners.clear();
  }
}
