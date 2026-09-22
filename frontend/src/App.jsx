// App = the top of the app. It listens to the server and decides which
// screen to show: Home (no room) or Room.

import { useCallback, useEffect, useState } from 'react'
import { socket, send, playerId, savedRoomCode, savedName } from './lib/socket.js'
import Home from './components/Home.jsx'
import Room from './components/Room.jsx'
import Toast from './components/Toast.jsx'

// Keep ?room=CODE in the address bar, so the link can be shared and a
// refresh still knows the room.
function setUrlRoom(code) {
  const url = code ? `?room=${code}` : window.location.pathname
  window.history.replaceState(null, '', url)
}

export default function App() {
  const [room, setRoom] = useState(null)
  const [gameState, setGameState] = useState(null)
  const [connected, setConnected] = useState(socket.connected)
  const [toast, setToast] = useState(null)

  const showToast = useCallback((message) => {
    setToast({ message, id: Date.now() })
  }, [])

  // useCallback keeps the SAME function between renders. Otherwise the race
  // (20 updates a second) would re-create it constantly and restart the
  // toast timer, so the toast would never disappear.
  const hideToast = useCallback(() => setToast(null), [])

  useEffect(() => {
    const onRoomUpdate = (newRoom) => {
      setRoom(newRoom)
      savedRoomCode.set(newRoom.roomCode)
      setUrlRoom(newRoom.roomCode)
      // No game on screen any more → forget the old game state.
      if (newRoom.status === 'waiting' || newRoom.status === 'voting') {
        setGameState(null)
      }
    }

    const onGameState = (state) => setGameState(state)

    // Runs on the first connection AND after every reconnect.
    // Socket.IO gives us a NEW socket.id each time, so we rejoin the room
    // with our playerId and the server updates our socketId.
    const onConnect = async () => {
      setConnected(true)
      const roomCode = savedRoomCode.get()
      if (!roomCode) return
      const response = await send('room:join', { roomCode, playerId, name: savedName.get() })
      if (!response.ok) {
        savedRoomCode.set(null)
        setUrlRoom(null)
        setRoom(null)
        showToast(response.message)
      }
    }

    const onDisconnect = () => setConnected(false)

    socket.on('room:update', onRoomUpdate)
    socket.on('game:state', onGameState)
    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    if (socket.connected) onConnect()

    // Cleanup: remove listeners when App unmounts (and in React's
    // StrictMode double-run during development).
    return () => {
      socket.off('room:update', onRoomUpdate)
      socket.off('game:state', onGameState)
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
    }
  }, [showToast])

  const leaveRoom = async () => {
    await send('room:leave')
    savedRoomCode.set(null)
    setUrlRoom(null)
    setRoom(null)
    setGameState(null)
  }

  return (
    <div className="flex h-full flex-col">
      {!connected && (
        <div className="bg-amber-500 px-4 py-1.5 text-center text-sm font-semibold text-amber-950">
          Reconnecting…
        </div>
      )}

      {room ? (
        <Room room={room} gameState={gameState} onLeave={leaveRoom} showToast={showToast} />
      ) : (
        <Home showToast={showToast} />
      )}

      <Toast toast={toast} onDone={hideToast} />
    </div>
  )
}
