import type { Move, Square } from 'chess.js';
import { GameSession, advanceReview, newRecord, reviewPly } from '../domain/game';
import { parseCommand } from '../domain/commands';
import {
  DEFAULT_SETTINGS,
  PIECE_NAMES,
  colorName,
  describeMove,
  spokenSquare,
  type Command,
  type GameConfig,
  type GameRecord,
  type Promotion,
  type Settings,
} from '../domain/types';
import type { ChessEngine, GameRepository, SpeechOutput } from '../ports';
import { evaluationText } from '../adapters/engine';

export interface AppState {
  ready: boolean;
  game: GameRecord;
  games: GameRecord[];
  settings: Settings;
  fen: string;
  legalMoves: Move[];
  reviewPly: number | null;
  busy: 'engine' | 'eval' | null;
  evaluation: string | null;
  feedback: { text: string; kind: 'info' | 'success' | 'error'; id: number };
  storageError: string | null;
  deletingGameId: string | null;
}

export class AppController {
  private session = new GameSession(newRecord({ mode: 'self', level: 3, playerColor: 'w' }));
  private listeners = new Set<() => void>();
  private epoch = 0;
  private state: AppState = {
    ready: false,
    game: structuredClone(this.session.record),
    games: [],
    settings: structuredClone(DEFAULT_SETTINGS),
    fen: this.session.chess.fen(),
    legalMoves: this.session.chess.moves({ verbose: true }),
    reviewPly: null,
    busy: null,
    evaluation: null,
    storageError: null,
    deletingGameId: null,
    feedback: { text: 'Your board is ready. Make the first move.', kind: 'info', id: 0 },
  };
  constructor(
    private repository: GameRepository,
    private engine: ChessEngine,
    private output: SpeechOutput,
  ) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(patch: Partial<AppState> = {}) {
    this.state = { ...this.state, ...patch, game: structuredClone(this.session.record) };
    const position = this.position();
    this.state.fen = position.fen();
    this.state.legalMoves = this.session.chess.moves({ verbose: true });
    this.listeners.forEach((listener) => listener());
  }
  private position() {
    return this.state.reviewPly === null
      ? this.session.chess
      : this.session.positionAt(this.state.reviewPly);
  }
  private message(text: string, kind: AppState['feedback']['kind'] = 'info', speak = true) {
    this.update({ feedback: { text, kind, id: this.state.feedback.id + 1 } });
    if (speak) this.output.say(kind === 'error' ? `Error: ${text}` : text);
  }
  reportError(error: unknown) {
    this.message(
      error instanceof Error && error.message
        ? error.message
        : 'Something went wrong. Please try again.',
      'error',
    );
  }
  async initialize() {
    try {
      const [games, settings] = await Promise.all([
        this.repository.list(),
        this.repository.loadSettings(),
      ]);
      if (games[0] && !games[0].result) this.session = new GameSession(games[0]);
      const restored = {
        ...DEFAULT_SETTINGS,
        ...settings,
        enabledCommands: { ...DEFAULT_SETTINGS.enabledCommands, ...settings?.enabledCommands },
      };
      this.output.setEnabled(restored.sound);
      this.update({ ready: true, games, settings: restored });
      void this.maybeEngineMove();
    } catch {
      this.update({
        ready: true,
        storageError:
          'Local storage is unavailable. You can play, but export your PGN before leaving.',
      });
    }
  }
  private async save() {
    const record = structuredClone(this.session.record);
    this.update({ games: [record, ...this.state.games.filter((game) => game.id !== record.id)] });
    try {
      await this.repository.save(record);
    } catch {
      this.update({
        storageError:
          'This game could not be saved. Export its PGN before leaving, and check your browser storage.',
      });
    }
  }
  async setSettings(patch: Partial<Settings>) {
    const settings = { ...this.state.settings, ...patch };
    this.output.setEnabled(settings.sound);
    this.update({ settings });
    try {
      await this.repository.saveSettings(settings);
    } catch {
      this.update({ storageError: 'Settings could not be saved in this browser.' });
    }
  }
  async startGame(config: GameConfig) {
    if (!this.state.settings.enabledCommands.newGame) {
      this.message('New game is disabled in practice settings.', 'error');
      return;
    }
    ++this.epoch;
    this.engine.cancel();
    this.output.stop();
    this.session = new GameSession(newRecord(config));
    this.update({ reviewPly: null, busy: null, evaluation: null });
    this.message(
      config.mode === 'self'
        ? 'New self-play game. White to move.'
        : `New engine game, level ${config.level}. You are ${colorName(config.playerColor)}.`,
    );
    await this.save();
    void this.maybeEngineMove();
  }
  openGame(record: GameRecord) {
    if (!this.state.settings.enabledCommands.review) {
      this.message('Review is disabled in practice settings.', 'error');
      return;
    }
    try {
      const session = new GameSession(record);
      ++this.epoch;
      this.engine.cancel();
      this.output.stop();
      this.session = session;
      this.update({ reviewPly: record.moves.length, busy: null, evaluation: null });
      this.message(record.resultText ?? 'Saved game opened. Review the moves or return to play.');
    } catch {
      this.message('This saved game could not be opened.', 'error');
    }
  }
  returnToPlay() {
    if (!this.state.settings.enabledCommands.returnToPlay) {
      this.message('Return to play is disabled in practice settings.', 'error');
      return;
    }
    this.update({ reviewPly: null, evaluation: null });
    this.message(
      this.session.record.resultText ?? `${colorName(this.session.chess.turn())} to move.`,
    );
    void this.maybeEngineMove();
  }
  async deleteGame(id: string): Promise<boolean> {
    if (this.state.deletingGameId) return false;
    this.update({ deletingGameId: id });
    if (this.session.record.id === id) {
      ++this.epoch;
      this.engine.cancel();
      this.output.stop();
      this.update({ busy: null });
    }
    try {
      await this.repository.delete(id);
      if (this.session.record.id === id) {
        this.session = new GameSession(newRecord({ mode: 'self', level: 3, playerColor: 'w' }));
        this.update({ reviewPly: null, evaluation: null });
      }
      this.update({ games: this.state.games.filter((game) => game.id !== id) });
      this.message('Game deleted from this device.');
      return true;
    } catch {
      this.message('This game could not be deleted. Please try again.', 'error');
      return false;
    } finally {
      this.update({ deletingGameId: null });
      void this.maybeEngineMove();
    }
  }
  seek(ply: number) {
    if (!this.state.settings.enabledCommands.review) {
      this.message('Review is disabled in practice settings.', 'error');
      return;
    }
    if (ply < 0 || ply > this.session.record.moves.length) return;
    this.update({ reviewPly: ply, evaluation: null });
    this.announceReview();
  }
  private announceReview() {
    const ply = this.state.reviewPly;
    const move = ply ? this.session.record.moves[ply - 1] : undefined;
    this.message(
      move
        ? `Move ${Math.ceil(ply! / 2)}. ${colorName(move.color)} ${describeMove(move)}.`
        : 'Starting position. White to move.',
    );
  }
  async executeText(text: string, source: 'voice' | 'text' = 'text') {
    const command = parseCommand(text, source === 'voice' && this.state.settings.requireWakeWord);
    if (!command) {
      if (source === 'text' || /^apex\b/i.test(text.trim()))
        this.message('Command not recognized. Try “apex move pawn e two e four”.', 'error');
      return /^apex\b/i.test(text.trim()) || source === 'text'
        ? 'Not executed: the words did not match a complete command.'
        : 'Ignored: no complete command with the required wake word.';
    }
    return this.execute(command);
  }
  async execute(command: Command) {
    if (!this.state.settings.enabledCommands[command.type]) {
      this.message('That command is disabled in practice settings.', 'error');
      return 'Not executed: command disabled in Settings.';
    }
    try {
      switch (command.type) {
        case 'move': {
          if (this.state.deletingGameId === this.session.record.id)
            throw new Error('This game is being deleted. Please wait.');
          if (this.state.reviewPly !== null)
            throw new Error('You are reviewing. Return to play before making a move.');
          if (this.state.busy) throw new Error('Stockfish is thinking. Please wait a moment.');
          const { config } = this.session.record;
          if (config.mode === 'engine' && this.session.chess.turn() !== config.playerColor)
            throw new Error('It is the engine’s turn.');
          this.session.play(command);
          this.update({ evaluation: null });
          this.message(
            this.session.record.resultText
              ? `Move made. ${this.session.record.resultText}`
              : `Move made.${this.session.chess.isCheck() ? ' Check.' : ''}`,
            'success',
          );
          await this.save();
          void this.maybeEngineMove();
          break;
        }
        case 'returnToPlay':
          this.returnToPlay();
          break;
        case 'lastMove': {
          const move = this.session.record.moves.at(-1);
          const turn =
            this.session.record.resultText ?? `${colorName(this.session.chess.turn())} to move.`;
          this.message(
            `${move ? `${colorName(move.color)} played ${describeMove(move)}.` : 'No moves have been played.'} ${turn}${this.state.reviewPly !== null ? ' You are in review mode.' : ''}`,
          );
          break;
        }
        case 'vision': {
          const piece = this.position().get(command.square);
          this.message(
            piece
              ? `${colorName(piece.color)} ${PIECE_NAMES[piece.type]} on ${spokenSquare(command.square)}.`
              : `${spokenSquare(command.square)} is empty.`,
          );
          break;
        }
        case 'review':
          this.update({
            reviewPly: reviewPly(command.move, this.session.record.moves.length),
            evaluation: null,
          });
          this.announceReview();
          break;
        case 'next':
          if (this.state.reviewPly === null)
            throw new Error('Start a review first. Say “apex review”.');
          this.update({
            reviewPly: advanceReview(
              this.state.reviewPly,
              command.count,
              this.session.record.moves.length,
            ),
            evaluation: null,
          });
          this.announceReview();
          break;
        case 'eval': {
          if (this.state.busy) throw new Error('Stockfish is thinking. Please wait a moment.');
          const position = this.position();
          if (position.isGameOver()) {
            this.message('This position has already reached a game result.');
            break;
          }
          const epoch = this.epoch;
          const fen = position.fen();
          this.update({ busy: 'eval' });
          try {
            const result = await this.engine.search(fen, { level: 8, evaluation: true });
            if (epoch !== this.epoch || fen !== this.position().fen()) break;
            const text = evaluationText(result, position.turn());
            this.update({ evaluation: text });
            this.message(text);
          } catch (error) {
            if (epoch === this.epoch) this.reportError(error);
          } finally {
            if (epoch === this.epoch) this.update({ busy: null });
          }
          break;
        }
        case 'newGame':
          if (!this.session.record.result && this.session.record.moves.length)
            throw new Error(
              'Finish this game first, or use the New game button to save it and start another.',
            );
          await this.startGame({
            mode: command.mode,
            level: command.level,
            playerColor: this.session.record.config.playerColor,
          });
          break;
      }
      return `Handled: ${command.type}.`;
    } catch (error) {
      this.reportError(error);
      return `Not executed: ${error instanceof Error ? error.message : 'Command failed.'}`;
    }
  }
  async maybeEngineMove() {
    const { config } = this.session.record;
    if (
      config.mode !== 'engine' ||
      this.session.record.result ||
      this.session.chess.turn() === config.playerColor ||
      this.state.busy ||
      this.state.reviewPly !== null ||
      this.state.deletingGameId === this.session.record.id
    )
      return;
    const epoch = this.epoch;
    this.update({ busy: 'engine' });
    try {
      const result = await this.engine.search(this.session.chess.fen(), {
        level: config.level,
        evaluation: false,
        moves: this.session.record.moves.map(
          (move) => move.from + move.to + (move.promotion ?? ''),
        ),
      });
      if (epoch !== this.epoch) return;
      let move = result.bestMove;
      // Beginner levels deliberately make occasional legal mistakes. No Elo claim.
      const random = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
      if ((config.level === 1 && random < 0.55) || (config.level === 2 && random < 0.2)) {
        const options = this.session.chess.moves({ verbose: true });
        const pick = options[crypto.getRandomValues(new Uint32Array(1))[0] % options.length];
        if (pick) move = pick.from + pick.to + (pick.promotion ?? '');
      }
      if (!move) throw new Error('Stockfish did not return a move. Try the Retry engine button.');
      const from = move.slice(0, 2) as Square,
        to = move.slice(2, 4) as Square;
      const piece = this.session.chess.get(from);
      if (!piece) throw new Error('Stockfish returned an invalid move. Please retry.');
      const saved = this.session.play({
        type: 'move',
        piece: piece.type,
        from,
        to,
        promotion: move[4] as Promotion | undefined,
      });
      this.update({ evaluation: null });
      this.message(
        `${colorName(saved.color)} ${describeMove(saved)}.${this.session.record.resultText ? ' ' + this.session.record.resultText : this.session.chess.isCheck() ? ' Check.' : ''}`,
        'success',
      );
      await this.save();
    } catch (error) {
      if (epoch === this.epoch) this.reportError(error);
    } finally {
      if (epoch === this.epoch) this.update({ busy: null });
    }
  }
  pgn(record?: GameRecord) {
    return record ? new GameSession(record).pgn() : this.session.pgn();
  }
}
