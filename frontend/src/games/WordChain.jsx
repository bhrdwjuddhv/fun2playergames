// Word Chain screen. Players alternate; each word must start with the last
// letter of the previous one. The SERVER checks the dictionary, the letter,
// repeats and the timer — this screen only shows the chain and sends words.

import { useEffect, useRef, useState } from 'react'
import { useTimeLeft } from './useTimeLeft.js'

export default function WordChain({ state, mySeat, opponentName, sendAction, showToast }) {
  const [word, setWord] = useState('')
  const [sending, setSending] = useState(false)
  const inputRef = useRef(null)
  const chainEndRef = useRef(null)
  const msLeft = useTimeLeft(state.timeLeftMs)
  const other = 1 - mySeat

  const myTurn = state.phase === 'playing' && state.turn === mySeat && !state.result
  const letter = state.requiredLetter?.toUpperCase()

  // Keep the newest word in view.
  useEffect(() => {
    chainEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [state.chain.length])

  // Put the cursor in the box when it becomes your turn.
  useEffect(() => {
    if (myTurn) inputRef.current?.focus({ preventScroll: true })
  }, [myTurn])

  const submit = async (event) => {
    event.preventDefault()
    if (!word.trim() || sending) return
    setSending(true)
    const response = await sendAction({ type: 'word', word })
    setSending(false)
    if (!response.ok) {
      showToast(response.message) // e.g. "Letters only" — try again, no penalty
      return
    }
    setWord('')
  }

  const nameOf = (seat) => (seat === mySeat ? 'You' : opponentName)
  const timeFraction = state.phase === 'playing' ? msLeft / state.turnMs : 0

  return (
    <section className={`flex min-h-0 flex-1 flex-col bg-white ${state.result ? 'pb-56' : ''}`}>
      <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col gap-4 px-4 pt-5">
        {/* Round + score */}
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="eyebrow text-muted">
              Round {state.round} · first to {state.roundsToWin}
            </p>
            <p className="font-display text-3xl text-ink">
              <span className="text-olive">You {state.scores[mySeat]}</span>
              <span className="mx-2 text-gold">·</span>
              <span className="text-muted">
                {opponentName} {state.scores[other]}
              </span>
            </p>
          </div>
          <p className="text-right">
            <span className="eyebrow block text-muted">Chain</span>
            <span className="font-display text-3xl text-ink">{state.chain.length}</span>
          </p>
        </div>

        {/* Whose turn + the letter to start with + timer */}
        {state.phase === 'playing' ? (
          <div className="flex items-center gap-4 rounded-[28px] bg-ivory p-4">
            <div
              className={`flex size-20 shrink-0 items-center justify-center rounded-full border-2 font-display text-5xl transition-colors duration-500 ${
                myTurn ? 'border-olive bg-olive text-white' : 'border-olive/30 text-olive'
              }`}
              aria-label={letter ? `Starts with ${letter}` : 'Any word'}
            >
              {letter ?? '✦'}
            </div>
            <div className="min-w-0 flex-1">
              <p key={state.turn} className="animate-rise font-script text-4xl leading-tight text-olive [animation-duration:400ms]">
                {myTurn ? 'Your turn' : `${opponentName}’s turn`}
              </p>
              <p className="text-sm text-muted">
                {letter ? (
                  <>
                    A word starting with <b className="font-semibold text-ink">{letter}</b>
                  </>
                ) : (
                  'Any word to begin the chain'
                )}
              </p>
              {/* A thin line that runs out with the time */}
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-olive/15">
                  <div
                    className={`h-full rounded-full transition-[width] duration-100 ease-linear ${
                      msLeft < 4000 ? 'bg-saffron' : 'bg-olive'
                    }`}
                    style={{ width: `${Math.max(0, Math.min(1, timeFraction)) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-right font-display text-lg text-ink">{Math.ceil(msLeft / 1000)}</span>
              </div>
            </div>
          </div>
        ) : (
          // Round over: who lost it and why.
          <div className="animate-rise rounded-[28px] bg-olive p-5 text-center text-white">
            <p className="font-script text-4xl">
              {state.lastRound && (state.lastRound.loserSeat === mySeat ? `Round to ${opponentName}` : 'Round to you')}
            </p>
            {state.lastRound && (
              <p className="mt-1 font-display text-lg italic">
                {/* "ran out of time" needs a name in front; word reasons already read as a sentence */}
                {state.lastRound.reason.startsWith("“")
                  ? state.lastRound.reason
                  : `${nameOf(state.lastRound.loserSeat)} ${state.lastRound.reason}`}
              </p>
            )}
            {!state.result && (
              <p className="eyebrow mt-3 text-white/75">Next round in {Math.ceil(msLeft / 1000)}</p>
            )}
          </div>
        )}

        {/* The chain, like a conversation: your words on the right */}
        <ol className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto pb-2" aria-label="Word chain">
          {state.chain.length === 0 && (
            <li className="m-auto text-center font-display text-lg text-muted italic">The chain begins with the first word…</li>
          )}
          {state.chain.map((link, index) => {
            const mine = link.seat === mySeat
            return (
              <li
                key={`${index}-${link.word}`}
                className={`flex animate-rise flex-col [animation-duration:400ms] ${mine ? 'items-end' : 'items-start'}`}
              >
                <span
                  className={`max-w-[80%] rounded-[20px] px-4 py-2 font-display text-2xl tracking-wide break-words ${
                    mine ? 'rounded-br-md bg-olive text-white' : 'rounded-bl-md border border-olive/20 bg-ivory text-ink'
                  }`}
                >
                  {/* First letter continues the chain, last letter passes it on */}
                  <span className={index > 0 ? (mine ? 'text-saffron' : 'font-semibold text-olive') : ''}>{link.word[0]}</span>
                  {link.word.slice(1, -1)}
                  <span className="underline decoration-saffron decoration-2 underline-offset-4">{link.word.slice(-1)}</span>
                </span>
              </li>
            )
          })}
          <li ref={chainEndRef} aria-hidden="true" />
        </ol>

        {/* Input: sticky so it stays above the phone keyboard */}
        {!state.result && (
          <form onSubmit={submit} className="sticky bottom-0 flex gap-2 bg-white py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <input
              ref={inputRef}
              value={word}
              onChange={(event) => setWord(event.target.value.replace(/\s/g, ''))}
              disabled={!myTurn}
              maxLength={30}
              placeholder={
                state.phase !== 'playing' ? 'Next round soon…' : myTurn ? (letter ? `${letter}…` : 'Any word') : `Waiting for ${opponentName}…`
              }
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="send"
              aria-label="Your word"
              className="h-13 min-w-0 flex-1 rounded-full border border-olive/30 bg-ivory px-5 font-display text-xl outline-none transition-colors focus:border-olive disabled:opacity-50"
            />
            <button type="submit" disabled={!myTurn || sending} className="btn-primary px-6">
              Play
            </button>
          </form>
        )}

        {state.result && (
          <p className="pb-4 text-center font-display text-sm tracking-[0.2em] text-muted uppercase">
            Longest chain · {state.longestChain}
          </p>
        )}
      </div>
    </section>
  )
}
