import { Chess, type Square } from 'chess.js';
import { EyeOff } from 'lucide-react';
import type { RecordedMove } from '../domain/types';

const GLYPHS = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const NAMES = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
export function Board({
  fen,
  hidden,
  lastMove,
  flipped = false,
}: {
  fen: string;
  hidden: boolean;
  lastMove?: RecordedMove;
  flipped?: boolean;
}) {
  const chess = new Chess(fen);
  const ranks = flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  const files = (flipped ? 'hgfedcba' : 'abcdefgh').split('');
  return (
    <div className={`board-wrap ${hidden ? 'board-hidden' : ''}`}>
      <div className="rank-labels" aria-hidden="true">
        {ranks.map((rank) => (
          <span key={rank}>{rank}</span>
        ))}
      </div>
      <div
        className="chessboard"
        role="img"
        aria-label={
          hidden
            ? 'Board hidden for blindfold practice'
            : 'Chess position. Piece positions are listed on each square.'
        }
      >
        {ranks.flatMap((rank, row) =>
          files.map((file, column) => {
            const square = `${file}${rank}` as Square;
            const piece = hidden ? undefined : chess.get(square);
            const highlight = !hidden && (square === lastMove?.from || square === lastMove?.to);
            return (
              <div
                key={square}
                className={`square ${(row + column) % 2 ? 'dark' : 'light'} ${highlight ? 'last-move' : ''}`}
                title={
                  hidden
                    ? undefined
                    : `${square}: ${piece ? `${piece.color === 'w' ? 'White' : 'Black'} ${NAMES[piece.type]}` : 'empty'}`
                }
              >
                {piece && (
                  <span
                    className={`chess-piece ${piece.color === 'w' ? 'white-piece' : 'black-piece'}`}
                  >
                    {GLYPHS[piece.type]}
                  </span>
                )}
              </div>
            );
          }),
        )}
      </div>
      <div className="file-labels" aria-hidden="true">
        {files.map((file) => (
          <span key={file}>{file}</span>
        ))}
      </div>
      {hidden && (
        <div className="blind-overlay">
          <div className="blind-icon">
            <EyeOff size={27} strokeWidth={1.5} />
          </div>
          <h2>See it in your mind.</h2>
          <p>
            The board is yours to imagine.
            <br />
            Take your time. Find your move.
          </p>
          <span className="small-caps">BLINDFOLD MODE</span>
        </div>
      )}
    </div>
  );
}
