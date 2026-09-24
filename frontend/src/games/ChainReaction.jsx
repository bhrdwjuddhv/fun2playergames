// Chain Reaction screen.
//
// The SERVER owns the board and explodes it one wave at a time; this screen
// draws each wave as it arrives, with a flash, a soft click and a short
// vibration. Tapping a cell only asks — the server decides.

import { useEffect, useRef, useState } from 'react'
import { Heart } from '../components/Decor.jsx'

// Pick your own colours (kept on this device only).
const PALETTES = [
  { id: 'olive', name: 'Olive & Saffron', colors: ['#7f8d74', '#fab078'] },
  { id: 'gold', name: 'Gold & Ink', colors: ['#d4af37', '#2d342f'] },
  { id: 'clay', name: 'Terracotta & Sky', colors: ['#c0634a', '#6f8faf'] },
]

const read = (key, fallback) => {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

const write = (key, value) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    // ignore
  }
}

// A short click, made in the browser — no sound files to load.
// Browsers only allow sound after the person has tapped something, which is
// always true here (you tapped a cell to start the chain).
let audioContext = null

function playBlip(explosions) {
  try {
    audioContext ??= new (window.AudioContext ?? window.webkitAudioContext)()
    if (audioContext.state === 'suspended') audioContext.resume()
    const now = audioContext.currentTime
    const oscillator = audioContext.createOscillator()
    const gain = audioContext.createGain()
    // More cells bursting → a slightly higher, louder click.
    oscillator.frequency.setValueAtTime(220 + Math.min(explosions, 8) * 45, now)
    oscillator.frequency.exponentialRampToValueAtTime(110, now + 0.18)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2)
    oscillator.connect(gain).connect(audioContext.destination)
    oscillator.start(now)
    oscillator.stop(now + 0.22)
  } catch {
    // no sound on this device — not a problem
  }
}

// Where to put 1, 2, 3 or 4 orbs inside a cell.
const DOTS = [[], [[50, 50]], [[32, 50], [68, 50]], [[50, 30], [32, 66], [68, 66]], [[32, 32], [68, 32], [32, 68], [68, 68]]]

function Cell({ owner, count, critical, color, exploding, onTap, disabled, label }) {
  const dots = DOTS[Math.min(count, 4)] ?? DOTS[4]
  const nearlyFull = count > 0 && count === critical - 1

  return (
    <button
      type="button"
      onClick={onTap}
      disabled={disabled}
      aria-label={label}
      className={`relative rounded-[18%] border transition-colors duration-200 ${
        owner === null ? 'border-olive/15 bg-white' : 'border-transparent'
      } ${disabled ? '' : 'active:scale-95'}`}
      style={owner === null ? undefined : { backgroundColor: `${color}1f`, borderColor: `${color}66` }}
    >
      <span className={`absolute inset-0 ${exploding ? 'animate-boom' : ''} ${nearlyFull ? 'animate-pulse' : ''}`}>
        {dots.map(([x, y], index) => (
          <span
            key={index}
            className="absolute rounded-full"
            style={{
              left: `${x}%`,
              top: `${y}%`,
              width: '30%',
              height: '30%',
              transform: 'translate(-50%, -50%)',
              backgroundColor: color,
              boxShadow: `0 1px 3px ${color}66`,
            }}
          />
        ))}
      </span>
    </button>
  )
}

export default function ChainReaction({ state, mySeat, opponentName, sendAction, showToast }) {
  const [paletteId, setPaletteId] = useState(() => read('chain-palette', PALETTES[0].id))
  const [soundOn, setSoundOn] = useState(() => read('chain-sound', 'on') === 'on')
  const lastWave = useRef(state.wave)

  const palette = PALETTES.find((option) => option.id === paletteId) ?? PALETTES[0]
  const colorOf = (seat) => palette.colors[seat]
  const myTurn = state.turn === mySeat && state.phase === 'playing' && !state.result

  // A new wave arrived → flash, click, buzz.
  useEffect(() => {
    if (state.wave === lastWave.current) return
    lastWave.current = state.wave
    if (soundOn) playBlip(state.lastExplosions.length)
    // Vibration works on Android; iPhones simply ignore it.
    navigator.vibrate?.(Math.min(10 + state.lastExplosions.length * 4, 40))
  }, [state.wave, state.lastExplosions, soundOn])

  const tap = async (index) => {
    const response = await sendAction({ type: 'place', cell: index })
    if (!response.ok) showToast(response.message)
  }

  const exploding = new Set(state.lastExplosions)

  let status = `${opponentName}’s turn`
  if (state.phase === 'resolving') status = 'Chain reaction!'
  else if (state.result) status = 'Game over'
  else if (myTurn) status = 'Your turn'

  const cyclePalette = () => {
    const next = PALETTES[(PALETTES.findIndex((option) => option.id === palette.id) + 1) % PALETTES.length]
    setPaletteId(next.id)
    write('chain-palette', next.id)
    showToast(next.name)
  }

  const toggleSound = () => {
    setSoundOn((on) => {
      write('chain-sound', on ? 'off' : 'on')
      return !on
    })
  }

  return (
    <section className={`flex min-h-0 flex-1 flex-col ${state.result ? 'pb-56' : ''}`}>
      <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col gap-3 px-3 py-3">
        {/* Who is who, and how many orbs each has */}
        <div className="flex items-center justify-between gap-3">
          <Player name="You" orbs={state.orbs[mySeat]} color={colorOf(mySeat)} active={myTurn} />
          <div className="text-center">
            <h2
              key={status}
              className={`animate-rise [animation-duration:400ms] font-script text-3xl leading-none ${
                state.phase === 'resolving' ? 'text-saffron' : myTurn ? 'text-olive' : 'text-muted'
              }`}
            >
              {status}
            </h2>
          </div>
          <Player
            name={opponentName}
            orbs={state.orbs[1 - mySeat]}
            color={colorOf(1 - mySeat)}
            active={!myTurn && !state.result && state.phase === 'playing'}
            alignRight
          />
        </div>

        {/* The board. It keeps its shape on any screen. */}
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <div
            className="grid w-full gap-1.5 rounded-[24px] border border-olive/15 bg-ivory p-2 shadow-soft"
            style={{
              gridTemplateColumns: `repeat(${state.cols}, minmax(0, 1fr))`,
              aspectRatio: `${state.cols} / ${state.rows}`,
              maxHeight: '100%',
              width: `min(100%, ${(state.cols / state.rows) * 70}dvh)`,
            }}
          >
            {state.cells.map(([owner, count], index) => (
              <Cell
                key={index}
                owner={owner}
                count={count}
                critical={state.critical[index]}
                color={owner === null ? 'transparent' : colorOf(owner)}
                exploding={exploding.has(index)}
                disabled={!myTurn || (owner !== null && owner !== mySeat)}
                onTap={() => tap(index)}
                label={`Cell ${index + 1}${owner === null ? ', empty' : `, ${count} orbs`}`}
              />
            ))}
          </div>
        </div>

        {/* Little comforts: colours, sound */}
        {!state.result && (
          <div className="flex items-center justify-center gap-2">
            <button type="button" onClick={cyclePalette} className="btn-outline h-11 gap-2 px-4 text-xs">
              <span className="flex gap-1">
                {palette.colors.map((color) => (
                  <span key={color} className="size-3 rounded-full" style={{ backgroundColor: color }} />
                ))}
              </span>
              Colours
            </button>
            <button
              type="button"
              onClick={toggleSound}
              aria-pressed={soundOn}
              className="btn-outline h-11 px-4 text-xs"
            >
              {soundOn ? 'Sound on' : 'Sound off'}
            </button>
          </div>
        )}
      </div>
    </section>
  )
}

function Player({ name, orbs, color, active, alignRight = false }) {
  return (
    <div className={`min-w-0 ${alignRight ? 'text-right' : ''}`}>
      <p className={`flex items-center gap-1.5 ${alignRight ? 'justify-end' : ''}`}>
        <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="truncate font-script text-2xl leading-none text-olive">{name}</span>
      </p>
      <p className={`mt-0.5 flex items-center gap-1 font-display text-lg ${alignRight ? 'justify-end' : ''}`}>
        {orbs}
        {active && <Heart className="size-3 fill-saffron text-saffron" />}
      </p>
    </div>
  )
}
