// Room screen. What it shows depends on room.status:
//   waiting  → an invitation card with the code to share
//   voting   → pick a game
//   playing  → the game
//   finished → the game + a result sheet (rematch / other game)

import { useState } from 'react'
import { send, sendAction } from '../lib/socket.js'
import { gameScreens } from '../games/index.js'
import { CornerOrnaments, DashedDivider, GameIcon, Heart, Ornament, Reveal, Rings } from './Decor.jsx'

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
    showToast('Invite link copied')
  } catch (err) {
    if (err?.name !== 'AbortError') showToast(`Room code: ${roomCode}`)
  }
}

export default function Room({ room, gameState, onLeave, showToast }) {
  const [scrolled, setScrolled] = useState(false)
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
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header: links on the sides, handwritten monogram in the middle.
          It gets a soft shadow once the content below is scrolled. */}
      <header
        className={`relative z-10 bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur transition-shadow duration-500 ${
          scrolled ? 'shadow-soft' : 'border-b border-olive/10'
        }`}
      >
        <div className="mx-auto grid max-w-3xl grid-cols-[1fr_auto_1fr] items-center px-4 py-1.5">
          <button type="button" onClick={leave} className="eyebrow justify-self-start py-3 text-muted hover:text-olive">
            Leave
          </button>
          <span className="font-script text-4xl leading-none text-gold" aria-hidden="true">
            GP
          </span>
          <button
            type="button"
            onClick={() => shareRoom(room.roomCode, showToast)}
            className="eyebrow justify-self-end py-3 text-muted hover:text-olive"
            aria-label={`Share room code ${room.roomCode}`}
          >
            Room <span className="font-display text-base tracking-[0.2em] text-ink">{room.roomCode}</span>
          </button>
        </div>

        {/* The two players, like the names on an invitation */}
        <div className="flex items-center justify-center gap-3 pb-2 font-script text-3xl leading-none text-olive">
          {room.players.map((player, index) => (
            <span key={player.seat} className="flex min-w-0 items-center gap-3">
              {index > 0 && <Heart className="size-4 shrink-0 text-saffron" />}
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="max-w-[9rem] truncate">{player.seat === me ? 'You' : player.name}</span>
                <span
                  className={`size-1.5 shrink-0 rounded-full ${player.connected ? 'bg-olive' : 'bg-muted/30'}`}
                  title={player.connected ? 'Online' : 'Offline'}
                />
              </span>
            </span>
          ))}
        </div>
      </header>

      {opponent && !opponent.connected && (
        <p className="bg-ivory px-4 py-2 text-center font-display text-sm text-muted italic">
          {opponentName} is offline — waiting for them to come back…
        </p>
      )}

      <main
        onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 4)}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-[env(safe-area-inset-bottom)]"
      >
        {room.status === 'waiting' && (
          <Waiting roomCode={room.roomCode} onShare={() => shareRoom(room.roomCode, showToast)} />
        )}

        {room.status === 'voting' && (
          <Voting
            room={room}
            opponentName={opponentName}
            onVote={(gameId, mode) => request('room:vote', { gameId, mode })}
          />
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

        {inGame && !gameState && (
          <p className="m-auto font-script text-4xl text-olive">Setting the table…</p>
        )}
      </main>

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
    <section className="relative isolate flex flex-1 flex-col items-center justify-center overflow-hidden px-6 py-12 text-center">
      <CornerOrnaments className="text-olive/20" />

      <p className="eyebrow animate-rise text-muted">Save the game</p>

      {/* Invitation card, slightly rotated like a printed card */}
      <div className="mt-6 w-full max-w-xs -rotate-2 animate-rise rounded-[28px] border-2 border-olive bg-white p-3 shadow-deep [animation-delay:150ms]">
        <div className="relative overflow-hidden rounded-[20px] bg-olive px-6 py-10">
          <div className="absolute inset-0 animate-slow-zoom bg-[radial-gradient(circle_at_30%_20%,#a3af98,transparent_60%),radial-gradient(circle_at_80%_90%,#56614f,transparent_55%)]" />
          <Ornament className="absolute top-2 left-2 size-16 text-white/30" />
          <Ornament className="absolute right-2 bottom-2 size-16 -scale-100 text-white/30" />
          <div className="pointer-events-none absolute inset-2 rounded-[14px] border border-white/60" />
          <p className="relative font-script text-4xl text-white">Your room</p>
          <p className="relative mt-2 font-display text-5xl tracking-[0.18em] text-white">{roomCode}</p>
        </div>
        <p className="mt-3 font-script text-3xl text-gold">#{roomCode}</p>
      </div>

      <h2 className="mt-10 flex animate-rise items-center gap-3 font-display text-2xl text-ink [animation-delay:300ms]">
        <Heart className="size-5 animate-pulse text-saffron" />
        Waiting for your friend
      </h2>
      <p className="mt-2 max-w-xs animate-rise text-sm text-muted [animation-delay:400ms]">
        Share the invite — the game begins the moment they arrive.
      </p>

      <button type="button" onClick={onShare} className="btn-primary mt-8 animate-rise [animation-delay:500ms]">
        Share invitation
      </button>
    </section>
  )
}

function Voting({ room, opponentName, onVote }) {
  // Votes are { gameId, mode } (mode is null for games without modes).
  const myVote = room.votes[room.mySeat]
  const opponentVote = room.votes[1 - room.mySeat]
  const modeName = (game, modeId) => game.modes?.find((mode) => mode.id === modeId)?.name

  return (
    <section className="mx-auto flex w-full max-w-lg flex-col px-5 py-10 text-center">
      <Reveal>
        <p className="eyebrow text-muted">The choosing</p>
        <h2 className="mt-3 font-display text-4xl text-ink">
          Pick a game <span className="font-script text-5xl text-gold">together</span>
        </h2>
        <p className="mt-3 text-sm text-muted">
          {myVote && !opponentVote
            ? `Waiting for ${opponentName} to choose…`
            : 'If you choose differently, fate decides between the two.'}
        </p>
        <DashedDivider className="mx-auto mt-6 max-w-40 text-olive" />
      </Reveal>

      <div className="mt-8 flex flex-col gap-4">
        {room.games.map((game, index) => {
          const mine = myVote?.gameId === game.id
          const theirs = opponentVote?.gameId === game.id
          return (
            <Reveal key={game.id} delay={index * 100}>
              <div
                className={`overflow-hidden rounded-[28px] border bg-white text-left shadow-soft transition duration-300 ${
                  mine ? 'border-olive ring-1 ring-olive' : 'border-olive/15'
                }`}
              >
                {/* Tapping the card votes for the game (its first mode, or the one you picked). */}
                <button
                  type="button"
                  onClick={() => onVote(game.id, mine ? myVote.mode : undefined)}
                  aria-pressed={mine}
                  className="flex w-full items-center gap-5 p-5 text-left transition duration-300 hover:bg-ivory/60 active:scale-[0.99]"
                >
                  <span
                    className={`flex size-14 shrink-0 items-center justify-center rounded-full border ${
                      mine ? 'border-olive bg-olive text-white' : 'border-olive/30 text-olive'
                    }`}
                  >
                    <GameIcon gameId={game.id} className="size-7" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-2xl text-ink">{game.name}</span>
                    <span className="block text-sm text-muted">{game.description}</span>
                    {(mine || theirs) && (
                      <span className="mt-2 flex flex-wrap gap-1.5">
                        {mine && (
                          <span className="eyebrow rounded-full bg-olive px-3 py-1 text-white">
                            Your pick{myVote.mode ? ` · ${modeName(game, myVote.mode)}` : ''}
                          </span>
                        )}
                        {theirs && (
                          <span className="eyebrow max-w-full truncate rounded-full bg-saffron/25 px-3 py-1 text-ink">
                            {opponentName}’s pick{opponentVote.mode ? ` · ${modeName(game, opponentVote.mode)}` : ''}
                          </span>
                        )}
                      </span>
                    )}
                  </span>
                </button>

                {/* Modes (Best of 3/5/7, Duel/Co-op): each chip is a vote. */}
                {game.modes && (
                  <div className="flex flex-wrap gap-2 border-t border-dashed border-olive/25 px-5 py-3">
                    {game.modes.map((mode) => {
                      const chosen = mine && myVote.mode === mode.id
                      return (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() => onVote(game.id, mode.id)}
                          aria-pressed={chosen}
                          className={`h-10 rounded-full border px-4 text-xs font-semibold tracking-[0.12em] uppercase transition duration-300 active:scale-95 ${
                            chosen ? 'border-olive bg-olive text-white' : 'border-olive/30 text-olive hover:bg-olive/5'
                          }`}
                        >
                          {mode.name}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </Reveal>
          )
        })}
      </div>
    </section>
  )
}

// Olive sheet at the bottom (palette reversed), so the final board stays
// visible above it.
function ResultSheet({ room, opponentName, onRematch, onNewGame }) {
  const { result, mySeat, rematchSeats } = room

  let title = 'A perfect tie'
  if (result.coop) title = result.won ? 'Victory, together' : 'The core has fallen'
  else if (result.winnerSeat === mySeat) title = 'You win'
  else if (result.winnerSeat !== null) title = `${opponentName} wins`

  const iWantRematch = rematchSeats.includes(mySeat)
  const theyWantRematch = rematchSeats.includes(1 - mySeat)

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto max-w-md animate-rise rounded-[32px] bg-olive px-6 pt-5 pb-6 text-center text-white shadow-deep">
        <Rings className="mx-auto h-6 w-10 text-saffron" />
        <h2 className="mt-1 truncate font-script text-5xl leading-tight">{title}</h2>
        {result.coop && (
          <p className="mt-1 font-display text-lg tracking-[0.15em] uppercase">
            Team score <span className="text-saffron">·</span> {result.teamScore}
          </p>
        )}
        {result.scores && (
          <p className="mt-1 font-display text-lg tracking-[0.15em] uppercase">
            You {result.scores[mySeat]} <span className="text-saffron">·</span> {opponentName} {result.scores[1 - mySeat]}
          </p>
        )}
        <div className="mt-4 border-t border-white/20 pt-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onRematch}
              disabled={iWantRematch}
              className="h-12 rounded-full bg-white text-xs font-semibold tracking-[0.18em] text-olive uppercase transition duration-300 hover:scale-[1.03] active:scale-[0.98] disabled:opacity-70 disabled:hover:scale-100"
            >
              {iWantRematch ? 'Waiting…' : 'Rematch'}
            </button>
            <button
              type="button"
              onClick={onNewGame}
              className="h-12 rounded-full border border-white/70 text-xs font-semibold tracking-[0.18em] uppercase transition duration-300 hover:scale-[1.03] hover:bg-white/10 active:scale-[0.98]"
            >
              Other game
            </button>
          </div>
          {theyWantRematch && !iWantRematch && (
            <p className="mt-3 font-script text-2xl text-saffron">{opponentName} wants a rematch</p>
          )}
        </div>
      </div>
    </div>
  )
}
