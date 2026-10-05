import { describe, expect, it, vi } from 'vitest';
import { AppController } from './controller';
import type { ChessEngine, EngineResult, GameRepository, SpeechOutput } from '../ports';
import type { GameRecord } from '../domain/types';

function fixture() {
  const games: GameRecord[] = [];
  const repository: GameRepository = {
    list: async () => games,
    save: async (game) => {
      const i = games.findIndex((g) => g.id === game.id);
      if (i >= 0) games[i] = structuredClone(game);
      else games.push(structuredClone(game));
    },
    loadSettings: async () => undefined,
    saveSettings: async () => {},
  };
  let finish: (result: EngineResult) => void = () => {};
  const engine: ChessEngine = {
    search: vi.fn(
      () =>
        new Promise<EngineResult>((resolve) => {
          finish = resolve;
        }),
    ),
    cancel: vi.fn(),
    dispose: vi.fn(),
  };
  const output: SpeechOutput = { say: vi.fn(), setEnabled: vi.fn(), stop: vi.fn() };
  return {
    controller: new AppController(repository, engine, output),
    engine,
    output,
    games,
    finish: (value: EngineResult) => finish(value),
  };
}
describe('application orchestration', () => {
  it('uses the same disabled-command policy for voice, text, and UI actions', async () => {
    const { controller } = fixture();
    await controller.initialize();
    await controller.setSettings({
      enabledCommands: { ...controller.getSnapshot().settings.enabledCommands, move: false },
    });
    await controller.executeText('apex move pawn e two e four', 'voice');
    await controller.executeText('move pawn e2 e4');
    await controller.execute({ type: 'move', piece: 'p', from: 'e2', to: 'e4' });
    expect(controller.getSnapshot().game.moves).toHaveLength(0);
    expect(controller.getSnapshot().feedback.text).toContain('disabled');
  });
  it('does not execute commands hidden in background conversation', async () => {
    const { controller, output } = fixture();
    await controller.initialize();
    await controller.executeText('I think I will move pawn e2 e4', 'voice');
    expect(controller.getSnapshot().game.moves).toHaveLength(0);
    expect(output.say).not.toHaveBeenCalled();
  });
  it('ignores stale engine results after switching games', async () => {
    const f = fixture();
    await f.controller.initialize();
    await f.controller.startGame({ mode: 'engine', level: 8, playerColor: 'b' });
    expect(f.engine.search).toHaveBeenCalled();
    await f.controller.startGame({ mode: 'self', level: 3, playerColor: 'w' });
    f.finish({ bestMove: 'e2e4', depth: 10 });
    await Promise.resolve();
    await Promise.resolve();
    expect(f.controller.getSnapshot().game.moves).toHaveLength(0);
    expect(f.controller.getSnapshot().game.config.mode).toBe('self');
  });
  it('keeps historical review separate from the live position and saves every move', async () => {
    const { controller, games } = fixture();
    await controller.initialize();
    for (const text of [
      'move pawn e2 e4',
      'move pawn e7 e5',
      'move knight g1 f3',
      'move knight b8 c6',
    ])
      await controller.executeText(text);
    await controller.executeText('review 1');
    expect(controller.getSnapshot().reviewPly).toBe(1);
    await controller.executeText('next 3');
    expect(controller.getSnapshot().reviewPly).toBe(4);
    await controller.executeText('move bishop f1 c4');
    expect(controller.getSnapshot().game.moves).toHaveLength(4);
    controller.returnToPlay();
    await controller.executeText('move bishop f1 c4');
    expect(games[0].moves).toHaveLength(5);
  });
  it('refuses to silently replace an unfinished game from speech', async () => {
    const { controller } = fixture();
    await controller.initialize();
    await controller.executeText('move pawn e2 e4');
    const id = controller.getSnapshot().game.id;
    await controller.executeText('apex new game self', 'voice');
    expect(controller.getSnapshot().game.id).toBe(id);
    expect(controller.getSnapshot().feedback.text).toContain('Finish this game');
  });
});
