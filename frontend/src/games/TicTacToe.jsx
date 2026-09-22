// Tic-Tac-Toe screen. It only DRAWS the board the server sends, and asks
// the server to place a symbol. The server decides if the move is allowed.

const SYMBOLS = ['X', 'O'] // seat 0 is X, seat 1 is O

export default function TicTacToe({ state, mySeat, opponentName, sendAction, showToast }) {
  const { board, turn, winningLine, result } = state
  const myTurn = !result && turn === mySeat

  const place = async (cell) => {
    if (!myTurn || board[cell] !== null) return
    const response = await sendAction({ type: 'place', cell })
    if (!response.ok) showToast(response.message)
  }

  let status = `${opponentName}'s turn…`
  if (result) status = 'Game over'
  else if (myTurn) status = `Your turn — you are ${SYMBOLS[mySeat]}`

  return (
    // Extra bottom space when the result sheet is showing, so it doesn't cover the board.
    <div className={`flex flex-1 flex-col items-center justify-center gap-6 p-4 ${result ? 'pb-48' : ''}`}>
      <p className={`text-xl font-bold ${myTurn ? 'text-violet-300' : 'text-slate-400'}`}>{status}</p>

      <div
        className="grid aspect-square grid-cols-3 gap-2"
        // Fits a phone in portrait AND a short landscape screen.
        style={{ width: 'min(88vw, 55dvh, 420px)' }}
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
              className={`flex items-center justify-center rounded-2xl text-6xl font-black transition sm:text-7xl ${
                isWinningCell ? 'bg-emerald-500/30' : 'bg-slate-800'
              } ${myTurn && value === null ? 'active:bg-slate-700' : ''} ${
                value === 0 ? 'text-rose-400' : 'text-sky-400'
              }`}
            >
              {value === null ? '' : SYMBOLS[value]}
            </button>
          )
        })}
      </div>
    </div>
  )
}
