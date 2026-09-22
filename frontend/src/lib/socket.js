// One shared Socket.IO connection for the whole app, plus the player's identity.

import { io } from 'socket.io-client'

// No URL = connect to the same address the page came from.
// In development Vite forwards /socket.io to the backend (vite.config.js).
export const socket = io()

// Sends an event and waits for the server's reply ({ ok, message, ... }).
// If the server doesn't answer within 8 seconds, we return an error
// instead of waiting forever.
export function send(event, payload = {}) {
  return new Promise((resolve) => {
    socket.timeout(8000).emit(event, payload, (err, response) => {
      resolve(err ? { ok: false, message: 'Server did not respond' } : response)
    })
  })
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

// playerId = who this player is (NOT socket.id, which changes on reconnect).
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
