import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  EyeOff,
  Flag,
  LoaderCircle,
  Mic,
  RotateCcw,
  ScanEye,
  Sparkles,
} from 'lucide-react';
import type { PieceSymbol, Square } from 'chess.js';
import type { AppController, AppState } from '../application/controller';
import { PIECE_NAMES, colorName, type Promotion } from '../domain/types';
import { Board } from './Board';

export function Play({
  state,
  controller,
  micOn,
  micBusy,
  micStatus,
  onMic,
  onCommands,
}: {
  state: AppState;
  controller: AppController;
  micOn: boolean;
  micBusy: boolean;
  micStatus: string;
  onMic: () => void;
  onCommands: () => void;
}) {
  const { game, settings } = state;
  const [text, setText] = useState('');
  const [inspectSquare, setInspectSquare] = useState<Square>('e4');
  const [startMove, setStartMove] = useState(1);
  const [step, setStep] = useState(1);
  const reviewing = state.reviewPly !== null;
  const ply = state.reviewPly ?? game.moves.length;
  const last = game.moves[ply - 1];
  const turn = state.fen.split(' ')[1] as 'w' | 'b';
  const isEngineTurn =
    game.config.mode === 'engine' && turn !== game.config.playerColor && !game.result && !reviewing;
  const submitText = (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    void controller.executeText(text);
    setText('');
  };
  return (
    <>
      <div className="play-layout">
        <section className="game-column" aria-label="Chess practice">
          <div className="board-card">
            <div className="board-toolbar">
              <div className="player-label">
                <span className={`player-dot ${turn === 'b' ? 'black-dot' : ''}`} />
                <div>
                  <strong>{game.result ? 'Game complete' : `${colorName(turn)} to move`}</strong>
                  <span>
                    {reviewing
                      ? 'Reviewing your game'
                      : game.config.mode === 'self'
                        ? 'Self play · both sides are yours'
                        : `Stockfish · level ${game.config.level}`}
                  </span>
                </div>
              </div>
              <span className="move-counter">Move {Math.ceil((ply + 1) / 2)}</span>
            </div>
            <Board
              fen={state.fen}
              hidden={!reviewing && !settings.showBoard}
              lastMove={last}
              flipped={game.config.mode === 'engine' && game.config.playerColor === 'b'}
            />
            <div className="board-footer">
              <span>
                <i className="status-dot" />
                {reviewing
                  ? 'Review mode'
                  : state.busy === 'engine'
                    ? 'Stockfish is thinking…'
                    : game.result
                      ? game.resultText
                      : 'No clock. Just concentration.'}
              </span>
              {!reviewing && (
                <button
                  className="text-button"
                  onClick={() => void controller.setSettings({ showBoard: !settings.showBoard })}
                >
                  {settings.showBoard ? <EyeOff size={15} /> : <Eye size={15} />}
                  {settings.showBoard ? 'Hide board' : 'Reveal board'}
                </button>
              )}
            </div>
          </div>

          {reviewing ? (
            <section className="card review-card">
              <div className="section-heading">
                <h2>Walk through the game</h2>
                <button
                  className="text-button"
                  disabled={!settings.enabledCommands.returnToPlay}
                  onClick={() => controller.returnToPlay()}
                >
                  {game.result ? 'Leave review' : 'Resume game'}
                  <ArrowRight size={15} />
                </button>
              </div>
              <p className="tiny">Say “apex resume game” to resume at the latest position.</p>
              <div className="review-navigation">
                <button
                  className="icon-button"
                  aria-label="Starting position"
                  disabled={ply === 0 || !settings.enabledCommands.review}
                  onClick={() => controller.seek(0)}
                >
                  <ChevronsLeft size={19} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Previous move"
                  disabled={ply === 0 || !settings.enabledCommands.review}
                  onClick={() => controller.seek(ply - 1)}
                >
                  <ChevronLeft size={19} />
                </button>
                <span>
                  <strong>{ply}</strong> / {game.moves.length} moves
                </span>
                <button
                  className="icon-button"
                  aria-label="Next move"
                  disabled={ply >= game.moves.length || !settings.enabledCommands.next}
                  onClick={() => void controller.execute({ type: 'next', count: 1 })}
                >
                  <ChevronRight size={19} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Final position"
                  disabled={ply === game.moves.length || !settings.enabledCommands.review}
                  onClick={() => controller.seek(game.moves.length)}
                >
                  <ChevronsRight size={19} />
                </button>
              </div>
              <div className="inline-controls">
                <label>
                  Advance{' '}
                  <input
                    aria-label="Number of individual moves to advance"
                    type="number"
                    min="1"
                    max="999"
                    value={step}
                    onChange={(e) => setStep(Number(e.target.value))}
                  />
                </label>
                <button
                  className="button small secondary"
                  disabled={!settings.enabledCommands.next || ply >= game.moves.length}
                  onClick={() => void controller.execute({ type: 'next', count: step })}
                >
                  Next {step}
                  <ArrowRight size={15} />
                </button>
              </div>
            </section>
          ) : (
            <MoveComposer state={state} controller={controller} />
          )}

          <div className={`feedback ${state.feedback.kind}`} role="status" aria-live="polite">
            <span className="feedback-symbol">{state.feedback.kind === 'error' ? '!' : '✓'}</span>
            <span key={state.feedback.id}>{state.feedback.text}</span>
            {state.busy && <LoaderCircle className="spin" size={17} />}
          </div>
          {isEngineTurn && !state.busy && (
            <button className="text-button retry" onClick={() => void controller.maybeEngineMove()}>
              <RotateCcw size={15} />
              Retry engine move
            </button>
          )}
        </section>

        <aside className="practice-aside">
          <section className={`voice-card ${micOn ? 'voice-active' : ''}`}>
            <div className="section-heading">
              <span className="small-caps">VOICE COMPANION</span>
              <span className="voice-state">
                <i className="status-dot" />
                {micBusy
                  ? 'Starting'
                  : micOn
                    ? /Transcribing/.test(micStatus)
                      ? 'Transcribing'
                      : /Announcement/.test(micStatus)
                        ? 'Speaking'
                        : 'Listening'
                    : 'Ready when you are'}
              </span>
            </div>
            <div className={`sound-wave ${micOn ? 'active' : ''}`} aria-hidden="true">
              {Array.from({ length: 23 }, (_, i) => (
                <i
                  key={i}
                  style={{
                    height: `${8 + Math.sin(i * 1.9) ** 2 * (i > 5 && i < 18 ? 34 : 15)}px`,
                    animationDelay: `${i * 0.07}s`,
                  }}
                />
              ))}
            </div>
            <h2>{micOn ? 'Go ahead. Say your move.' : 'Make room for your mind.'}</h2>
            <p>
              {micOn
                ? '“Apex, move pawn e two e four.”'
                : 'Play without looking. Your voice does the moving.'}
            </p>
            <button
              className={`button ${micOn ? 'voice-stop' : 'primary'}`}
              disabled={micBusy}
              onClick={onMic}
            >
              {micBusy ? <LoaderCircle className="spin" size={17} /> : <Mic size={17} />}
              {micBusy ? 'Preparing microphone…' : micOn ? 'Pause microphone' : 'Enable microphone'}
            </button>
            <span className="voice-note">
              {micOn || micBusy ? micStatus : 'Private by design. Audio stays on this device.'}
            </span>
          </section>

          <section className="card journal">
            <div className="section-heading">
              <h2>Move journal</h2>
              <span className="count-pill">{game.moves.length}</span>
            </div>
            <button
              className="text-button repeat-last"
              disabled={!settings.enabledCommands.lastMove}
              onClick={() => void controller.execute({ type: 'lastMove' })}
            >
              Repeat last move
            </button>
            <div className="journal-head">
              <span>#</span>
              <span>White</span>
              <span>Black</span>
            </div>
            <div className="journal-body">
              {game.moves.length === 0 ? (
                <div className="journal-empty">
                  <Flag size={24} strokeWidth={1.4} />
                  <p>
                    A fresh position.
                    <br />
                    <span>Your story starts with a move.</span>
                  </p>
                </div>
              ) : (
                Array.from({ length: Math.ceil(game.moves.length / 2) }, (_, row) => (
                  <div className="journal-row" key={row}>
                    <span>{row + 1}.</span>
                    {[row * 2, row * 2 + 1].map((index) => {
                      const move = game.moves[index];
                      return (
                        <button
                          key={index}
                          disabled={!move || !settings.enabledCommands.review}
                          className={ply === index + 1 ? 'selected-move' : ''}
                          title={
                            move
                              ? `${PIECE_NAMES[move.piece]} ${move.from} to ${move.to}`
                              : undefined
                          }
                          onClick={() => controller.seek(index + 1)}
                        >
                          {move ? (
                            <>
                              <span>{PIECE_NAMES[move.piece]}</span>
                              <strong>
                                {move.from} <span className="move-arrow">→</span> {move.to}
                                {move.promotion ? `=${PIECE_NAMES[move.promotion]}` : ''}
                              </strong>
                            </>
                          ) : (
                            '—'
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
            <div className="journal-bottom">
              <label className="sr-only" htmlFor="review-start">
                Review starting move number
              </label>
              <input
                id="review-start"
                type="number"
                min="1"
                max="999"
                value={startMove}
                onChange={(e) => setStartMove(Number(e.target.value))}
              />
              <button
                className="text-button"
                disabled={!game.moves.length || !settings.enabledCommands.review}
                onClick={() => void controller.execute({ type: 'review', move: startMove })}
              >
                <RotateCcw size={14} />
                Review from move {startMove}
              </button>
            </div>
          </section>

          <section className="card practice-tools">
            <div className="section-heading">
              <h2>A little perspective</h2>
              <Sparkles size={17} />
            </div>
            <div className="tool-row">
              <label className="sr-only" htmlFor="vision-square">
                Square to inspect
              </label>
              <select
                id="vision-square"
                value={inspectSquare}
                onChange={(e) => setInspectSquare(e.target.value as Square)}
              >
                {'abcdefgh'.split('').flatMap((file) =>
                  [1, 2, 3, 4, 5, 6, 7, 8].map((rank) => (
                    <option key={`${file}${rank}`}>
                      {file}
                      {rank}
                    </option>
                  )),
                )}
              </select>
              <button
                className="button secondary small"
                disabled={!settings.enabledCommands.vision}
                onClick={() => void controller.execute({ type: 'vision', square: inspectSquare })}
              >
                <ScanEye size={16} />
                Vision
              </button>
            </div>
            <button
              className="evaluation-button"
              disabled={
                !!state.busy || !settings.enabledCommands.eval || (!reviewing && !!game.result)
              }
              onClick={() => void controller.execute({ type: 'eval' })}
            >
              <span>{state.busy === 'eval' ? 'Evaluating…' : 'Current evaluation'}</span>
              <ArrowRight size={16} />
            </button>
            {state.evaluation && <p className="eval-result">{state.evaluation}</p>}
          </section>
        </aside>
      </div>
      <form className="command-bar" onSubmit={submitText}>
        <span className="command-prefix">›_</span>
        <label className="sr-only" htmlFor="typed-command">
          Type a command
        </label>
        <input
          id="typed-command"
          autoComplete="off"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Prefer typing? Try: move pawn e2 e4"
        />
        <button type="button" className="text-button command-help" onClick={onCommands}>
          Command guide
        </button>
        <button className="icon-button" aria-label="Run command" disabled={!text.trim()}>
          <ArrowRight size={18} />
        </button>
      </form>
    </>
  );
}

function MoveComposer({ state, controller }: { state: AppState; controller: AppController }) {
  const [piece, setPiece] = useState<PieceSymbol>('p');
  const [from, setFrom] = useState<Square | ''>('');
  const [to, setTo] = useState<Square | ''>('');
  const [promotion, setPromotion] = useState<Promotion>('q');
  useEffect(() => {
    setFrom('');
    setTo('');
    setPromotion('q');
  }, [state.fen]);
  const moves = state.legalMoves;
  const pieces = [...new Set(moves.map((move) => move.piece))];
  const chosenPiece = pieces.includes(piece) ? piece : (pieces[0] ?? 'p');
  const origins = [
    ...new Set(moves.filter((move) => move.piece === chosenPiece).map((move) => move.from)),
  ];
  const chosenFrom = origins.includes(from as Square)
    ? from
    : origins.length === 1
      ? origins[0]
      : '';
  const targets = [
    ...new Set(
      moves
        .filter((move) => move.piece === chosenPiece && move.from === chosenFrom)
        .map((move) => move.to),
    ),
  ];
  const chosenTo = targets.includes(to as Square) ? to : '';
  const promotes = chosenPiece === 'p' && /[18]$/.test(chosenTo);
  const blocked =
    !!state.busy ||
    !!state.game.result ||
    !state.settings.enabledCommands.move ||
    (state.game.config.mode === 'engine' &&
      state.fen.split(' ')[1] !== state.game.config.playerColor);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!chosenFrom || !chosenTo || blocked) return;
    void controller.execute({
      type: 'move',
      piece: chosenPiece,
      from: chosenFrom as Square,
      to: chosenTo as Square,
      promotion: promotes ? promotion : undefined,
    });
  }
  return (
    <form className="card move-composer" onSubmit={submit}>
      <div className="section-heading">
        <h2>Find your next move</h2>
        <span className="small-caps">OR PLAY BY HAND</span>
      </div>
      <fieldset disabled={blocked}>
        <div className="move-fields">
          <label>
            Piece
            <select
              aria-label="Piece"
              value={chosenPiece}
              onChange={(e) => {
                setPiece(e.target.value as PieceSymbol);
                setFrom('');
                setTo('');
              }}
            >
              {pieces.map((p) => (
                <option key={p} value={p}>
                  {PIECE_NAMES[p][0].toUpperCase() + PIECE_NAMES[p].slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label>
            From
            <select
              aria-label="From square"
              value={chosenFrom}
              onChange={(e) => {
                setFrom(e.target.value as Square);
                setTo('');
              }}
            >
              <option value="">Square</option>
              {origins.map((square) => (
                <option key={square}>{square}</option>
              ))}
            </select>
          </label>
          <span className="field-arrow">
            <ArrowRight size={17} />
          </span>
          <label>
            To
            <select
              aria-label="To square"
              value={chosenTo}
              onChange={(e) => setTo(e.target.value as Square)}
              disabled={!chosenFrom || blocked}
            >
              <option value="">Square</option>
              {targets.map((square) => (
                <option key={square}>{square}</option>
              ))}
            </select>
          </label>
          <button className="button primary make-move" disabled={!chosenFrom || !chosenTo}>
            Make move
            <ArrowRight size={17} />
          </button>
        </div>
        {promotes && (
          <label className="promotion-field">
            Promote to
            <select value={promotion} onChange={(e) => setPromotion(e.target.value as Promotion)}>
              {(['q', 'r', 'b', 'n'] as Promotion[]).map((p) => (
                <option key={p} value={p}>
                  {PIECE_NAMES[p]}
                </option>
              ))}
            </select>
          </label>
        )}
      </fieldset>
    </form>
  );
}
