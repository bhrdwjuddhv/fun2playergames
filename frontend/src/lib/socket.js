// One shared WebSocket connection to the room, plus the player's identity.
//
// Cloudflare Workers can't run Socket.IO, so this is a plain browser
// WebSocket talking to the room's Durable Object. It keeps the same shape
// the rest of the app already used:
//
//   send('room:vote', { gameId })  → a promise with the server's answer
//   socket.on('room:update', fn)   → listen for messages from the server
//
// Every message we send is { id, event, payload }; the server answers with
// { ack: id, ok: true/false, ... }. Messages the server sends on its own
// look like { event, data }.

// Where the Worker lives.
// - Local development: empty. Vite forwards /api and /ws to the Worker.
// - On Cloudflare Pages: set VITE_SERVER_URL in the Pages build settings to
//   your Worker address, e.g. https://game-playz.<your-subdomain>.workers.dev
//   (the site and the Worker are two different addresses there).
const SERVER_URL = (import.meta.env.VITE_SERVER_URL ?? '').replace(/\/$/, '')

// http(s):// → ws(s)://
const socketUrl = (roomCode) => {
  const base = SERVER_URL || window.location.origin
  return `${base.replace(/^http/, 'ws')}/ws?room=${encodeURIComponent(roomCode)}`
}

const ACK_TIMEOUT_MS = 8000
const RECONNECT_MIN_MS = 500
const RECONNECT_MAX_MS = 5000

const listeners = new Map()

const emit = (event, data) => {
  for (const listener of listeners.get(event) ?? []) listener(data)
}

export const socket = {
  connected: false,
  on(event, listener) {
    if (!listeners.has(event)) listeners.set(event, new Set())
    listeners.get(event).add(listener)
  },
  off(event, listener) {
    listeners.get(event)?.delete(listener)
  },
}

let ws = null
let roomCode = null // the room we're connected to (or want to reconnect to)
// What we last joined with. After a dropped connection the socket reopens
// and joins again by itself, so the player keeps their seat.
let lastJoin = null
let nextMessageId = 1
const waitingForAck = new Map()
let reconnectDelay = RECONNECT_MIN_MS
let reconnectTimer = null

function handleMessage(raw) {
  let message
  try {
    message = JSON.parse(raw)
  } catch {
    return
  }
  if (message.ack) {
    // An answer to something we sent.
    const resolve = waitingForAck.get(message.ack)
    waitingForAck.delete(message.ack)
    resolve?.(message)
  } else if (message.event) {
    emit(message.event, message.data)
  }
}

function scheduleReconnect() {
  if (!roomCode || reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    openSocket(roomCode).catch(() => {})
  }, reconnectDelay)
  // Wait a little longer each time, so we don't hammer the server.
  reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS)
}

function openSocket(code) {
  return new Promise((resolve, reject) => {
    const next = new WebSocket(socketUrl(code))
    ws = next
    roomCode = code

    next.addEventListener('open', async () => {
      reconnectDelay = RECONNECT_MIN_MS
      // Join straight away: the server needs to know WHO this new
      // connection belongs to before it sends anything.
      const answer = lastJoin ? await sendWithAck('room:join', { playerId, name: lastJoin.name }) : { ok: true }
      socket.connected = true
      emit('connect')
      resolve(answer)
    })
    next.addEventListener('message', (event) => handleMessage(event.data))
    next.addEventListener('close', () => {
      if (ws !== next) return // an older socket we already replaced
      ws = null
      socket.connected = false
      // Anything still waiting for an answer will never get one.
      for (const [id, waiting] of waitingForAck) {
        waiting({ ok: false, message: 'Connection lost' })
        waitingForAck.delete(id)
      }
      emit('disconnect')
      scheduleReconnect()
      reject(new Error('closed'))
    })
  })
}

function sendWithAck(event, payload) {
  return new Promise((resolve) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      resolve({ ok: false, message: 'Not connected' })
      return
    }
    const id = nextMessageId++
    waitingForAck.set(id, resolve)
    ws.send(JSON.stringify({ id, event, payload }))

    // If the server never answers, don't wait forever.
    setTimeout(() => {
      if (waitingForAck.delete(id)) resolve({ ok: false, message: 'Server did not respond' })
    }, ACK_TIMEOUT_MS)
  })
}

// Sends an event and waits for the server's reply ({ ok, message, ... }).
// 'room:create' and 'room:join' also set up the connection itself.
export async function send(event, payload = {}) {
  try {
    if (event === 'room:create') {
      // A room is created over plain HTTP; the answer tells us its code.
      const response = await fetch(`${SERVER_URL}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, name: payload.name }),
      })
      const body = await response.json()
      if (!body.success) return { ok: false, message: body.message ?? 'Could not create a room' }
      return send('room:join', { ...payload, roomCode: body.roomCode })
    }

    if (event === 'room:join') {
      const code = String(payload.roomCode ?? '').toUpperCase()
      lastJoin = { roomCode: code, name: payload.name }
      if (!ws || roomCode !== code) {
        closeSocket()
        return openSocket(code) // resolves with the join answer
      }
      return sendWithAck('room:join', { playerId, name: payload.name })
    }

    const answer = await sendWithAck(event, payload)
    if (event === 'room:leave' && answer.ok) closeSocket({ forget: true }) // we left on purpose
    return answer
  } catch {
    return { ok: false, message: 'Could not reach the server' }
  }
}

function closeSocket({ forget = false } = {}) {
  roomCode = null // stops the automatic reconnecting
  if (forget) lastJoin = null
  clearTimeout(reconnectTimer)
  reconnectTimer = null
  const old = ws
  ws = null
  socket.connected = false
  old?.close()
}

// A move in the current game. The server checks whether it's allowed.
export const sendAction = (action) => send('game:action', { action })

// Storage can throw (private browsing, blocked cookies), so every access
// is wrapped: the app keeps working without it.
function safeGet(storage, key) {
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(storage, key, value) {
  try {
    if (value === null) storage.removeItem(key)
    else storage.setItem(key, value)
  } catch {
    // ignore
  }
}

// playerId = who this player is. It is NOT the connection: a new WebSocket
// after a refresh still carries the same playerId, so you keep your seat.
//
// Why sessionStorage and not localStorage?
// localStorage is shared by every tab. If you open two tabs to test, both
// tabs would be the SAME player. sessionStorage is per tab but survives a
// page refresh — exactly what reconnecting needs.
//
// Why not crypto.randomUUID()? It only works on https or localhost. When you
// open the game on your phone via http://192.168.x.x it's undefined.
// crypto.getRandomValues works everywhere.
function createPlayerId() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-' // 64 chars
  const bytes = crypto.getRandomValues(new Uint8Array(21))
  return Array.from(bytes, (byte) => alphabet[byte & 63]).join('')
}

function loadPlayerId() {
  const saved = safeGet(sessionStorage, 'playerId')
  if (saved) return saved
  const id = createPlayerId()
  safeSet(sessionStorage, 'playerId', id)
  return id
}

export const playerId = loadPlayerId()

// The room we're in, so a refresh can rejoin it.
export const savedRoomCode = {
  get: () => safeGet(sessionStorage, 'roomCode'),
  set: (code) => safeSet(sessionStorage, 'roomCode', code),
}

// The name is remembered across visits (localStorage).
export const savedName = {
  get: () => safeGet(localStorage, 'name') ?? '',
  set: (name) => safeSet(localStorage, 'name', name),
}
