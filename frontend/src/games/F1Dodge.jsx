// F1 Dodge Race screen.
//
// The SERVER runs the race (obstacles, collisions, lives, score) and sends
// a snapshot 20 times a second. This screen:
//   - draws the snapshot on a canvas at 60 fps, moving obstacles forward
//     smoothly between snapshots (so it doesn't look jumpy)
//   - moves YOUR car immediately when you tap (feels instant), and tells
//     the server which lane you want. The server decides collisions.

import { useEffect, useRef } from 'react'
import { Heart } from '../components/Decor.jsx'

// Colors from the design palette.
const CAR_COLORS = ['#fab078', '#f9f8f6'] // seat 0 saffron, seat 1 ivory
const ROAD = '#2d342f'

function drawCar(ctx, centerX, top, laneWidth, carHeight, color) {
  const width = laneWidth * 0.42
  const left = centerX - width / 2

  // wheels
  ctx.fillStyle = '#0a0a0a'
  for (const wheelTop of [top + carHeight * 0.12, top + carHeight * 0.66]) {
    ctx.fillRect(left - width * 0.1, wheelTop, width * 0.22, carHeight * 0.22)
    ctx.fillRect(left + width * 0.88, wheelTop, width * 0.22, carHeight * 0.22)
  }

  ctx.fillStyle = color
  ctx.fillRect(centerX - width * 0.18, top, width * 0.36, carHeight)                    // nose → tail
  ctx.fillRect(left, top + carHeight * 0.02, width, carHeight * 0.08)                   // front wing
  ctx.fillRect(centerX - width * 0.34, top + carHeight * 0.38, width * 0.68, carHeight * 0.34) // side pods
  ctx.fillRect(left + width * 0.05, top + carHeight * 0.88, width * 0.9, carHeight * 0.12)     // rear wing

  // cockpit
  ctx.fillStyle = '#0b0b0f'
  ctx.beginPath()
  ctx.ellipse(centerX, top + carHeight * 0.45, width * 0.1, carHeight * 0.1, 0, 0, Math.PI * 2)
  ctx.fill()
}

function drawObstacle(ctx, type, laneLeft, top, laneWidth, height) {
  const centerX = laneLeft + laneWidth / 2

  if (type === 'car') {
    const width = laneWidth * 0.46
    ctx.fillStyle = '#8a9480'
    ctx.fillRect(centerX - width / 2, top, width, height)
    ctx.fillStyle = '#d4af37'
    ctx.fillRect(centerX - width * 0.35, top + height * 0.18, width * 0.7, height * 0.22) // windscreen
  } else if (type === 'barrier') {
    const width = laneWidth * 0.78
    const stripes = 6
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 ? '#ffffff' : '#7f8d74'
      ctx.fillRect(centerX - width / 2 + (width / stripes) * i, top + height * 0.25, width / stripes, height * 0.5)
    }
  } else if (type === 'oil') {
    ctx.fillStyle = '#151a17'
    ctx.beginPath()
    ctx.ellipse(centerX, top + height / 2, laneWidth * 0.26, height * 0.45, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(249,248,246,0.25)' // shine
    ctx.beginPath()
    ctx.ellipse(centerX - laneWidth * 0.07, top + height * 0.35, laneWidth * 0.07, height * 0.1, 0, 0, Math.PI * 2)
    ctx.fill()
  } else {
    // cone
    const width = laneWidth * 0.26
    ctx.fillStyle = '#d4af37'
    ctx.beginPath()
    ctx.moveTo(centerX, top)
    ctx.lineTo(centerX + width / 2, top + height)
    ctx.lineTo(centerX - width / 2, top + height)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(centerX - width * 0.22, top + height * 0.45, width * 0.44, height * 0.14)
  }
}

export default function F1Dodge({ state, mySeat, opponentName, sendAction }) {
  const canvasRef = useRef(null)
  // Refs (not state) because the drawing loop reads them 60 times a second
  // and they must not cause React re-renders.
  const latestRef = useRef({ state, receivedAt: performance.now() })
  const myLaneRef = useRef(state.cars[mySeat].lane)
  const lastInputAtRef = useRef(0)

  // Every new server snapshot: remember it and when it arrived.
  useEffect(() => {
    latestRef.current = { state, receivedAt: performance.now() }
    // Normally we trust our own lane (instant response). But if we haven't
    // pressed anything for a moment and the server disagrees (e.g. a message
    // was lost), use the server's lane — the server is the referee.
    if (performance.now() - lastInputAtRef.current > 500) {
      myLaneRef.current = state.cars[mySeat].lane
    }
  }, [state, mySeat])

  // The drawing loop.
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let frameId
    let lastFrameAt = performance.now()
    let roadOffset = 0
    let kerbOffset = 0
    const carX = [null, null] // smoothed x position per seat

    const frame = (now) => {
      frameId = requestAnimationFrame(frame)
      const seconds = Math.min(0.1, (now - lastFrameAt) / 1000)
      lastFrameAt = now

      const { state: snapshot, receivedAt } = latestRef.current
      const { lanes, carY, carHeight, obstacleHeight } = snapshot.config
      const running = !snapshot.result

      // Match the canvas pixels to its size on screen (sharp on phones).
      const ratio = window.devicePixelRatio || 1
      const width = Math.round(canvas.clientWidth * ratio)
      const height = Math.round(canvas.clientHeight * ratio)
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
      const laneWidth = width / lanes

      // Road + moving lane markings (this is what makes it feel fast).
      ctx.fillStyle = ROAD
      ctx.fillRect(0, 0, width, height)
      const dash = height * 0.08
      const gap = height * 0.06
      const moved = running ? snapshot.speed * seconds * height : 0
      roadOffset = (roadOffset + moved) % (dash + gap)
      kerbOffset = (kerbOffset + moved) % (dash * 2)
      ctx.fillStyle = 'rgba(249,248,246,0.4)'
      for (let lane = 1; lane < lanes; lane++) {
        const x = lane * laneWidth - 2 * ratio
        for (let y = roadOffset - dash; y < height; y += dash + gap) {
          ctx.fillRect(x, y, 4 * ratio, dash)
        }
      }
      // olive/white kerbs on both sides
      for (let i = 0, y = kerbOffset - dash * 2; y < height; i++, y += dash) {
        ctx.fillStyle = i % 2 ? '#f9f8f6' : '#7f8d74'
        ctx.fillRect(0, y, 5 * ratio, dash)
        ctx.fillRect(width - 5 * ratio, y, 5 * ratio, dash)
      }

      // Obstacles: server position + how far they moved since that snapshot.
      const movedSinceSnapshot = running ? ((now - receivedAt) / 1000) * snapshot.speed : 0
      for (const obstacle of snapshot.obstacles) {
        const top = (obstacle.y + movedSinceSnapshot) * height
        drawObstacle(ctx, obstacle.type, obstacle.lane * laneWidth, top, laneWidth, obstacleHeight * height)
      }

      // Cars: opponent first (see-through), then mine on top.
      const seats = mySeat === 0 ? [1, 0] : [0, 1]
      for (const seat of seats) {
        const car = snapshot.cars[seat]
        const lane = seat === mySeat ? myLaneRef.current : car.lane
        const targetX = lane * laneWidth + laneWidth / 2
        // Slide smoothly towards the lane instead of jumping.
        carX[seat] = carX[seat] === null ? targetX : carX[seat] + (targetX - carX[seat]) * Math.min(1, seconds * 16)

        let alpha = seat === mySeat ? 1 : 0.5
        if (!car.alive) alpha = 0.2
        else if (car.invincible && Math.floor(now / 120) % 2) alpha *= 0.3 // blink after a hit
        ctx.globalAlpha = alpha
        drawCar(ctx, carX[seat], carY * height, laneWidth, carHeight * height, CAR_COLORS[seat])
        ctx.globalAlpha = 1
      }
    }

    frameId = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(frameId)
  }, [mySeat])

  // Change lane by -1 (left) or +1 (right).
  const steer = (direction) => {
    const snapshot = latestRef.current.state
    if (snapshot.result || !snapshot.cars[mySeat].alive) return
    const lane = Math.min(snapshot.config.lanes - 1, Math.max(0, myLaneRef.current + direction))
    if (lane === myLaneRef.current) return
    myLaneRef.current = lane
    lastInputAtRef.current = performance.now()
    sendAction({ type: 'lane', lane }) // no await: don't slow down the controls
  }

  // Keyboard: ← → or A / D
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'ArrowLeft' || event.key === 'a') steer(-1)
      if (event.key === 'ArrowRight' || event.key === 'd') steer(1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  // Tapping the left/right half of the road also steers.
  const onCanvasPointerDown = (event) => {
    const rect = event.currentTarget.getBoundingClientRect()
    steer(event.clientX - rect.left < rect.width / 2 ? -1 : 1)
  }

  const me = state.cars[mySeat]
  const opponent = state.cars[1 - mySeat]

  return (
    // The race is the most dramatic screen: full olive background.
    <section className="flex min-h-0 flex-1 flex-col bg-olive text-white">
      <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col gap-3 px-3 pt-3 pb-3">
        {/* Scoreboard */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <Driver label="You" color={CAR_COLORS[mySeat]} car={me} />
          <div className="text-center">
            <p className="eyebrow text-white/70">Seconds</p>
            <p className="font-display text-4xl leading-none">{Math.ceil(state.timeLeftMs / 1000)}</p>
          </div>
          <Driver label={opponentName} color={CAR_COLORS[1 - mySeat]} car={opponent} alignRight />
        </div>

        {/* The track, framed with a thin white border like an editorial photo */}
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-[28px] shadow-deep">
          <canvas ref={canvasRef} onPointerDown={onCanvasPointerDown} className="size-full touch-none" />
          <div className="pointer-events-none absolute inset-2.5 rounded-[20px] border border-white/50" />
          {!me.alive && !state.result && (
            <div className="absolute inset-x-6 top-1/3 animate-rise rounded-[24px] bg-white/95 p-5 text-center text-ink shadow-deep">
              <p className="font-script text-5xl text-olive">Out of lives</p>
              <p className="mt-1 font-display text-sm tracking-[0.15em] text-muted uppercase">
                {opponentName} is still racing
              </p>
            </div>
          )}
        </div>

        {/* Big thumb buttons for phones */}
        {!state.result && (
          <div className="grid grid-cols-2 gap-3">
            <SteerButton label="Steer left" onPress={() => steer(-1)} flip />
            <SteerButton label="Steer right" onPress={() => steer(1)} />
          </div>
        )}
        {state.result && <div className="h-52 shrink-0" /> /* room for the result sheet */}
      </div>
    </section>
  )
}

function Driver({ label, color, car, alignRight = false }) {
  return (
    <div className={`min-w-0 ${alignRight ? 'text-right' : ''}`}>
      <p className={`flex items-center gap-1.5 ${alignRight ? 'justify-end' : ''}`}>
        <span className="size-2.5 shrink-0 rounded-full ring-1 ring-white/60" style={{ background: color }} />
        <span className="truncate font-script text-3xl leading-none">{label}</span>
      </p>
      <p className={`mt-1 flex gap-0.5 ${alignRight ? 'justify-end' : ''}`} aria-label={`${car.lives} lives`}>
        {[0, 1, 2].map((index) => (
          <Heart key={index} className={`size-4 ${index < car.lives ? 'fill-saffron text-saffron' : 'text-white/40'}`} />
        ))}
      </p>
      <p className="font-display text-lg tracking-[0.1em]">{car.alive ? car.score : 'Out'}</p>
    </div>
  )
}

function SteerButton({ label, onPress, flip = false }) {
  return (
    <button
      type="button"
      // onPointerDown (not onClick) reacts the moment the finger touches.
      onPointerDown={onPress}
      aria-label={label}
      className="flex h-20 touch-none items-center justify-center rounded-full border border-white/40 bg-white/10 transition duration-200 select-none active:scale-95 active:bg-white/25"
    >
      <svg viewBox="0 0 24 24" className={`size-8 ${flip ? '-scale-x-100' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 5l7 7-7 7" />
      </svg>
    </button>
  )
}
