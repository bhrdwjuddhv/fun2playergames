// Tic-Tac-Toe screen. It only DRAWS the board the server sends, and asks
// the server to place a symbol. The server decides if the move is allowed.

import { DashedDivider } from '../components/Decor.jsx'

const SYMBOLS = ['X', 'O'] // seat 0 is X, seat 1 is O

export default function TicTacToe({ state, mySeat, opponentName, sendAction, showToast }) {
  const { board, turn, winningLine, result } = state
  const myTurn = !result && turn === mySeat

  const place = async (cell) => {
    if (!myTurn || board[cell] !== null) return
    const response = await sendAction({ type: 'place', cell })
    if (!response.ok) showToast(response.message)
  }

  let status = `${opponentName}’s turn`
  if (result) status = 'The final board'
  else if (myTurn) status = 'Your turn'

  return (
    // Extra bottom space when the result sheet is showing, so it doesn't cover the board.
    <section className={`flex flex-1 flex-col items-center justify-center gap-6 p-5 ${result ? 'pb-56' : ''}`}>
      <div className="text-center">
        <p className="eyebrow text-muted">
          You play <span className="font-display text-base text-olive">{SYMBOLS[mySeat]}</span>
        </p>
        <h2 className={`mt-1 font-script text-5xl transition-colors duration-500 ${myTurn ? 'text-olive' : 'text-muted/70'}`}>
          {status}
        </h2>
        <DashedDivider className="mx-auto mt-3 w-32 text-olive/70" />
      </div>

      <div
        className="grid aspect-square grid-cols-3 gap-2.5 rounded-[32px] border border-olive/15 bg-white p-3 shadow-soft"
        // Fits a phone in portrait AND a short landscape screen.
        style={{ width: 'min(90vw, 55dvh, 440px)' }}
      >
        {board.map((value, cell) => {
          const isWinningCell = winningLine?.includes(cell)
          return (
            <button
              key={cell}
              type="button"
              onClick={() => place(cell)}
              disabled={!myTurn || value !== null}
              aria-label={`Cell ${cell + 1}${value === null ? '' : `, ${SYMBOLS[value]}`}`}
              className={`flex items-center justify-center rounded-[18px] font-display text-6xl transition duration-500 sm:text-7xl ${
                isWinningCell ? 'bg-olive text-white' : 'bg-ivory'
              } ${myTurn && value === null ? 'hover:bg-olive/10 active:scale-95' : ''} ${
                !isWinningCell && value === 0 ? 'text-olive' : ''
              } ${!isWinningCell && value === 1 ? 'text-ink' : ''}`}
            >
              {value !== null && <span className="animate-rise [animation-duration:400ms]">{SYMBOLS[value]}</span>}
            </button>
          )
        })}
      </div>
    </section>
  )
}
