// Room screen. What it shows depends on room.status:
//   waiting  → share the code
//   voting   → pick a game
//   playing  → the game
//   finished → the game + a result sheet (rematch / other game)

import { send, sendAction } from '../lib/socket.js'
import { gameScreens } from '../games/index.js'

// Opens the phone's share menu. Falls back to copying, then to just
// showing the code (copying needs https, which a phone on http://192.168.x.x
// doesn't have).
async function shareRoom(roomCode, showToast) {
  const url = `${window.location.origin}/?room=${roomCode}`
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Game Playz', text: `Play with me! Room code: ${roomCode}`, url })
      return
    }
    await navigator.clipboard.writeText(url)
    showToast('Invite link copied!')
  } catch (err) {
    if (err?.name !== 'AbortError') showToast(`Room code: ${roomCode}`)
  }
}

export default function Room({ room, gameState, onLeave, showToast }) {
  const me = room.mySeat
  const opponent = room.players[1 - me]
  const opponentName = opponent?.name ?? 'Opponent'

  const leave = () => {
    if (window.confirm('Leave this room?')) onLeave()
  }

  const request = async (event, payload) => {
    const response = await send(event, payload)
    if (!response.ok) showToast(response.message)
  }

  const inGame = room.status === 'playing' || room.status === 'finished'
  const GameScreen = gameScreens[room.selectedGame]

  return (
    <div className="flex min-h-0 flex-1 flex-col pb-[env(safe-area-inset-bottom)]">
      {/* Top bar */}
      <header className="flex items-center gap-2 border-b border-white/5 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={leave}
          className="h-10 rounded-lg px-3 text-sm font-semibold text-slate-400 active:bg-slate-800"
        >
          ✕ Leave
        </button>
        <button
          type="button"
          onClick={() => shareRoom(room.roomCode, showToast)}
          className="h-10 rounded-lg bg-slate-800 px-3 font-mono text-base font-bold tracking-widest active:bg-slate-700"
          aria-label="Share room code"
        >
          {room.roomCode}
        </button>
        <div className="ml-auto flex min-w-0 gap-1.5">
          {room.players.map((player) => (
            <span
              key={player.seat}
              className="flex min-w-0 items-center gap-1.5 rounded-full bg-slate-800 px-2.5 py-1 text-xs font-semibold"
            >
              <span className={`size-2 shrink-0 rounded-full ${player.connected ? 'bg-emerald-400' : 'bg-slate-500'}`} />
              <span className="truncate">{player.seat === me ? 'You' : player.name}</span>
            </span>
          ))}
        </div>
      </header>

      {opponent && !opponent.connected && (
        <p className="bg-slate-800 px-4 py-1.5 text-center text-sm text-slate-300">
          {opponentName} is offline — waiting for them to come back…
        </p>
      )}

      {room.status === 'waiting' && (
        <Waiting roomCode={room.roomCode} onShare={() => shareRoom(room.roomCode, showToast)} />
      )}

      {room.status === 'voting' && (
        <Voting room={room} opponentName={opponentName} onVote={(gameId) => request('room:vote', { gameId })} />
      )}

      {inGame && GameScreen && gameState && (
        // `key` changes on every rematch → React throws away the old game
        // screen and builds a fresh one (clean canvas, reset timers).
        <GameScreen
          key={`${room.selectedGame}-${gameState.match}`}
          state={gameState}
          room={room}
          mySeat={me}
          opponentName={opponentName}
          sendAction={sendAction}
          showToast={showToast}
        />
      )}

      {inGame && !gameState && <p className="m-auto text-slate-400">Starting game…</p>}

      {room.status === 'finished' && room.result && (
        <ResultSheet
          room={room}
          opponentName={opponentName}
          onRematch={() => request('game:rematch')}
          onNewGame={() => request('room:newGame')}
        />
      )}
    </div>
  )
}

function Waiting({ roomCode, onShare }) {
  return (
    <div className="m-auto flex w-full max-w-sm flex-col items-center gap-4 px-5 text-center">
      <div className="animate-pulse text-5xl">⏳</div>
      <h2 className="text-2xl font-bold">Waiting for your friend…</h2>
      <p className="text-slate-400">Send them this code:</p>
      <p className="font-mono text-5xl font-black tracking-[0.2em] text-violet-300">{roomCode}</p>
      <button
        type="button"
        onClick={onShare}
        className="h-14 w-full rounded-xl bg-violet-500 text-lg font-bold text-white active:scale-[0.98]"
      >
        Share invite link
      </button>
    </div>
  )
}

function Voting({ room, opponentName, onVote }) {
  const myVote = room.votes[room.mySeat]
  const opponentVote = room.votes[1 - room.mySeat]

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3 overflow-y-auto px-4 py-5">
      <div>
        <h2 className="text-2xl font-bold">Pick a game</h2>
        <p className="text-sm text-slate-400">
          {myVote && !opponentVote
            ? `Waiting for ${opponentName} to vote…`
            : 'If you pick different games, one is chosen at random.'}
        </p>
      </div>

      {room.games.map((game) => (
        <button
          key={game.id}
          type="button"
          onClick={() => onVote(game.id)}
          className={`flex items-center gap-4 rounded-2xl p-4 text-left ring-2 transition active:scale-[0.98] ${
            myVote === game.id ? 'bg-violet-500/15 ring-violet-400' : 'bg-slate-800/70 ring-transparent'
          }`}
        >
          <span className="text-4xl">{game.emoji}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-bold">{game.name}</span>
            <span className="block text-sm text-slate-400">{game.description}</span>
          </span>
          <span className="flex flex-col items-end gap-1 text-xs font-semibold">
            {myVote === game.id && <span className="rounded-full bg-violet-500 px-2 py-0.5">You</span>}
            {opponentVote === game.id && (
              <span className="max-w-20 truncate rounded-full bg-emerald-600 px-2 py-0.5">{opponentName}</span>
            )}
          </span>
        </button>
      ))}
    </div>
  )
}

function ResultSheet({ room, opponentName, onRematch, onNewGame }) {
  const { result, mySeat, rematchSeats } = room

  let title = "It's a draw 🤝"
  if (result.winnerSeat === mySeat) title = 'You win! 🎉'
  else if (result.winnerSeat !== null) title = `${opponentName} wins`

  const iWantRematch = rematchSeats.includes(mySeat)
  const theyWantRematch = rematchSeats.includes(1 - mySeat)

  return (
    // A sheet at the bottom, so the final board stays visible above it.
    <div className="fixed inset-x-0 bottom-0 z-20 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto max-w-md rounded-2xl bg-slate-800 p-5 text-center shadow-2xl ring-1 ring-white/10">
        <h2 className="text-2xl font-black">{title}</h2>
        {result.scores && (
          <p className="mt-1 text-slate-300">
            You {result.scores[mySeat]} · {opponentName} {result.scores[1 - mySeat]}
          </p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onRematch}
            disabled={iWantRematch}
            className="h-12 rounded-xl bg-violet-500 font-bold text-white active:scale-[0.98] disabled:opacity-50"
          >
            {iWantRematch ? 'Waiting…' : 'Rematch'}
          </button>
          <button
            type="button"
            onClick={onNewGame}
            className="h-12 rounded-xl bg-slate-700 font-bold active:scale-[0.98]"
          >
            Other game
          </button>
        </div>
        {theyWantRematch && !iWantRematch && (
          <p className="mt-3 text-sm text-emerald-300">{opponentName} wants a rematch!</p>
        )}
      </div>
    </div>
  )
}
