/* ================================================
   Web Chess – chess.js
   Full chess logic: moves, captures, check,
   checkmate, stalemate, castling, en passant,
   pawn promotion.
   ================================================ */

'use strict';

// ── Constants ──────────────────────────────────
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

const PIECE_TYPES = {
  K: 'king',  Q: 'queen',  R: 'rook',
  B: 'bishop', N: 'knight', P: 'pawn',
};

// Image paths: assets/pieces/<color>_<type>.png
function pieceImg(color, type) {
  return `assets/pieces/${color}_${type}.svg`;
}

// ── State ──────────────────────────────────────
let board = [];          // 8×8 array of null | {color, type}
let turn = 'white';
let selected = null;     // {row, col} of selected square
let validMoves = [];     // [{row,col}]
let capturedByWhite = []; // pieces captured BY white (black pieces)
let capturedByBlack = []; // pieces captured BY black (white pieces)
let lastMove = null;     // {from:{row,col}, to:{row,col}}
let enPassantTarget = null; // {row,col} square where en-passant capture lands
let castlingRights = {
  white: { kingSide: true, queenSide: true },
  black: { kingSide: true, queenSide: true },
};
let gameOver = false;
let promotionPending = null; // {row, col, color}

// ── Initialise ─────────────────────────────────
function initBoard() {
  board = Array.from({ length: 8 }, () => Array(8).fill(null));

  const backRank = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];

  backRank.forEach((t, c) => {
    board[0][c] = { color: 'black', type: t };
    board[7][c] = { color: 'white', type: t };
  });

  for (let c = 0; c < 8; c++) {
    board[1][c] = { color: 'black', type: 'P' };
    board[6][c] = { color: 'white', type: 'P' };
  }
}

// ── Board Rendering ────────────────────────────
function renderBoard() {
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = document.createElement('div');
      sq.classList.add('square', (r + c) % 2 === 0 ? 'light' : 'dark');
      sq.dataset.row = r;
      sq.dataset.col = c;

      // Last-move highlight
      if (lastMove) {
        const { from, to } = lastMove;
        if ((r === from.row && c === from.col) ||
            (r === to.row   && c === to.col)) {
          sq.classList.add('last-move');
        }
      }

      // Selected
      if (selected && selected.row === r && selected.col === c) {
        sq.classList.add('selected');
      }

      // Valid move indicators
      const mv = validMoves.find(m => m.row === r && m.col === c);
      if (mv) {
        sq.classList.add(mv.isCapture ? 'valid-capture' : 'valid-move');
      }

      // Check highlight
      if (board[r][c] && board[r][c].type === 'K') {
        if (board[r][c].color === turn && isInCheck(turn, board)) {
          sq.classList.add('in-check');
        }
      }

      // ── Inline coordinates (chess.com style) ──
      // rank 숫자: 각 행의 첫 번째 칸(col=0) 좌상단
      if (c === 0) {
        const rankLabel = document.createElement('span');
        rankLabel.classList.add('coord-rank');
        rankLabel.textContent = RANKS[r];   // '8'~'1'
        sq.appendChild(rankLabel);
      }
      // file 알파벳: 각 열의 마지막 행(row=7) 우하단
      if (r === 7) {
        const fileLabel = document.createElement('span');
        fileLabel.classList.add('coord-file');
        fileLabel.textContent = FILES[c];   // 'a'~'h'
        sq.appendChild(fileLabel);
      }

      // Piece image
      const piece = board[r][c];
      if (piece) {
        const img = document.createElement('img');
        img.src = pieceImg(piece.color, piece.type);
        img.alt = `${piece.color} ${piece.type}`;
        img.classList.add('piece');
        img.draggable = false;
        sq.appendChild(img);
      }

      sq.addEventListener('click', onSquareClick);
      boardEl.appendChild(sq);
    }
  }

  renderCaptured();
  renderStatus();
}

// ── Captured Pieces ────────────────────────────
function renderCaptured() {
  renderCapturedBar('captured-white-pieces', capturedByWhite);
  renderCapturedBar('captured-black-pieces', capturedByBlack);
}

function renderCapturedBar(id, pieces) {
  const el = document.getElementById(id);
  el.innerHTML = '';
  pieces.forEach(p => {
    const img = document.createElement('img');
    img.src = pieceImg(p.color, p.type);
    img.alt = `${p.color} ${p.type}`;
    img.title = `${p.color} ${PIECE_TYPES[p.type]}`;
    el.appendChild(img);
  });
}

// ── Status ─────────────────────────────────────
function renderStatus() {
  const ind = document.getElementById('turn-indicator');
  ind.className = '';

  if (gameOver) return; // message already set by endGame()

  const inCheck = isInCheck(turn, board);
  if (inCheck) {
    ind.textContent = `${cap(turn)} is in Check!`;
    ind.classList.add('check');
  } else {
    ind.textContent = `${cap(turn)}'s Turn`;
    ind.classList.add(turn === 'white' ? 'white-turn' : 'black-turn');
  }
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function endGame(msg, cls) {
  gameOver = true;
  const ind = document.getElementById('turn-indicator');
  ind.textContent = msg;
  ind.className = cls;
}

// ── Click Handler ──────────────────────────────
function onSquareClick(e) {
  if (gameOver || promotionPending) return;

  const sq = e.currentTarget;
  const row = parseInt(sq.dataset.row);
  const col = parseInt(sq.dataset.col);

  if (selected) {
    const mv = validMoves.find(m => m.row === row && m.col === col);
    if (mv) {
      executeMove(selected.row, selected.col, row, col, mv);
      return;
    }
  }

  // Select own piece
  const piece = board[row][col];
  if (piece && piece.color === turn) {
    selected = { row, col };
    validMoves = getLegalMoves(row, col, board).map(m => ({
      ...m,
      isCapture: !!(board[m.row][m.col] ||
        (piece.type === 'P' && enPassantTarget &&
         m.row === enPassantTarget.row && m.col === enPassantTarget.col)),
    }));
  } else {
    selected = null;
    validMoves = [];
  }

  renderBoard();
}

// ── Execute Move ───────────────────────────────
function executeMove(fr, fc, tr, tc, mv) {
  const piece = board[fr][fc];
  let captured = board[tr][tc];

  // En-passant capture
  if (piece.type === 'P' && enPassantTarget &&
      tr === enPassantTarget.row && tc === enPassantTarget.col) {
    const capturedRow = piece.color === 'white' ? tr + 1 : tr - 1;
    captured = board[capturedRow][tc];
    board[capturedRow][tc] = null;
  }

  // Castling
  if (piece.type === 'K' && Math.abs(tc - fc) === 2) {
    const rookFromCol = tc > fc ? 7 : 0;
    const rookToCol   = tc > fc ? tc - 1 : tc + 1;
    board[tr][rookToCol] = board[fr][rookFromCol];
    board[fr][rookFromCol] = null;
  }

  // Move piece
  board[tr][tc] = piece;
  board[fr][fc] = null;

  // En passant target update
  enPassantTarget = null;
  if (piece.type === 'P' && Math.abs(tr - fr) === 2) {
    enPassantTarget = {
      row: (fr + tr) / 2,
      col: fc,
    };
  }

  // Castling rights
  if (piece.type === 'K') {
    castlingRights[piece.color].kingSide  = false;
    castlingRights[piece.color].queenSide = false;
  }
  if (piece.type === 'R') {
    if (fc === 0) castlingRights[piece.color].queenSide = false;
    if (fc === 7) castlingRights[piece.color].kingSide  = false;
  }

  // Log capture
  if (captured) {
    if (piece.color === 'white') capturedByWhite.push(captured);
    else                         capturedByBlack.push(captured);
  }

  lastMove  = { from: { row: fr, col: fc }, to: { row: tr, col: tc } };
  selected  = null;
  validMoves = [];

  // Pawn promotion
  if (piece.type === 'P' && (tr === 0 || tr === 7)) {
    promotionPending = { row: tr, col: tc, color: piece.color };
    renderBoard();
    openPromotionModal(piece.color);
    return;
  }

  switchTurn();
}

function switchTurn() {
  turn = turn === 'white' ? 'black' : 'white';
  checkGameOver();
  renderBoard();
}

// ── Game Over Detection ────────────────────────
function checkGameOver() {
  const moves = getAllLegalMoves(turn);
  if (moves.length === 0) {
    if (isInCheck(turn, board)) {
      endGame(`Checkmate! ${cap(turn === 'white' ? 'black' : 'white')} wins 🏆`, 'checkmate');
    } else {
      endGame('Stalemate! Draw 🤝', 'stalemate');
    }
  }
}

function getAllLegalMoves(color) {
  const moves = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] && board[r][c].color === color) {
        const lm = getLegalMoves(r, c, board);
        lm.forEach(m => moves.push({ from: { row: r, col: c }, to: m }));
      }
    }
  }
  return moves;
}

// ── Promotion Modal ────────────────────────────
function openPromotionModal(color) {
  const modal = document.getElementById('promotion-modal');
  const choices = document.querySelectorAll('.promotion-choice');
  choices.forEach(btn => {
    const type = btn.dataset.piece;
    btn.querySelector('img').src = pieceImg(color, type);
    btn.onclick = () => promote(type);
  });
  modal.classList.add('open');
}

function promote(type) {
  const { row, col, color } = promotionPending;
  board[row][col] = { color, type };
  promotionPending = null;
  document.getElementById('promotion-modal').classList.remove('open');
  switchTurn();
}

// ── Move Generation ────────────────────────────
function getLegalMoves(row, col, b) {
  const piece = b[row][col];
  if (!piece) return [];

  let pseudo = getPseudoMoves(row, col, b);

  // Filter moves that leave own king in check
  pseudo = pseudo.filter(m => {
    const nb = cloneBoard(b);
    // En-passant removal on simulated board
    if (piece.type === 'P' && enPassantTarget &&
        m.row === enPassantTarget.row && m.col === enPassantTarget.col) {
      const capturedRow = piece.color === 'white' ? m.row + 1 : m.row - 1;
      nb[capturedRow][m.col] = null;
    }
    nb[m.row][m.col] = nb[row][col];
    nb[row][col] = null;
    return !isInCheck(piece.color, nb);
  });

  return pseudo;
}

function getPseudoMoves(row, col, b) {
  const piece = b[row][col];
  const { color, type } = piece;
  const moves = [];

  const add = (r, c) => {
    if (r < 0 || r > 7 || c < 0 || c > 7) return false;
    if (b[r][c] && b[r][c].color === color) return false;
    moves.push({ row: r, col: c });
    return !b[r][c]; // false if blocked
  };

  const slide = (dr, dc) => {
    let r = row + dr, c = col + dc;
    while (r >= 0 && r < 8 && c >= 0 && c < 8) {
      if (b[r][c]) { if (b[r][c].color !== color) moves.push({ row: r, col: c }); break; }
      moves.push({ row: r, col: c });
      r += dr; c += dc;
    }
  };

  switch (type) {
    case 'P': {
      const dir = color === 'white' ? -1 : 1;
      const startRow = color === 'white' ? 6 : 1;
      // Forward
      if (!b[row + dir]?.[col]) {
        moves.push({ row: row + dir, col });
        if (row === startRow && !b[row + 2 * dir]?.[col]) {
          moves.push({ row: row + 2 * dir, col });
        }
      }
      // Diagonal captures
      [-1, 1].forEach(dc => {
        const nr = row + dir, nc = col + dc;
        if (nc < 0 || nc > 7 || nr < 0 || nr > 7) return;
        if (b[nr][nc] && b[nr][nc].color !== color) moves.push({ row: nr, col: nc });
        // En passant
        if (enPassantTarget && enPassantTarget.row === nr && enPassantTarget.col === nc) {
          moves.push({ row: nr, col: nc });
        }
      });
      break;
    }
    case 'N':
      [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dr,dc]) => add(row+dr, col+dc));
      break;
    case 'B':
      [[-1,-1],[-1,1],[1,-1],[1,1]].forEach(([dr,dc]) => slide(dr,dc));
      break;
    case 'R':
      [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr,dc]) => slide(dr,dc));
      break;
    case 'Q':
      [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]].forEach(([dr,dc]) => slide(dr,dc));
      break;
    case 'K': {
      [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]].forEach(([dr,dc]) => add(row+dr, col+dc));
      // Castling
      const rights = castlingRights[color];
      const kingRow = color === 'white' ? 7 : 0;
      if (row === kingRow && col === 4 && !isInCheck(color, b)) {
        // King-side
        if (rights.kingSide &&
            !b[kingRow][5] && !b[kingRow][6] &&
            !isSquareAttacked(kingRow, 5, color, b) &&
            !isSquareAttacked(kingRow, 6, color, b)) {
          moves.push({ row: kingRow, col: 6 });
        }
        // Queen-side
        if (rights.queenSide &&
            !b[kingRow][3] && !b[kingRow][2] && !b[kingRow][1] &&
            !isSquareAttacked(kingRow, 3, color, b) &&
            !isSquareAttacked(kingRow, 2, color, b)) {
          moves.push({ row: kingRow, col: 2 });
        }
      }
      break;
    }
  }

  return moves;
}

// ── Check Detection ────────────────────────────
function isInCheck(color, b) {
  const king = findKing(color, b);
  if (!king) return false;
  return isSquareAttacked(king.row, king.col, color, b);
}

function isSquareAttacked(row, col, color, b) {
  const enemy = color === 'white' ? 'black' : 'white';
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (b[r][c] && b[r][c].color === enemy) {
        const attacked = getPseudoMovesNoEP(r, c, b);
        if (attacked.some(m => m.row === row && m.col === col)) return true;
      }
    }
  }
  return false;
}

// Pseudo moves without en-passant (used for attack detection)
function getPseudoMovesNoEP(row, col, b) {
  const savedEP = enPassantTarget;
  enPassantTarget = null;
  const moves = getPseudoMoves(row, col, b);
  enPassantTarget = savedEP;
  return moves;
}

function findKing(color, b) {
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if (b[r][c] && b[r][c].color === color && b[r][c].type === 'K')
        return { row: r, col: c };
  return null;
}

// ── Utility ────────────────────────────────────
function cloneBoard(b) {
  return b.map(row => row.map(cell => cell ? { ...cell } : null));
}

// ── Reset ──────────────────────────────────────
function resetGame() {
  turn           = 'white';
  selected       = null;
  validMoves     = [];
  capturedByWhite = [];
  capturedByBlack = [];
  lastMove       = null;
  enPassantTarget = null;
  gameOver       = false;
  promotionPending = null;
  castlingRights = {
    white: { kingSide: true, queenSide: true },
    black: { kingSide: true, queenSide: true },
  };
  initBoard();
  renderBoard();
  document.getElementById('promotion-modal').classList.remove('open');
}

// ── Bootstrap ──────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Inject promotion modal into DOM
  const modal = document.createElement('div');
  modal.id = 'promotion-modal';
  modal.innerHTML = `
    <div class="promotion-box">
      <h3>Choose promotion piece</h3>
      <div class="promotion-choices">
        <div class="promotion-choice" data-piece="Q"><img src="" alt="Queen" /></div>
        <div class="promotion-choice" data-piece="R"><img src="" alt="Rook" /></div>
        <div class="promotion-choice" data-piece="B"><img src="" alt="Bishop" /></div>
        <div class="promotion-choice" data-piece="N"><img src="" alt="Knight" /></div>
      </div>
    </div>`;
  document.body.appendChild(modal);

  document.getElementById('reset-btn').addEventListener('click', resetGame);

  resetGame();
});
