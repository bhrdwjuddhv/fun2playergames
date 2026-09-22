// Rock Paper Scissors screen.
// You pick in secret; the server only tells us whether your opponent has
// locked in — never what they picked — until the reveal.

import { DashedDivider, Heart } from '../components/Decor.jsx'
import { useTimeLeft } from './useTimeLeft.js'

const CHOICES = ['rock', 'paper', 'scissors']
const LABELS = { rock: 'Rock', paper: 'Paper', scissors: 'Scissors' }
const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV']

function ChoiceIcon({ choice, className = 'size-12' }) {
  const common = {
    viewBox: '0 0 48 48',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className,
    'aria-hidden': true,
  }
  if (choice === 'rock') {
    return (
      <svg {...common}>
        <path d="M9 30l4-13 10-6 12 4 5 11-4 10-14 3-11-3z" />
        <path d="M17 20l6 3 7-4M23 23l-2 9" />
      </svg>
    )
  }
  if (choice === 'paper') {
    return (
      <svg {...common}>
        <path d="M12 6h17l8 8v28H12z" />
        <path d="M29 6v8h8M17 22h14M17 28h14M17 34h9" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <circle cx="15" cy="37" r="5" />
      <circle cx="33" cy="37" r="5" />
      <path d="M18 33L34 7M30 33L14 7" />
    </svg>
  )
}

// One player's card: face down while choosing, face up at the reveal.
function PlayerCard({ name, choice, faceUp, status, highlight }) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-[28px] border bg-white px-3 py-5 text-center shadow-soft transition duration-500 ${
        highlight ? 'border-olive ring-2 ring-olive' : 'border-olive/15'
      }`}
    >
      <p className="max-w-full truncate font-script text-3xl leading-none text-olive">{name}</p>
      <div className="mt-3 flex size-20 items-center justify-center rounded-full bg-ivory text-ink">
        {faceUp && choice ? (
          <span key={choice} className="animate-rise [animation-duration:500ms]">
            <ChoiceIcon choice={choice} />
          </span>
        ) : (
          <Heart className={`size-9 ${status === 'locked' ? 'fill-saffron text-saffron' : 'text-olive/30'}`} />
        )}
      </div>
      <p className="eyebrow mt-3 text-muted">
        {faceUp ? (choice ? LABELS[choice] : 'No pick') : status === 'locked' ? 'Locked in' : 'Choosing…'}
      </p>
    </div>
  )
}

export default function RockPaperScissors({ state, mySeat, opponentName, sendAction, showToast }) {
  const msLeft = useTimeLeft(state.timeLeftMs)
  const secondsLeft = Math.ceil(msLeft / 1000)
  const other = 1 - mySeat
  const { phase, revealed, history } = state
  const lastRound = history[history.length - 1]

  const choose = async (choice) => {
    const response = await sendAction({ type: 'choose', choice })
    if (!response.ok) showToast(response.message)
  }

  let headline = 'Make your choice'
  if (phase === 'choosing' && state.myChoice) headline = `Waiting for ${opponentName}`
  if (phase === 'countdown') headline = secondsLeft > 0 ? String(secondsLeft) : 'Go!'
  if (phase === 'reveal' && lastRound) {
    if (lastRound.winnerSeat === null) headline = 'A draw'
    else headline = lastRound.winnerSeat === mySeat ? 'You take the round' : `${opponentName} takes it`
  }

  const canChoose = phase === 'choosing' && !state.myChoice && !state.result

  return (
    <section className={`flex flex-1 flex-col ${state.result ? 'pb-56' : ''}`}>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 py-5">
        {/* Match header: best of N, and win "hearts" */}
        <div className="text-center">
          <p className="eyebrow text-muted">
            Best of {state.bestOf} · Round {NUMERALS[state.round - 1] ?? state.round}
          </p>
          <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <WinPips label="You" wins={state.scores[mySeat]} needed={state.winsNeeded} />
            <p className="font-display text-4xl text-ink">
              {state.scores[mySeat]}
              <span className="mx-2 text-gold">·</span>
              {state.scores[other]}
            </p>
            <WinPips label={opponentName} wins={state.scores[other]} needed={state.winsNeeded} alignRight />
          </div>
        </div>

        {/* Headline: instruction / countdown / round result */}
        <div className="flex min-h-20 flex-col items-center justify-center text-center">
          <h2
            key={`${phase}-${headline}`}
            className={`animate-rise [animation-duration:450ms] ${
              phase === 'countdown' ? 'font-display text-7xl text-olive' : 'font-script text-5xl text-olive'
            }`}
          >
            {headline}
          </h2>
          {phase === 'choosing' && (
            <p className="mt-1 font-display text-sm tracking-[0.2em] text-muted uppercase">{secondsLeft}s to choose</p>
          )}
        </div>

        {/* The two cards */}
        <div className="grid grid-cols-2 gap-3">
          <PlayerCard
            name="You"
            choice={phase === 'reveal' ? revealed?.[mySeat] : state.myChoice}
            faceUp={phase === 'reveal' || Boolean(state.myChoice)}
            status={state.myChoice ? 'locked' : 'choosing'}
            highlight={phase === 'reveal' && lastRound?.winnerSeat === mySeat}
          />
          <PlayerCard
            name={opponentName}
            choice={revealed?.[other]}
            faceUp={phase === 'reveal'}
            status={state.opponentLocked ? 'locked' : 'choosing'}
            highlight={phase === 'reveal' && lastRound?.winnerSeat === other}
          />
        </div>

        {/* Big buttons for thumbs */}
        <div className="grid grid-cols-3 gap-2.5">
          {CHOICES.map((choice) => {
            const picked = state.myChoice === choice
            return (
              <button
                key={choice}
                type="button"
                onClick={() => choose(choice)}
                disabled={!canChoose}
                aria-pressed={picked}
                className={`flex flex-col items-center gap-1.5 rounded-[24px] border py-4 transition duration-300 active:scale-95 ${
                  picked
                    ? 'border-olive bg-olive text-white'
                    : 'border-olive/25 bg-white text-ink enabled:hover:scale-[1.03] disabled:opacity-40'
                }`}
              >
                <ChoiceIcon choice={choice} className="size-10" />
                <span className="text-xs font-semibold tracking-[0.15em] uppercase">{LABELS[choice]}</span>
              </button>
            )
          })}
        </div>

        {/* Round-by-round results */}
        {history.length > 0 && (
          <div>
            <DashedDivider className="mx-auto w-32 text-olive/70" />
            <ol className="mt-3 divide-y divide-olive/10 rounded-[24px] border border-olive/15 bg-white px-4 shadow-soft">
              {history.map((round, index) => (
                <li key={index} className="grid grid-cols-[2rem_1fr_auto] items-center gap-2 py-2.5 text-sm">
                  <span className="font-display text-base text-muted">{NUMERALS[index] ?? index + 1}</span>
                  <span className="text-ink">
                    {round.choices[mySeat] ? LABELS[round.choices[mySeat]] : '—'}
                    <span className="mx-1.5 text-gold">vs</span>
                    {round.choices[other] ? LABELS[round.choices[other]] : '—'}
                  </span>
                  <span className="eyebrow text-olive">
                    {round.winnerSeat === null ? 'Draw' : round.winnerSeat === mySeat ? 'You' : opponentName}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </section>
  )
}

function WinPips({ label, wins, needed, alignRight = false }) {
  return (
    <div className={`min-w-0 ${alignRight ? 'text-right' : ''}`}>
      <p className="truncate font-script text-2xl leading-none text-olive">{label}</p>
      <p className={`mt-1 flex gap-0.5 ${alignRight ? 'justify-end' : ''}`} aria-label={`${wins} of ${needed} wins`}>
        {Array.from({ length: needed }, (_, index) => (
          <Heart key={index} className={`size-4 ${index < wins ? 'fill-saffron text-saffron' : 'text-olive/30'}`} />
        ))}
      </p>
    </div>
  )
}
