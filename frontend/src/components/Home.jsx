// Home page, designed like an invitation:
//   hero (ivory)      → create or join a room
//   line-up (olive)   → the three games
//   how it works      → three steps, heart timeline
//   footer

import { useState } from 'react'
import { send, playerId, savedName } from '../lib/socket.js'
import { gameShowcase } from '../games/index.js'
import { CornerOrnaments, DashedDivider, GameIcon, Heart, Ornament, Reveal, Rings } from './Decor.jsx'

const today = new Date()
const weekday = today.toLocaleDateString('en-GB', { weekday: 'long' })
const longDate = today.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

const steps = [
  { numeral: 'I', title: 'Create a room', text: 'Pick a name and open a private room. You get a six-letter code.' },
  { numeral: 'II', title: 'Share the code', text: 'Send the invite link. Your friend joins from any phone or laptop.' },
  { numeral: 'III', title: 'Vote & play', text: 'Both choose a game. Play, then ask for a rematch — or pick another.' },
]

export default function Home({ showToast }) {
  const [name, setName] = useState(savedName.get)
  // An invite link looks like /?room=AB12CD → fill in the code for them.
  const [code, setCode] = useState(() => new URLSearchParams(window.location.search).get('room') ?? '')
  const [busy, setBusy] = useState(false)
  // The floating invitation card only appears on a fresh visit, not from an invite link.
  const [showInvite, setShowInvite] = useState(() => !code)

  // The server answers with { ok, message }. On success it ALSO sends a
  // 'room:update' event, which App listens to and shows the Room screen.
  const request = async (event, payload) => {
    savedName.set(name.trim())
    setBusy(true)
    const response = await send(event, { ...payload, playerId, name: name.trim() })
    setBusy(false)
    if (!response.ok) showToast(response.message)
  }

  const createRoom = () => request('room:create', {})

  const joinRoom = (event) => {
    event.preventDefault()
    if (code.trim().length < 6) {
      showToast('Enter the 6-character room code')
      return
    }
    request('room:join', { roomCode: code.trim() })
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {showInvite && <InvitationCard onDone={() => setShowInvite(false)} />}

      {/* ——— Hero ——— */}
      <section className="relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 py-20 text-center">
        <CornerOrnaments />

        <p className="eyebrow animate-rise text-muted">You are cordially invited to play</p>

        <h1 className="mt-5 flex animate-rise items-center justify-center gap-1 font-script text-[4.6rem] leading-none text-gold [animation-delay:150ms] sm:gap-3 sm:text-[8rem]">
          <span>Game</span>
          <Rings className="h-8 w-12 shrink-0 translate-y-2 sm:h-14 sm:w-20" />
          <span>Playz</span>
        </h1>

        <p className="mt-6 animate-rise font-display text-base tracking-[0.3em] text-ink uppercase [animation-delay:300ms] sm:text-lg">
          {weekday} <span className="text-gold">·</span> {longDate}
        </p>
        <p className="mt-3 max-w-xs animate-rise font-display text-xl text-muted italic [animation-delay:450ms]">
          “Two players, one table — and always one more rematch.”
        </p>

        {/* Create / join card */}
        <div className="card mt-10 w-full max-w-sm animate-rise p-6 text-left [animation-delay:600ms] sm:p-8">
          <label className="block">
            <span className="eyebrow text-muted">Your name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={16}
              placeholder="e.g. Sam"
              autoComplete="nickname"
              enterKeyHint="done"
              className="mt-1 w-full border-b border-olive/40 bg-transparent py-2 font-display text-2xl text-ink outline-none placeholder:text-muted/50 focus:border-olive"
            />
          </label>

          <button type="button" onClick={createRoom} disabled={busy} className="btn-primary mt-6 w-full">
            Create a room
          </button>

          <div className="my-6 flex items-center gap-3 text-muted">
            <span className="h-px flex-1 border-t border-dashed border-olive/50" />
            <span className="font-script text-2xl text-olive">or join a friend</span>
            <span className="h-px flex-1 border-t border-dashed border-olive/50" />
          </div>

          <form onSubmit={joinRoom} className="flex gap-2">
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              maxLength={6}
              placeholder="CODE"
              aria-label="Room code"
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              className="h-13 min-w-0 flex-1 rounded-full border border-olive/30 bg-ivory px-4 text-center font-display text-2xl tracking-[0.35em] text-ink uppercase outline-none placeholder:text-muted/40 focus:border-olive"
            />
            <button type="submit" disabled={busy} className="btn-outline px-6">
              Join
            </button>
          </form>
        </div>

        <a href="#line-up" className="mt-10 flex flex-col items-center gap-2 text-muted">
          <span className="eyebrow">The games</span>
          <span className="h-10 border-l border-dashed border-olive" />
        </a>
      </section>

      {/* ——— Line-up (olive, more dramatic) ——— */}
      <section id="line-up" className="bg-olive px-6 py-20 text-white sm:py-28">
        <div className="mx-auto grid max-w-5xl items-center gap-12 md:grid-cols-2">
          <Reveal className="relative aspect-[4/3] overflow-hidden rounded-[40px] bg-olive-deep md:aspect-[4/5]">
            {/* An "editorial photo" panel: slow zoom + thin white inner frame */}
            <div className="absolute inset-0 flex animate-slow-zoom items-center justify-center bg-[radial-gradient(circle_at_30%_20%,#98a58c,transparent_60%),radial-gradient(circle_at_80%_90%,#4f5a48,transparent_55%)]">
              <Ornament className="absolute top-6 left-6 size-32 text-white/25" />
              <Ornament className="absolute right-6 bottom-6 size-32 -scale-100 text-white/25" />
              <div className="text-center">
                <p className="font-script text-7xl text-white sm:text-8xl">Let’s play</p>
                <Rings className="mx-auto mt-2 h-10 w-16 text-saffron" />
              </div>
            </div>
            <div className="pointer-events-none absolute inset-4 rounded-[28px] border border-white/60" />
          </Reveal>

          <div>
            <Reveal>
              <p className="eyebrow text-white/75">The line-up</p>
              <h2 className="mt-3 font-display text-4xl sm:text-5xl">Three games, one evening</h2>
            </Reveal>
            <ul className="mt-8 divide-y divide-white/20 border-y border-white/20">
              {gameShowcase.map((game, index) => (
                <Reveal as="li" key={game.id} delay={index * 150} className="flex gap-5 py-6">
                  <span className="flex size-14 shrink-0 items-center justify-center rounded-full border border-white/40">
                    <GameIcon gameId={game.id} className="size-7" />
                  </span>
                  <div>
                    <p className="font-script text-3xl leading-none text-saffron">{game.note}</p>
                    <h3 className="mt-1 font-display text-3xl">{game.name}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-white/85">{game.text}</p>
                  </div>
                </Reveal>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ——— How it works (white, heart timeline) ——— */}
      <section className="bg-white px-6 py-20 text-center sm:py-28">
        <Reveal>
          <p className="eyebrow text-muted">The order of play</p>
          <h2 className="mt-3 font-display text-4xl sm:text-5xl">How it works</h2>
          <DashedDivider className="mx-auto mt-6 max-w-40 text-olive" />
        </Reveal>

        <ol className="mx-auto mt-12 grid max-w-5xl gap-4 sm:grid-cols-3 sm:gap-8">
          {steps.map((step, index) => (
            <Reveal as="li" key={step.numeral} delay={index * 150} className="flex flex-col items-center">
              {index > 0 && <span className="mb-4 h-10 border-l border-dashed border-olive/60 sm:hidden" />}
              <div className="relative flex size-32 items-center justify-center">
                <Heart className="absolute inset-0 size-32 fill-ivory text-olive/30" />
                <span className="relative -translate-y-1 font-display text-3xl text-olive">{step.numeral}</span>
              </div>
              <h3 className="mt-3 font-script text-4xl text-olive">{step.title}</h3>
              <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted">{step.text}</p>
            </Reveal>
          ))}
        </ol>
      </section>

      <footer className="flex flex-col items-center gap-2 px-6 py-12 text-center">
        <p className="font-script text-5xl text-gold">Game Playz</p>
        <p className="eyebrow flex items-center gap-2 text-muted">
          Made for two <Heart className="size-3.5 text-saffron" />
        </p>
      </footer>
    </div>
  )
}

// A physical-invitation style card that floats in, stays a moment, and
// fades away by itself (tap to dismiss early).
function InvitationCard({ onDone }) {
  return (
    <button
      type="button"
      onClick={onDone}
      onAnimationEnd={(event) => event.target === event.currentTarget && onDone()}
      aria-label="Dismiss invitation"
      className="fixed top-1/2 left-1/2 z-40 w-[min(78vw,300px)] animate-invite rounded-[28px] border-2 border-olive bg-white p-3 text-center shadow-deep"
    >
      <div className="relative aspect-[4/5] overflow-hidden rounded-[20px] bg-olive">
        <div className="absolute inset-0 flex animate-slow-zoom items-center justify-center bg-[radial-gradient(circle_at_30%_25%,#a3af98,transparent_60%),radial-gradient(circle_at_75%_85%,#56614f,transparent_55%)]">
          <Ornament className="absolute top-3 left-3 size-20 text-white/30" />
          <Ornament className="absolute right-3 bottom-3 size-20 -scale-100 text-white/30" />
          <GameIcon gameId="tic-tac-toe" className="size-24 text-white/85" />
        </div>
        <div className="pointer-events-none absolute inset-2.5 rounded-[14px] border border-white/60" />
      </div>
      <p className="mt-4 font-display text-sm tracking-[0.3em] text-ink uppercase">{longDate}</p>
      <p className="mt-1 mb-1 font-script text-4xl text-gold">#GameNightForTwo</p>
    </button>
  )
}
