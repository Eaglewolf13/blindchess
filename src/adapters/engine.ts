import type { ChessEngine, EngineResult } from '../ports';

export class StockfishEngine implements ChessEngine {
  private worker: Worker | null = null;
  private initPromise: Promise<void> | null = null;
  private pending: {
    resolve: (value: EngineResult) => void;
    reject: (error: Error) => void;
    result: EngineResult;
    timer: ReturnType<typeof setTimeout>;
    stopTimer: ReturnType<typeof setTimeout>;
  } | null = null;
  private readyReject: ((error: Error) => void) | null = null;
  private initTimer: ReturnType<typeof setTimeout> | null = null;

  private init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = new Promise((resolve, reject) => {
      this.readyReject = reject;
      const worker = new Worker('/engine/stockfish.js');
      this.worker = worker;
      const timer = setTimeout(() => {
        this.dispose();
        reject(new Error('Stockfish could not load. Run npm run assets, then reload.'));
      }, 15000);
      this.initTimer = timer;
      worker.onerror = () => {
        clearTimeout(timer);
        this.dispose();
        reject(new Error('Stockfish is unavailable. Check that engine assets have downloaded.'));
      };
      worker.onmessage = (event) => {
        const line = String(event.data);
        if (line === 'uciok') {
          worker.postMessage('setoption name Hash value 16');
          worker.postMessage('isready');
        }
        if (line === 'readyok') {
          clearTimeout(timer);
          this.initTimer = null;
          this.readyReject = null;
          resolve();
        }
        if (!this.pending) return;
        const depth = line.match(/\bdepth (\d+)/);
        const score = line.match(/\bscore (cp|mate) (-?\d+)/);
        if (depth) this.pending.result.depth = Number(depth[1]);
        if (score && !/\b(upperbound|lowerbound)\b/.test(line)) {
          delete this.pending.result.centipawns;
          delete this.pending.result.mate;
          if (score[1] === 'cp') this.pending.result.centipawns = Number(score[2]);
          else this.pending.result.mate = Number(score[2]);
        }
        const best = line.match(/^bestmove (\S+)/);
        if (best) {
          const pending = this.pending;
          this.pending = null;
          clearTimeout(pending.timer);
          clearTimeout(pending.stopTimer);
          pending.resolve({
            ...pending.result,
            bestMove: best[1] === '(none)' || best[1] === '0000' ? null : best[1],
          });
        }
      };
      worker.postMessage('uci');
    });
    return this.initPromise;
  }
  async search(
    fen: string,
    options: { level: number; evaluation: boolean; moves?: string[] },
  ): Promise<EngineResult> {
    await this.init();
    if (this.pending) throw new Error('Stockfish is already thinking. Please wait a moment.');
    if (!this.worker) throw new Error('Stockfish was stopped. Please try again.');
    const worker = this.worker;
    const skill = options.evaluation ? 20 : ([0, 1, 3, 6, 10, 14, 18, 20][options.level - 1] ?? 20);
    worker.postMessage(`setoption name Skill Level value ${skill}`);
    worker.postMessage('setoption name UCI_LimitStrength value false');
    worker.postMessage('ucinewgame');
    worker.postMessage(
      options.moves?.length
        ? `position startpos moves ${options.moves.join(' ')}`
        : `position fen ${fen}`,
    );
    return new Promise((resolve, reject) => {
      // Time budget is independent of device speed. Slow devices search fewer nodes.
      const timer = setTimeout(() => {
        this.cancel();
      }, 2500);
      const stopTimer = setTimeout(() => worker.postMessage('stop'), 1750);
      this.pending = { resolve, reject, result: { bestMove: null, depth: 0 }, timer, stopTimer };
      worker.postMessage(`go movetime ${options.evaluation ? 1200 : 800}`);
    });
  }
  cancel() {
    if (this.initTimer) clearTimeout(this.initTimer);
    this.initTimer = null;
    const pending = this.pending;
    this.pending = null;
    if (pending) {
      clearTimeout(pending.timer);
      clearTimeout(pending.stopTimer);
      pending.reject(new Error('Engine calculation was interrupted.'));
    }
    this.readyReject?.(new Error('Engine loading was interrupted.'));
    this.readyReject = null;
    this.worker?.terminate();
    this.worker = null;
    this.initPromise = null;
  }
  dispose() {
    this.cancel();
  }
}

export function evaluationText(result: EngineResult, turn: 'w' | 'b'): string {
  const sign = turn === 'w' ? 1 : -1;
  if (result.mate !== undefined) {
    const side = result.mate * sign > 0 ? 'White' : 'Black';
    return `${side} has mate in ${Math.abs(result.mate)}.`;
  }
  if (result.centipawns === undefined) return 'No evaluation is available for this position.';
  const score = (result.centipawns * sign) / 100;
  if (Math.abs(score) < 0.15) return 'The position is approximately equal.';
  return `${score > 0 ? 'White' : 'Black'} is winning, ${score > 0 ? '+' : '−'}${Math.abs(score).toFixed(1)}.`;
}
