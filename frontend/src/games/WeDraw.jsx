// WeDraw screen. Three phases per round (the SERVER switches phases):
//   drawing  → draw your secret word
//   guessing → guess what your opponent drew
//   reveal   → see both words and drawings

import { useEffect, useRef, useState } from 'react'
import { DashedDivider } from '../components/Decor.jsx'

// Must match COLOR_COUNT / SIZE_COUNT on the server (9 colors, 3 sizes).
// A muted palette that fits the design; the last color is white = eraser.
const COLORS = ['#2d342f', '#7f8d74', '#c0634a', '#fab078', '#d4af37', '#6f8faf', '#8a5a7a', '#8b6b4a', '#ffffff']
const SIZES = [0.008, 0.02, 0.045] // brush width as a fraction of the canvas width
const MAX_POINTS_PER_STROKE = 400

// Points are stored as fractions (0..1) of the canvas, so a drawing made on a
// phone looks the same on a laptop. Here we turn them into real pixels.
function drawStroke(ctx, stroke, width, height) {
  const { points } = stroke
  ctx.strokeStyle = COLORS[stroke.color]
  ctx.fillStyle = COLORS[stroke.color]
  ctx.lineWidth = SIZES[stroke.size] * width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  if (points.length === 2) {
    // A single tap = a dot.
    ctx.beginPath()
    ctx.arc(points[0] * width, points[1] * height, ctx.lineWidth / 2, 0, Math.PI * 2)
    ctx.fill()
    return
  }
  ctx.beginPath()
  ctx.moveTo(points[0] * width, points[1] * height)
  for (let i = 2; i < points.length; i += 2) {
    ctx.lineTo(points[i] * width, points[i + 1] * height)
  }
  ctx.stroke()
}

// Clears the canvas (white "paper") and draws every stroke again.
// The canvas gets real pixels for the screen (devicePixelRatio), so lines
// are sharp on phones.
function renderDrawing(canvas, strokes) {
  const ratio = window.devicePixelRatio || 1
  canvas.width = Math.round(canvas.clientWidth * ratio)
  canvas.height = Math.round(canvas.clientHeight * ratio)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  for (const stroke of strokes) drawStroke(ctx, stroke, canvas.width, canvas.height)
}

// Counts down locally between server updates.
function useSecondsLeft(timeLeftMs) {
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(timeLeftMs / 1000))
  useEffect(() => {
    const deadline = Date.now() + timeLeftMs
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)))
    tick()
    const interval = setInterval(tick, 250)
    return () => clearInterval(interval)
  }, [timeLeftMs])
  return secondsLeft
}

const CANVAS_SIZE = { width: 'min(100%, 48dvh, 500px)' }

const PHASE_TITLES = {
  drawing: 'Draw your word',
  guessing: 'Guess their drawing',
  reveal: 'The reveal',
  done: 'The final gallery',
}

export default function WeDraw({ state, mySeat, opponentName, sendAction, showToast }) {
  const secondsLeft = useSecondsLeft(state.timeLeftMs)
  const other = 1 - mySeat
  const timed = state.phase === 'drawing' || state.phase === 'guessing'

  return (
    <section className="flex flex-1 flex-col bg-white">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 py-5">
        {/* Round, phase and timer */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="eyebrow text-muted">
              Round {state.round} of {state.totalRounds}
            </p>
            <h2 key={state.phase} className="animate-rise font-script text-4xl leading-tight text-olive">
              {PHASE_TITLES[state.phase]}
            </h2>
          </div>
          {timed && (
            <span
              className={`flex size-14 shrink-0 items-center justify-center rounded-full border font-display text-2xl transition-colors duration-500 ${
                secondsLeft <= 5 ? 'border-saffron bg-saffron text-ink' : 'border-olive/40 text-ink'
              }`}
              aria-label={`${secondsLeft} seconds left`}
            >
              {secondsLeft}
            </span>
          )}
        </div>

        <p className="text-center font-display text-lg tracking-[0.15em] uppercase">
          <span className="text-olive">You {state.scores[mySeat]}</span>
          <span className="mx-2 text-gold">·</span>
          <span className="text-muted">
            {opponentName} {state.scores[other]}
          </span>
        </p>
        <DashedDivider className="mx-auto -mt-1 w-32 text-olive/70" />

        {/* A new `key` per round → fresh canvas every round */}
        {state.phase === 'drawing' && (
          <DrawPhase key={state.round} state={state} sendAction={sendAction} showToast={showToast} />
        )}
        {state.phase === 'guessing' && (
          <GuessPhase
            key={state.round}
            state={state}
            mySeat={mySeat}
            opponentName={opponentName}
            sendAction={sendAction}
            showToast={showToast}
          />
        )}
        {(state.phase === 'reveal' || state.phase === 'done') && (
          <RevealPhase state={state} mySeat={mySeat} opponentName={opponentName} />
        )}
      </div>
    </section>
  )
}

function DrawPhase({ state, sendAction, showToast }) {
  const canvasRef = useRef(null)
  // Our strokes live in a ref (not state): drawing changes them many times
  // per second, and they're painted directly on the canvas — no re-render needed.
  // Starts with what the server has, so a refresh doesn't lose the drawing.
  // (A copy, because we change this array and must not change the props.)
  const strokesRef = useRef([...(state.myDrawing ?? [])])
  const currentStrokeRef = useRef(null)
  const [color, setColor] = useState(0)
  const [size, setSize] = useState(1)

  useEffect(() => {
    const canvas = canvasRef.current
    const redraw = () => renderDrawing(canvas, strokesRef.current)
    redraw()
    // Redraw when the canvas changes size (phone rotated, window resized).
    const observer = new ResizeObserver(redraw)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  const toPoint = (event) => {
    const rect = canvasRef.current.getBoundingClientRect()
    return [(event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height]
  }

  const paint = (stroke) => {
    const canvas = canvasRef.current
    drawStroke(canvas.getContext('2d'), stroke, canvas.width, canvas.height)
  }

  // A finished stroke is sent to the server right away, so the server has
  // the whole drawing when the timer runs out.
  const finishStroke = () => {
    const stroke = currentStrokeRef.current
    if (!stroke) return
    currentStrokeRef.current = null
    strokesRef.current.push(stroke)
    sendAction({ type: 'stroke', ...stroke }).then((response) => {
      if (!response.ok) showToast(response.message)
    })
  }

  const onPointerDown = (event) => {
    // Keep receiving moves even if the finger slides off the canvas.
    event.currentTarget.setPointerCapture(event.pointerId)
    const stroke = { color, size, points: toPoint(event) }
    currentStrokeRef.current = stroke
    paint(stroke)
  }

  const onPointerMove = (event) => {
    const stroke = currentStrokeRef.current
    if (!stroke) return
    const [x, y] = toPoint(event)
    const { points } = stroke
    const lastX = points[points.length - 2]
    const lastY = points[points.length - 1]
    if (Math.hypot(x - lastX, y - lastY) < 0.004) return // skip tiny moves (smaller messages)

    points.push(x, y)
    paint({ ...stroke, points: [lastX, lastY, x, y] }) // only paint the new piece

    // Very long line → send it and continue with a new stroke from here.
    if (points.length >= MAX_POINTS_PER_STROKE * 2) {
      finishStroke()
      currentStrokeRef.current = { color: stroke.color, size: stroke.size, points: [x, y] }
    }
  }

  const undo = () => {
    strokesRef.current.pop()
    renderDrawing(canvasRef.current, strokesRef.current)
    sendAction({ type: 'undo' })
  }

  const clear = () => {
    strokesRef.current = []
    renderDrawing(canvasRef.current, strokesRef.current)
    sendAction({ type: 'clear' })
  }

  return (
    <>
      <div className="text-center">
        <p className="eyebrow text-muted">Your secret word</p>
        <p className="font-display text-3xl tracking-[0.12em] text-olive uppercase">{state.myWord}</p>
        <p className="font-script text-2xl text-muted">draw it — don’t write it</p>
      </div>

      {/* Not rotated: a rotated canvas would make the finger position wrong. */}
      <div className="photo-frame mx-auto" style={CANVAS_SIZE}>
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          // touch-none: stops the page from scrolling while you draw on a phone
          className="aspect-square w-full touch-none rounded-sm bg-white ring-1 ring-ink/5"
        />
      </div>

      {/* Tools */}
      <div className="flex flex-wrap items-center justify-center gap-2.5">
        {COLORS.map((hex, index) => {
          const isEraser = index === COLORS.length - 1
          return (
            <button
              key={hex}
              type="button"
              onClick={() => setColor(index)}
              aria-label={isEraser ? 'Eraser' : `Color ${index + 1}`}
              aria-pressed={color === index}
              className={`flex size-9 items-center justify-center rounded-full ring-offset-2 transition duration-300 ${
                color === index ? 'scale-110 ring-2 ring-olive' : 'ring-1 ring-olive/20'
              }`}
              style={{ background: hex }}
            >
              {isEraser && <span className="font-display text-xs text-muted">E</span>}
            </button>
          )
        })}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {SIZES.map((_, index) => (
          <button
            key={index}
            type="button"
            onClick={() => setSize(index)}
            aria-label={`Brush size ${index + 1}`}
            aria-pressed={size === index}
            className={`flex size-11 items-center justify-center rounded-full border transition duration-300 ${
              size === index ? 'border-olive bg-olive' : 'border-olive/25 bg-ivory'
            }`}
          >
            <span
              className={`rounded-full ${size === index ? 'bg-white' : 'bg-ink'}`}
              style={{ width: 5 + index * 7, height: 5 + index * 7 }}
            />
          </button>
        ))}
        <button type="button" onClick={undo} className="btn-outline h-11 px-5 text-xs">
          Undo
        </button>
        <button type="button" onClick={clear} className="btn-outline h-11 px-5 text-xs">
          Clear
        </button>
      </div>
    </>
  )
}

// A drawing you can only look at, shown like a printed photograph.
function DrawingView({ strokes, className = '', style }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const redraw = () => renderDrawing(canvas, strokes)
    redraw()
    const observer = new ResizeObserver(redraw)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [strokes])

  return (
    <div className={`photo-frame ${className}`} style={style}>
      <canvas ref={canvasRef} className="aspect-square w-full rounded-sm bg-white ring-1 ring-ink/5" />
    </div>
  )
}

function GuessPhase({ state, mySeat, opponentName, sendAction, showToast }) {
  const [guess, setGuess] = useState('')
  const [wrong, setWrong] = useState(false)
  const iGuessed = state.guessed[mySeat]
  const theyGuessed = state.guessed[1 - mySeat]

  const submit = async (event) => {
    event.preventDefault()
    if (!guess.trim()) return
    const response = await sendAction({ type: 'guess', text: guess })
    if (!response.ok) {
      showToast(response.message)
      return
    }
    if (response.result?.correct) {
      showToast(`Correct — +${response.result.points}`)
    } else {
      setWrong(true)
      setGuess('')
    }
  }

  return (
    <>
      <p className="text-center font-display text-lg text-muted italic">What did {opponentName} draw?</p>

      <DrawingView strokes={state.theirDrawing} className="mx-auto -rotate-1" style={CANVAS_SIZE} />

      {/* "___ _____" = letters and spaces of the word */}
      <p className="text-center font-display text-3xl tracking-[0.35em] text-ink" aria-label="Word length hint">
        {state.hint}
      </p>

      {iGuessed ? (
        <p className="rounded-[24px] bg-ivory p-4 text-center">
          <span className="font-script text-3xl text-olive">Beautifully guessed</span>
          <span className="mt-1 block font-display text-lg tracking-[0.12em] uppercase">
            {state.theirWord} <span className="text-gold">+{state.roundPoints[mySeat]}</span>
          </span>
        </p>
      ) : (
        // position: sticky keeps the input visible above the phone keyboard.
        <form onSubmit={submit} className="sticky bottom-0 flex gap-2 bg-white py-2">
          <input
            value={guess}
            onChange={(event) => {
              setGuess(event.target.value)
              setWrong(false)
            }}
            maxLength={50}
            placeholder={wrong ? 'Not quite — try again' : 'Your guess'}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            enterKeyHint="send"
            className={`h-13 min-w-0 flex-1 rounded-full border bg-ivory px-5 font-display text-xl outline-none transition-colors ${
              wrong ? 'border-saffron placeholder:text-saffron' : 'border-olive/30 focus:border-olive'
            }`}
          />
          <button type="submit" className="btn-primary px-6">
            Guess
          </button>
        </form>
      )}

      {theyGuessed && (
        <p className="text-center font-script text-2xl text-olive">{opponentName} guessed your word</p>
      )}
    </>
  )
}

function RevealPhase({ state, mySeat, opponentName }) {
  const other = 1 - mySeat
  const cards = [
    { title: 'You drew', seat: mySeat, tilt: '-rotate-2', note: `${opponentName} +${state.roundPoints[other]}` },
    { title: `${opponentName} drew`, seat: other, tilt: 'rotate-2', note: `You +${state.roundPoints[mySeat]}` },
  ]

  return (
    <div className={`grid grid-cols-2 gap-4 pt-2 ${state.phase === 'done' ? 'pb-56' : ''}`}>
      {cards.map((card, index) => (
        <figure
          key={card.seat}
          className="flex animate-rise flex-col items-center text-center"
          style={{ animationDelay: `${index * 150}ms` }}
        >
          <figcaption className="eyebrow mb-2 max-w-full truncate text-muted">{card.title}</figcaption>
          <DrawingView strokes={state.drawings[card.seat]} className={`w-full ${card.tilt}`} />
          <p className="mt-3 font-script text-3xl leading-none text-olive">{state.words[card.seat]}</p>
          <p className="mt-1 font-display text-sm tracking-[0.12em] text-muted uppercase">{card.note}</p>
        </figure>
      ))}
    </div>
  )
}
