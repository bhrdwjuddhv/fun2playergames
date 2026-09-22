// Home screen: type your name, then create a room or join one with a code.

import { useState } from 'react'
import { send, playerId, savedName } from '../lib/socket.js'

export default function Home({ showToast }) {
  const [name, setName] = useState(savedName.get)
  // An invite link looks like /?room=AB12CD → fill in the code for them.
  const [code, setCode] = useState(() => new URLSearchParams(window.location.search).get('room') ?? '')
  const [busy, setBusy] = useState(false)

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
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-5 px-5 py-10">
      <div className="text-center">
        <h1 className="text-5xl font-black tracking-tight">
          Game<span className="text-violet-400">Playz</span>
        </h1>
        <p className="mt-3 text-slate-400">
          2-player games with a friend.
          <br />
          No sign-up, just share a code.
        </p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-slate-400">Your name</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={16}
          placeholder="e.g. Sam"
          autoComplete="nickname"
          enterKeyHint="done"
          className="h-14 rounded-xl bg-slate-800 px-4 text-lg outline-none ring-violet-400 focus:ring-2"
        />
      </label>

      <button
        type="button"
        onClick={createRoom}
        disabled={busy}
        className="h-14 rounded-xl bg-violet-500 text-lg font-bold text-white active:scale-[0.98] disabled:opacity-50"
      >
        Create a room
      </button>

      <div className="flex items-center gap-3 text-sm text-slate-500">
        <span className="h-px flex-1 bg-slate-800" />
        or join a friend
        <span className="h-px flex-1 bg-slate-800" />
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
          className="h-14 min-w-0 flex-1 rounded-xl bg-slate-800 px-4 text-center font-mono text-2xl font-bold tracking-[0.3em] uppercase outline-none ring-violet-400 focus:ring-2"
        />
        <button
          type="submit"
          disabled={busy}
          className="h-14 rounded-xl bg-slate-700 px-6 text-lg font-bold active:scale-[0.98] disabled:opacity-50"
        >
          Join
        </button>
      </form>
    </main>
  )
}
