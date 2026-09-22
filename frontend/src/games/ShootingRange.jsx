// Shooting Range screen (Accuracy Duel and Co-Op Survival).
//
// Targets and enemies move in straight lines. The server sends where each
// one started, its speed and its age, so this screen can draw it at 60fps
// without constant updates. A tap sends "I shot at (x, y)"; the SERVER
// decides if it hit.

import { useEffect, useRef } from 'react'
import { useTimeLeft } from './useTimeLeft.js'

const SEAT_COLORS = ['#fab078', '#7f8d74'] // saffron, olive
const COLORS = { ivory: '#f9f8f6', olive: '#7f8d74', ink: '#2d342f', gold: '#d4af37', saffron: '#fab078', muted: '#5c635e' }

// Where a mover is right now (in arena units).
function positionNow(mover, now) {
  const seconds = (now - mover.localBornAt) / 1000
  return { x: mover.x0 + mover.vx * seconds, y: mover.y0 + mover.vy * seconds }
}

function drawTarget(ctx, x, y, r, lifeLeft) {
  // Concentric rings, like a paper target.
  const rings = [
    [1, '#ffffff'],
    [0.72, COLORS.olive],
    [0.5, '#ffffff'],
    [0.28, COLORS.saffron],
  ]
  for (const [scale, color] of rings) {
    ctx.beginPath()
    ctx.arc(x, y, r * scale, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
  }
  ctx.lineWidth = r * 0.06
  ctx.strokeStyle = COLORS.ink
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.stroke()
  // A gold arc that shrinks as the target's time runs out.
  if (lifeLeft !== undefined) {
    ctx.lineWidth = r * 0.12
    ctx.strokeStyle = COLORS.gold
    ctx.beginPath()
    ctx.arc(x, y, r * 1.18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * lifeLeft)
    ctx.stroke()
  }
}

function drawEnemy(ctx, x, y, r, hp, maxHp) {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = COLORS.ink
  ctx.fill()
  // Armored enemies (2 hp) get a gold ring; it turns thin once cracked.
  if (maxHp > 1) {
    ctx.lineWidth = hp > 1 ? r * 0.28 : r * 0.1
    ctx.strokeStyle = COLORS.gold
    ctx.beginPath()
    ctx.arc(x, y, r * 0.86, 0, Math.PI * 2)
    ctx.stroke()
  }
  // small "eye"
  ctx.beginPath()
  ctx.arc(x, y, r * 0.28, 0, Math.PI * 2)
  ctx.fillStyle = COLORS.saffron
  ctx.fill()
}

function drawCore(ctx, core, unit, hpFraction) {
  const x = core.x * unit
  const y = core.y * unit
  const r = core.r * unit
  ctx.beginPath()
  ctx.arc(x, y, r * 1.9, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(127,141,116,0.12)'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.lineWidth = r * 0.14
  ctx.strokeStyle = 'rgba(127,141,116,0.25)'
  ctx.stroke()
  // health ring
  ctx.strokeStyle = hpFraction > 0.3 ? COLORS.olive : COLORS.saffron
  ctx.beginPath()
  ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * hpFraction)
  ctx.stroke()
  // a small heart in the middle
  ctx.fillStyle = COLORS.gold
  ctx.font = `${r * 0.9}px Forum, serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('♥', x, y + r * 0.05)
}

// Paper background with faint dashed guide circles.
function drawArena(ctx, width, height, ratio) {
  ctx.fillStyle = COLORS.ivory
  ctx.fillRect(0, 0, width, height)
  ctx.setLineDash([6 * ratio, 8 * ratio])
  ctx.lineWidth = ratio
  ctx.strokeStyle = 'rgba(127,141,116,0.22)'
  for (const scale of [0.22, 0.4, 0.58]) {
    ctx.beginPath()
    ctx.arc(width / 2, height / 2, width * scale, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.setLineDash([])
}

export default function ShootingRange({ state, mySeat, opponentName, sendAction, showToast }) {
  const wrapperRef = useRef(null)
  const canvasRef = useRef(null)
  // Refs: the drawing loop reads these 60x a second without re-rendering React.
  const moversRef = useRef([])
  const hiddenIdsRef = useRef(new Set()) // hit on this screen, before the server confirms
  const effectsRef = useRef([])          // tap ripples and "+150" labels
  const stateRef = useRef(state)

  const coop = state.mode === 'coop'
  const finished = Boolean(state.result)
  const msLeft = useTimeLeft(coop ? state.breakLeftMs : state.timeLeftMs)

  // Every server update: remember when each mover appeared (on OUR clock).
  useEffect(() => {
    const now = performance.now()
    const list = coop ? state.enemies : state.targets
    moversRef.current = list.map((mover) => ({ ...mover, localBornAt: now - mover.ageMs }))
    stateRef.current = state
    // Partner's shots (co-op) → small ripples in their color.
    if (coop) {
      for (const shot of state.recentShots) {
        if (shot.seat === mySeat) continue
        const key = `${shot.x}:${shot.y}`
        if (effectsRef.current.some((effect) => effect.key === key)) continue
        effectsRef.current.push({ key, x: shot.x, y: shot.y, startedAt: now, color: SEAT_COLORS[shot.seat], label: null })
      }
    }
  }, [state, coop, mySeat])

  // Drawing loop (only while the canvas is on screen, not on the results card).
  useEffect(() => {
    if (finished) return
    const canvas = canvasRef.current
    const wrapper = wrapperRef.current
    const ctx = canvas.getContext('2d')
    let frameId

    const frame = () => {
      frameId = requestAnimationFrame(frame)
      const now = performance.now()
      const current = stateRef.current
      const arenaHeight = current.arenaHeight

      // Fit a 3:4 arena into the space available.
      const cssWidth = Math.min(wrapper.clientWidth, wrapper.clientHeight / arenaHeight)
      const cssHeight = cssWidth * arenaHeight
      if (canvas.style.width !== `${cssWidth}px`) {
        canvas.style.width = `${cssWidth}px`
        canvas.style.height = `${cssHeight}px`
      }
      const ratio = window.devicePixelRatio || 1
      const width = Math.round(cssWidth * ratio)
      const height = Math.round(cssHeight * ratio)
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
      const unit = width // 1 arena unit = the full width

      drawArena(ctx, width, height, ratio)
      if (current.mode === 'coop') drawCore(ctx, current.core, unit, current.coreHp / current.coreMaxHp)

      for (const mover of moversRef.current) {
        if (hiddenIdsRef.current.has(mover.id)) continue
        const age = now - mover.localBornAt
        const { x, y } = positionNow(mover, now)
        if (current.mode === 'coop') {
          drawEnemy(ctx, x * unit, y * unit, mover.r * unit, mover.hp, mover.maxHp)
        } else {
          if (age > mover.ttl) continue // expired
          drawTarget(ctx, x * unit, y * unit, mover.r * unit, 1 - age / mover.ttl)
        }
      }

      // Tap effects: an expanding ring, and a floating "+points" label.
      effectsRef.current = effectsRef.current.filter((effect) => now - effect.startedAt < 700)
      for (const effect of effectsRef.current) {
        const progress = (now - effect.startedAt) / 700
        ctx.globalAlpha = 1 - progress
        ctx.strokeStyle = effect.color
        ctx.lineWidth = 2 * ratio
        ctx.beginPath()
        ctx.arc(effect.x * unit, effect.y * unit, (0.015 + progress * 0.05) * unit, 0, Math.PI * 2)
        ctx.stroke()
        if (effect.label) {
          ctx.fillStyle = COLORS.ink
          ctx.font = `${0.055 * unit}px Forum, serif`
          ctx.textAlign = 'center'
          ctx.fillText(effect.label, effect.x * unit, (effect.y - 0.06 - progress * 0.05) * unit)
        }
        ctx.globalAlpha = 1
      }
    }

    frameId = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(frameId)
  }, [finished])

  const shoot = async (event) => {
    if (state.result) return
    const rect = event.currentTarget.getBoundingClientRect()
    // Both x and y are measured in "widths" (the arena is 1 wide).
    const x = (event.clientX - rect.left) / rect.width
    const y = (event.clientY - rect.top) / rect.width
    const effect = { key: `me-${performance.now()}`, x, y, startedAt: performance.now(), color: SEAT_COLORS[mySeat], label: null }
    effectsRef.current.push(effect)

    const response = await sendAction({ type: 'shoot', x, y })
    if (!response.ok) {
      showToast(response.message)
      return
    }
    const { hit, points, targetId, enemyId, killed } = response.result
    if (hit) {
      effect.label = `+${points}`
      effect.startedAt = performance.now()
      if (targetId) hiddenIdsRef.current.add(targetId)
      if (killed) hiddenIdsRef.current.add(enemyId)
    }
  }

  return (
    <section className={`flex min-h-0 flex-1 flex-col ${coop ? 'bg-olive text-white' : 'bg-white'}`}>
      <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col gap-3 px-3 pt-3 pb-3">
        {/* The live HUD; hidden at the end (the scorecard shows everything) */}
        {!finished &&
          (coop ? (
            <CoopHud state={state} />
          ) : (
            <DuelHud state={state} opponentName={opponentName} secondsLeft={Math.ceil(msLeft / 1000)} />
          ))}

        {state.result ? (
          coop ? (
            <CoopResults state={state} mySeat={mySeat} opponentName={opponentName} />
          ) : (
            <DuelResults state={state} opponentName={opponentName} />
          )
        ) : (
          <div ref={wrapperRef} className="relative flex min-h-0 flex-1 items-center justify-center">
            <canvas
              ref={canvasRef}
              onPointerDown={shoot}
              // touch-none: no scrolling/zooming while tapping fast
              className="cursor-crosshair touch-none rounded-[28px] shadow-deep select-none"
              aria-label="Shooting range. Tap the targets."
            />
            {coop && state.phase === 'break' && (
              <div className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-ink">
                <p key={state.wave} className="animate-rise font-script text-6xl text-olive">
                  {state.wave === 0 ? 'Get ready' : `Wave ${state.wave} cleared`}
                </p>
                <p className="font-display text-lg tracking-[0.2em] text-muted uppercase">
                  Wave {state.wave + 1} in {Math.ceil(msLeft / 1000)}
                </p>
              </div>
            )}
          </div>
        )}
        {state.result && <div className="h-52 shrink-0" /> /* room for the result sheet */}
      </div>
    </section>
  )
}

function DuelHud({ state, opponentName, secondsLeft }) {
  const { me, opponent } = state
  return (
    <div className="grid grid-cols-3 items-end gap-2">
      <div>
        <p className="eyebrow text-muted">Score</p>
        <p className="font-display text-3xl leading-none text-ink">{me.score}</p>
        <p className="mt-1 text-xs text-muted">{me.accuracy}% accuracy</p>
      </div>
      <div className="text-center">
        <p className="eyebrow text-muted">Time</p>
        <p className={`font-display text-4xl leading-none ${secondsLeft <= 5 ? 'text-saffron' : 'text-olive'}`}>{secondsLeft}</p>
        <p className="mt-1 text-xs text-muted">{me.bullets} bullets</p>
      </div>
      <div className="min-w-0 text-right">
        <p className="eyebrow truncate text-muted">{opponentName}</p>
        <p className="font-display text-3xl leading-none text-muted">{opponent.score}</p>
        <p className="mt-1 text-xs text-muted">{opponent.accuracy}% · {opponent.bullets} left</p>
      </div>
    </div>
  )
}

function CoopHud({ state }) {
  const hpFraction = state.coreHp / state.coreMaxHp
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 items-end gap-2">
        <div>
          <p className="eyebrow text-white/70">Wave</p>
          <p className="font-display text-3xl leading-none">
            {Math.max(1, state.wave)}
            <span className="text-lg text-white/60"> / {state.totalWaves}</span>
          </p>
        </div>
        <div className="text-center">
          <p className="eyebrow text-white/70">Team score</p>
          <p className="font-display text-3xl leading-none">{state.teamScore}</p>
        </div>
        <div className="text-right">
          <p className="eyebrow text-white/70">Combo</p>
          <p key={state.combo} className="animate-rise font-script text-4xl leading-none text-saffron [animation-duration:300ms]">
            ×{state.combo}
          </p>
        </div>
      </div>
      {/* Core health */}
      <div className="flex items-center gap-2">
        <span className="eyebrow text-white/70">Core</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/20">
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${hpFraction > 0.3 ? 'bg-white' : 'bg-saffron'}`}
            style={{ width: `${hpFraction * 100}%` }}
          />
        </div>
        <span className="font-display text-sm">
          {state.coreHp}/{state.coreMaxHp}
        </span>
      </div>
    </div>
  )
}

// A "results card" row: label, you, them.
function StatRow({ label, mine, theirs, better }) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 py-2.5">
      <span className="eyebrow text-muted">{label}</span>
      <span className={`w-16 text-right font-display text-xl ${better === 'me' ? 'text-olive' : 'text-ink'}`}>{mine}</span>
      <span className={`w-16 text-right font-display text-xl ${better === 'them' ? 'text-olive' : 'text-muted'}`}>{theirs}</span>
    </div>
  )
}

function DuelResults({ state, opponentName }) {
  const { me, opponent } = state
  const compare = (a, b, higherIsBetter = true) => {
    if (a === b || a === null || b === null) return null
    return (a > b) === higherIsBetter ? 'me' : 'them'
  }
  const ms = (value) => (value === null ? '—' : `${(value / 1000).toFixed(2)}s`)

  return (
    <div className="card animate-rise overflow-y-auto p-5">
      <p className="text-center font-script text-4xl text-olive">The scorecard</p>
      <div className="mt-2 grid grid-cols-[1fr_auto_auto] gap-4 border-b border-olive/15 pb-2">
        <span />
        <span className="eyebrow w-16 text-right text-olive">You</span>
        <span className="eyebrow w-16 truncate text-right text-muted">{opponentName}</span>
      </div>
      <div className="divide-y divide-olive/10">
        <StatRow label="Score" mine={me.score} theirs={opponent.score} better={compare(me.score, opponent.score)} />
        <StatRow label="Targets hit" mine={me.hits} theirs={opponent.hits} better={compare(me.hits, opponent.hits)} />
        <StatRow label="Shots" mine={me.shots} theirs={opponent.shots} />
        <StatRow label="Missed" mine={me.misses} theirs={opponent.misses} better={compare(me.misses, opponent.misses, false)} />
        <StatRow label="Accuracy" mine={`${me.accuracy}%`} theirs={`${opponent.accuracy}%`} better={compare(me.accuracy, opponent.accuracy)} />
        <StatRow
          label="Reaction"
          mine={ms(me.avgReactionMs)}
          theirs={ms(opponent.avgReactionMs)}
          better={compare(me.avgReactionMs, opponent.avgReactionMs, false)}
        />
        <StatRow label="Targets shown" mine={me.targetsSeen} theirs={opponent.targetsSeen} />
      </div>
    </div>
  )
}

function CoopResults({ state, mySeat, opponentName }) {
  const { breakdown, players } = state
  const partner = 1 - mySeat
  const rows = [
    ['Enemies defeated', `+${breakdown.killPoints}`],
    [`Waves cleared ×500`, `+${breakdown.waveBonus}`],
    [`Accuracy ${breakdown.accuracy}%`, `+${breakdown.accuracyBonus}`],
    ['Damage taken', `−${breakdown.damagePenalty}`],
  ]
  const accuracy = (player) => (player.shots ? Math.round((player.hits / player.shots) * 100) : 0)

  return (
    <div className="animate-rise overflow-y-auto rounded-[32px] bg-white p-5 text-ink shadow-deep">
      <p className="text-center font-script text-4xl text-olive">Team scorecard</p>
      <div className="mt-2 divide-y divide-olive/10">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between py-2.5">
            <span className="eyebrow text-muted">{label}</span>
            <span className="font-display text-xl">{value}</span>
          </div>
        ))}
        <div className="flex items-baseline justify-between py-3">
          <span className="eyebrow text-olive">Team score</span>
          <span className="font-display text-4xl text-olive">{breakdown.total}</span>
        </div>
      </div>
      <p className="mt-2 text-center font-display text-sm tracking-[0.12em] text-muted uppercase">
        Best combo ×{state.bestCombo} · {breakdown.survivedSeconds}s survived
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 text-center">
        {[
          ['You', players[mySeat]],
          [opponentName, players[partner]],
        ].map(([name, player]) => (
          <div key={name} className="rounded-[20px] bg-ivory p-3">
            <p className="truncate font-script text-2xl text-olive">{name}</p>
            <p className="font-display text-lg">{player.kills} kills</p>
            <p className="text-xs text-muted">{accuracy(player)}% accuracy</p>
          </div>
        ))}
      </div>
    </div>
  )
}
