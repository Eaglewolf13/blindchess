import { describe, expect, it, vi } from 'vitest';
import { AppController } from './controller';
import type { ChessEngine, EngineResult, GameRepository, SpeechOutput } from '../ports';
import { DEFAULT_SETTINGS, type GameRecord } from '../domain/types';

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
    delete: async (id) => {
      const i = games.findIndex((game) => game.id === id);
      if (i >= 0) games.splice(i, 1);
    },
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
  const output: SpeechOutput = {
    say: vi.fn(),
    configure: vi.fn(),
    setEnabled: vi.fn(),
    stop: vi.fn(),
  };
  return {
    controller: new AppController(repository, engine, output),
    engine,
    output,
    games,
    repository,
    finish: (value: EngineResult) => finish(value),
  };
}
describe('application orchestration', () => {
  it('resumes a saved game by voice and repeats the latest live move during review', async () => {
    const { controller, output } = fixture();
    await controller.initialize();
    await controller.executeText('move pawn a2 a3');
    await controller.executeText('move pawn e7 e5');
    controller.openGame(controller.getSnapshot().game);
    await controller.executeText('apex review one', 'voice');
    await controller.executeText('apex last move', 'voice');
    expect(output.say).toHaveBeenLastCalledWith(
      'Black played pawn e 7 to e 5. White to move. You are in review mode.',
    );
    expect(controller.getSnapshot().reviewPly).toBe(1);
    await controller.executeText('apex resume game', 'voice');
    expect(controller.getSnapshot().reviewPly).toBeNull();
    await controller.executeText('apex move pawn a three a four', 'voice');
    expect(controller.getSnapshot().game.moves).toHaveLength(3);
  });
  it('reports last move for an empty and a completed game', async () => {
    const { controller, output } = fixture();
    await controller.initialize();
    await controller.executeText('apex last move', 'voice');
    expect(output.say).toHaveBeenLastCalledWith('No moves have been played. White to move.');
    for (const text of [
      'move pawn f2 f3',
      'move pawn e7 e5',
      'move pawn g2 g4',
      'move queen d8 h4',
    ])
      await controller.executeText(text);
    await controller.executeText('apex last move', 'voice');
    expect(output.say).toHaveBeenLastCalledWith(
      expect.stringMatching(/^Black played queen d 8 to h 4\. Black wins by checkmate/),
    );
  });
  it('deletes the active game, keeps other games, and ignores its late engine result', async () => {
    const f = fixture();
    await f.controller.initialize();
    await f.controller.executeText('move pawn d2 d4');
    const first = f.controller.getSnapshot().game.id;
    await f.controller.startGame({ mode: 'engine', level: 8, playerColor: 'w' });
    await f.controller.executeText('move pawn e2 e4');
    const deleted = f.controller.getSnapshot().game.id;
    expect(await f.controller.deleteGame(deleted)).toBe(true);
    f.finish({ bestMove: 'e7e5', depth: 10 });
    await Promise.resolve();
    await Promise.resolve();
    expect(f.controller.getSnapshot().games.map((game) => game.id)).toEqual([first]);
    expect(f.controller.getSnapshot().game.moves).toHaveLength(0);
    expect(f.games.map((game) => game.id)).toEqual([first]);
  });
  it('keeps a game when storage rejects deletion', async () => {
    const f = fixture();
    await f.controller.initialize();
    await f.controller.executeText('move pawn e2 e4');
    f.repository.delete = async () => {
      throw new Error('disk');
    };
    expect(await f.controller.deleteGame(f.controller.getSnapshot().game.id)).toBe(false);
    expect(f.controller.getSnapshot().game.moves).toHaveLength(1);
    expect(f.controller.getSnapshot().games).toHaveLength(1);
  });
  it('migrates earlier saved settings to include the new commands and voice defaults', async () => {
    const f = fixture();
    f.repository.loadSettings = async () =>
      ({
        sound: false,
        requireWakeWord: true,
        showBoard: false,
        enabledCommands: {
          move: true,
          vision: true,
          review: true,
          next: true,
          eval: false,
          newGame: true,
        },
      }) as Awaited<ReturnType<GameRepository['loadSettings']>>;
    await f.controller.initialize();
    expect(f.controller.getSnapshot().settings.speechRecognizer).toBe('vosk');
    expect(f.controller.getSnapshot().settings.enabledCommands.lastMove).toBe(true);
    expect(f.controller.getSnapshot().settings.enabledCommands.eval).toBe(false);
    expect(f.controller.getSnapshot().settings.speechPronunciation).toBe('letters');
    expect(f.output.configure).toHaveBeenLastCalledWith(
      expect.objectContaining({
        speechPronunciation: 'letters',
        speechGapMs: 0,
        speechBeforeSquareMs: 100,
      }),
    );
  });
  it('retires saved phonetic settings without losing the voice, gaps, or other preferences', async () => {
    const f = fixture();
    f.repository.loadSettings = async () =>
      ({
        ...DEFAULT_SETTINGS,
        speechPronunciation: 'phonetic',
        speechBeforeSquareMs: undefined,
        speechGapMs: 160,
        speechVoice: 'installed',
        voiceConfidence: 0.35,
        sound: false,
      }) as unknown as Awaited<ReturnType<GameRepository['loadSettings']>>;
    await f.controller.initialize();
    expect(f.controller.getSnapshot().settings).toMatchObject({
      speechPronunciation: 'letters',
      speechBeforeSquareMs: 100,
      speechGapMs: 160,
      speechVoice: 'installed',
      voiceConfidence: 0.35,
      sound: false,
    });
    expect(f.output.configure).toHaveBeenLastCalledWith(f.controller.getSnapshot().settings);
  });
  it('applies and saves pronunciation preferences and previews without changing the game', async () => {
    const f = fixture();
    f.repository.saveSettings = vi.fn();
    await f.controller.initialize();
    const game = f.controller.getSnapshot().game;
    await f.controller.setSettings({
      speechPronunciation: 'letters-spaced',
      speechBeforeSquareMs: 120,
      speechGapMs: 0,
      speechVoice: 'installed',
    });
    expect(f.output.configure).toHaveBeenLastCalledWith(
      expect.objectContaining({
        speechPronunciation: 'letters-spaced',
        speechBeforeSquareMs: 120,
        speechGapMs: 0,
        speechVoice: 'installed',
      }),
    );
    expect(f.repository.saveSettings).toHaveBeenCalledWith(f.controller.getSnapshot().settings);
    f.controller.previewSpeech();
    expect(f.output.say).toHaveBeenLastCalledWith(
      expect.stringContaining('Black played bishop e 3 to f 2.'),
    );
    expect(f.controller.getSnapshot().game).toEqual(game);
    f.controller.stopSpeechPreview();
    expect(f.output.stop).toHaveBeenCalled();
  });
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
