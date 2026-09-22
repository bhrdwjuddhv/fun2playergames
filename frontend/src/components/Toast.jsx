import { useEffect } from 'react'

// A short message at the top of the screen that disappears by itself.
export default function Toast({ toast, onDone }) {
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(onDone, 2500)
    return () => clearTimeout(timer)
  }, [toast, onDone])

  if (!toast) return null

  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-[max(1rem,env(safe-area-inset-top))]"
    >
      <p className="rounded-full bg-slate-100 px-5 py-2.5 text-center text-sm font-semibold text-slate-900 shadow-xl">
        {toast.message}
      </p>
    </div>
  )
}
