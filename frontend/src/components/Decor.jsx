// Small decorative pieces used across the app: hearts, rings, corner
// ornaments, dashed dividers, game icons and the fade-up-on-scroll wrapper.
// All icons are thin line drawings that use `currentColor`, so their color
// comes from Tailwind text classes (text-olive, text-gold, ...).

import { useEffect, useRef, useState } from 'react'

export function Heart({ className = 'size-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" className={className} aria-hidden="true">
      <path
        strokeLinejoin="round"
        d="M12 20.5s-7.5-4.6-9.2-9.1C1.6 8.2 3.7 5 7 5c2 0 3.5 1.1 5 3 1.5-1.9 3-3 5-3 3.3 0 5.4 3.2 4.2 6.4-1.7 4.5-9.2 9.1-9.2 9.1Z"
      />
    </svg>
  )
}

// Two linked rings with a small diamond — sits between the two names.
export function Rings({ className = 'h-8 w-12' }) {
  return (
    <svg viewBox="0 0 64 40" fill="none" stroke="currentColor" strokeWidth="1.6" className={className} aria-hidden="true">
      <circle cx="24" cy="25" r="11.5" />
      <circle cx="40" cy="25" r="11.5" />
      <path strokeLinejoin="round" d="M36.5 7.5 40 3.5l3.5 4-3.5 5z" />
    </svg>
  )
}

// A leafy corner flourish. Drawn for the top-left corner; flip it with
// -scale-x-100 / -scale-y-100 for the other corners.
export function Ornament({ className = '' }) {
  return (
    <svg
      viewBox="0 0 160 160"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.1"
      strokeLinecap="round"
      className={`pointer-events-none ${className}`}
      aria-hidden="true"
    >
      <path d="M6 154C6 82 38 30 112 10" />
      <path d="M6 112c20-6 34-20 40-42" />
      <path d="M6 154c10-22 26-32 48-34" />
      <path d="M40 60c-14 2-25-6-29-17 14-2 25 5 29 17Z" />
      <path d="M72 30c-4-14 2-25 13-29 4 14-2 25-13 29Z" />
      <path d="M47 71c12-9 27-7 35 2-12 9-27 7-35-2Z" />
      <path d="M112 10c11 0 19 6 21 15-11 2-19-4-21-15Z" />
      <path d="M24 128c-9-8-10-19-4-27 9 8 10 19 4 27Z" />
      <circle cx="18" cy="92" r="2.6" />
      <circle cx="98" cy="20" r="2.2" />
      <circle cx="60" cy="47" r="1.8" />
    </svg>
  )
}

// Four ornaments in the corners of a `relative` parent, at low opacity.
export function CornerOrnaments({ className = 'text-olive/25' }) {
  const base = `absolute size-28 sm:size-44 ${className}`
  return (
    <>
      <Ornament className={`${base} top-2 left-2`} />
      <Ornament className={`${base} top-2 right-2 -scale-x-100`} />
      <Ornament className={`${base} bottom-2 left-2 -scale-y-100`} />
      <Ornament className={`${base} right-2 bottom-2 -scale-100`} />
    </>
  )
}

// ——— ♡ ——— with thin dashed lines.
export function DashedDivider({ className = 'text-olive' }) {
  return (
    <div className={`flex items-center gap-3 ${className}`} aria-hidden="true">
      <span className="h-px flex-1 border-t border-dashed border-current opacity-60" />
      <Heart className="size-4" />
      <span className="h-px flex-1 border-t border-dashed border-current opacity-60" />
    </div>
  )
}

// Line-art icon for each game (instead of emoji, which clash with the look).
export function GameIcon({ gameId, className = 'size-8' }) {
  const common = {
    viewBox: '0 0 32 32',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.4,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className,
    'aria-hidden': true,
  }

  if (gameId === 'tic-tac-toe') {
    return (
      <svg {...common}>
        <path d="M12 5v22M20 5v22M5 12h22M5 20h22" />
        <path d="M6.5 6.5l3 3M9.5 6.5l-3 3" />
        <circle cx="24" cy="24" r="2" />
      </svg>
    )
  }
  if (gameId === 'wedraw') {
    return (
      <svg {...common}>
        <path d="M21.5 4.5l6 6L13 25l-7.5 1.5L7 19z" />
        <path d="M18.5 7.5l6 6" />
        <path d="M4 29c3-2 5 1 8-1" />
      </svg>
    )
  }
  if (gameId === 'rock-paper-scissors') {
    // a stone, a sheet of paper and a pair of scissors
    return (
      <svg {...common}>
        <path d="M4 10l3-5h5l3 4-2 5H6z" />
        <path d="M18 4h8l2 2v10H18z" />
        <circle cx="19" cy="27" r="2.2" />
        <circle cx="27" cy="27" r="2.2" />
        <path d="M20.5 25.3L27 18M25.5 25.3L19 18" />
      </svg>
    )
  }
  if (gameId === 'word-chain') {
    // two linked chain links with a letter
    return (
      <svg {...common}>
        <rect x="3" y="11" width="15" height="10" rx="5" />
        <rect x="14" y="11" width="15" height="10" rx="5" />
        <path d="M8 26l2.5-6 2.5 6M9 24.5h3" />
      </svg>
    )
  }
  if (gameId === 'shooting-range') {
    // a target
    return (
      <svg {...common}>
        <circle cx="16" cy="16" r="11" />
        <circle cx="16" cy="16" r="6.5" />
        <circle cx="16" cy="16" r="2" />
        <path d="M16 2v5M16 25v5M2 16h5M25 16h5" />
      </svg>
    )
  }
  // f1-dodge: a race car seen from above
  return (
    <svg {...common}>
      <path d="M13 4h6M16 4v24M11 26h10" />
      <path d="M13.5 8h5l1 6h-7z" />
      <rect x="11.5" y="14" width="9" height="10" rx="3" />
      <path d="M8 9h3v5H8zM21 9h3v5h-3zM8 19h3v5H8zM21 19h3v5h-3z" />
    </svg>
  )
}

// Fades + slides its children up when they scroll into view (once).
export function Reveal({ children, className = '', delay = 0, as: Tag = 'div' }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const element = ref.current
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.15 },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <Tag
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition duration-1000 ease-out ${visible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'} ${className}`}
    >
      {children}
    </Tag>
  )
}
