// WeDraw screen. Three phases per round (the SERVER switches phases):
//   drawing  → draw your secret word
//   guessing → guess what your opponent drew
//   reveal   → see both words and drawings

import { useEffect, useRef, useState } from 'react'

// Must match COLOR_COUNT / SIZE_COUNT on the server. The last color is
// white = eraser.
const COLORS = ['#111827', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#92400e', '#ffffff']
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

const CANVAS_SIZE = { width: 'min(100%, 50dvh, 520px)' }

export default function WeDraw({ state, mySeat, opponentName, sendAction, showToast }) {
  const secondsLeft = useSecondsLeft(state.timeLeftMs)
  const other = 1 - mySeat

  const phaseLabel = { drawing: 'Draw!', guessing: 'Guess!', reveal: 'Round over', done: 'Game over' }[state.phase]

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-3 overflow-y-auto p-3">
      {/* Round / timer / scores */}
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="rounded-full bg-slate-800 px-3 py-1 font-semibold">
          Round {state.round}/{state.totalRounds} · {phaseLabel}
        </span>
        {(state.phase === 'drawing' || state.phase === 'guessing') && (
          <span
            className={`rounded-full px-3 py-1 font-mono text-base font-bold ${
              secondsLeft <= 5 ? 'bg-rose-500 text-white' : 'bg-slate-800'
            }`}
          >
            ⏱ {secondsLeft}s
          </span>
        )}
      </div>
      <div className="flex justify-between text-sm font-semibold">
        <span className="text-violet-300">You: {state.scores[mySeat]}</span>
        <span className="text-slate-300">
          {opponentName}: {state.scores[other]}
        </span>
      </div>

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
      <p className="text-center text-lg">
        Draw: <span className="font-black text-violet-300 uppercase">{state.myWord}</span>
        <span className="block text-xs text-slate-500">Don't write the word — draw it!</span>
      </p>

      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishStroke}
        onPointerCancel={finishStroke}
        // touch-none: stops the page from scrolling while you draw on a phone
        className="mx-auto aspect-square touch-none rounded-2xl bg-white shadow-lg"
        style={CANVAS_SIZE}
      />

      {/* Tools */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {COLORS.map((hex, index) => (
          <button
            key={hex}
            type="button"
            onClick={() => setColor(index)}
            aria-label={index === COLORS.length - 1 ? 'Eraser' : `Color ${index + 1}`}
            className={`flex size-9 items-center justify-center rounded-full ring-2 ring-offset-2 ring-offset-slate-950 ${
              color === index ? 'ring-violet-400' : 'ring-transparent'
            }`}
            style={{ background: hex }}
          >
            {index === COLORS.length - 1 && <span className="text-sm">🧽</span>}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-center gap-2">
        {SIZES.map((_, index) => (
          <button
            key={index}
            type="button"
            onClick={() => setSize(index)}
            aria-label={`Brush size ${index + 1}`}
            className={`flex size-11 items-center justify-center rounded-xl ${
              size === index ? 'bg-violet-500' : 'bg-slate-800'
            }`}
          >
            <span className="rounded-full bg-white" style={{ width: 6 + index * 7, height: 6 + index * 7 }} />
          </button>
        ))}
        <button type="button" onClick={undo} className="h-11 rounded-xl bg-slate-800 px-4 font-semibold">
          ↶ Undo
        </button>
        <button type="button" onClick={clear} className="h-11 rounded-xl bg-slate-800 px-4 font-semibold">
          Clear
        </button>
      </div>
    </>
  )
}

// A drawing you can only look at (their drawing, or the reveal).
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

  return <canvas ref={canvasRef} className={`aspect-square rounded-2xl bg-white ${className}`} style={style} />
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
      showToast(`Correct! +${response.result.points}`)
    } else {
      setWrong(true)
      setGuess('')
    }
  }

  return (
    <>
      <p className="text-center">
        What did <span className="font-bold">{opponentName}</span> draw?
      </p>

      <DrawingView strokes={state.theirDrawing} className="mx-auto shadow-lg" style={CANVAS_SIZE} />

      {/* "___ _____" = letters and spaces of the word */}
      <p className="text-center font-mono text-2xl tracking-[0.35em]">{state.hint}</p>

      {iGuessed ? (
        <p className="rounded-xl bg-emerald-500/15 p-3 text-center font-semibold text-emerald-300">
          ✓ You got it: <span className="uppercase">{state.theirWord}</span> (+{state.roundPoints[mySeat]})
        </p>
      ) : (
        // position: sticky keeps the input above the phone keyboard area.
        <form onSubmit={submit} className="sticky bottom-0 flex gap-2 bg-slate-950 py-1">
          <input
            value={guess}
            onChange={(event) => {
              setGuess(event.target.value)
              setWrong(false)
            }}
            maxLength={50}
            placeholder={wrong ? 'Nope — try again' : 'Type your guess'}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            enterKeyHint="send"
            className={`h-12 min-w-0 flex-1 rounded-xl bg-slate-800 px-4 text-lg outline-none focus:ring-2 ${
              wrong ? 'ring-2 ring-rose-500' : 'ring-violet-400'
            }`}
          />
          <button type="submit" className="h-12 rounded-xl bg-violet-500 px-5 font-bold text-white">
            Guess
          </button>
        </form>
      )}

      {theyGuessed && <p className="text-center text-sm text-emerald-300">{opponentName} guessed your word!</p>}
    </>
  )
}

function RevealPhase({ state, mySeat, opponentName }) {
  const other = 1 - mySeat
  const cards = [
    { title: 'You drew', seat: mySeat, pointsLabel: `${opponentName} got +${state.roundPoints[other]}` },
    { title: `${opponentName} drew`, seat: other, pointsLabel: `You got +${state.roundPoints[mySeat]}` },
  ]

  return (
    <div className={`grid grid-cols-2 gap-3 ${state.phase === 'done' ? 'pb-48' : ''}`}>
      {cards.map((card) => (
        <div key={card.seat} className="flex flex-col gap-1.5 text-center">
          <p className="text-sm text-slate-400">{card.title}</p>
          <p className="font-black text-violet-300 uppercase">{state.words[card.seat]}</p>
          <DrawingView strokes={state.drawings[card.seat]} className="w-full" />
          <p className="text-xs text-slate-400">{card.pointsLabel}</p>
        </div>
      ))}
    </div>
  )
}
