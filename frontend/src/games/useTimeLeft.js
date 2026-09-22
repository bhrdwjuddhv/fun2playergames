import { useEffect, useState } from 'react'

// The server sends "timeLeftMs" with each update. Between updates we count
// down locally, so timers tick smoothly without extra messages.
// Returns the milliseconds left (updated 10 times a second).
export function useTimeLeft(timeLeftMs) {
  const [msLeft, setMsLeft] = useState(timeLeftMs)
  useEffect(() => {
    const deadline = Date.now() + timeLeftMs
    const tick = () => setMsLeft(Math.max(0, deadline - Date.now()))
    tick()
    const interval = setInterval(tick, 100)
    return () => clearInterval(interval)
  }, [timeLeftMs])
  return msLeft
}
