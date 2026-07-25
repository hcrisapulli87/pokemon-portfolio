import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import CardSearchOverlay from './CardSearchOverlay'

// Floating liquid-glass nav pill with geometric icons, matching the mobile
// redesign (turns 3+4). Each tab has its own accent that lights up when active.
// Settings is reached via the "S" avatar on Home, so it is not in the nav.

const MUTED = 'rgba(255,255,255,0.55)'
const glow = (c) => `drop-shadow(0 0 4px ${c})`

// diamond — Home
function DiamondIcon({ active, accent }) {
  return (
    <div
      style={{
        width: 9,
        height: 9,
        transform: 'rotate(45deg)',
        background: active ? accent : 'transparent',
        border: active ? 'none' : `1.5px solid ${MUTED}`,
        filter: active ? glow(accent) : 'none',
      }}
    />
  )
}

// two squares — Collection
function SquaresIcon({ active, accent }) {
  const box = {
    width: 6,
    height: 6,
    background: active ? accent : 'transparent',
    border: active ? 'none' : `1px solid ${MUTED}`,
    filter: active ? glow(accent) : 'none',
  }
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      <div style={box} />
      <div style={box} />
    </div>
  )
}

// circle — Graded
function CircleIcon({ active, accent }) {
  return (
    <div
      style={{
        width: 14,
        height: 14,
        borderRadius: '50%',
        border: `1.5px solid ${active ? accent : MUTED}`,
        filter: active ? glow(accent) : 'none',
      }}
    />
  )
}

// rounded rectangle — Sets
function RectIcon({ active, accent }) {
  return (
    <div
      style={{
        width: 12,
        height: 9,
        borderRadius: 2,
        border: `1.5px solid ${active ? accent : MUTED}`,
        filter: active ? glow(accent) : 'none',
      }}
    />
  )
}

const tabs = [
  { to: '/', end: true, label: 'Home', accent: '#67e8f9', Icon: DiamondIcon },
  { to: '/collection', label: 'Collection', accent: '#67e8f9', Icon: SquaresIcon },
  { to: '/graded', label: 'Graded', accent: '#fbbf24', Icon: CircleIcon },
  { to: '/sets', label: 'Sets', accent: '#8b7cf6', Icon: RectIcon },
]

export default function BottomNav() {
  const [adding, setAdding] = useState(false)

  return (
    <>
      <nav
        className="fixed bottom-[calc(16px+env(safe-area-inset-bottom))] left-1/2 z-30 flex -translate-x-1/2 items-center gap-[22px] overflow-hidden rounded-[30px] px-6 py-3"
        aria-label="Primary"
      >
        {/* blur + tint */}
        <div
          className="pointer-events-none absolute inset-0 rounded-[30px]"
          style={{
            backdropFilter: 'blur(18px) saturate(180%)',
            WebkitBackdropFilter: 'blur(18px) saturate(180%)',
            background: 'rgba(120,120,140,0.28)',
          }}
        />
        {/* shine + hairline border */}
        <div
          className="pointer-events-none absolute inset-0 rounded-[30px]"
          style={{
            boxShadow:
              'inset 1.5px 1.5px 1px rgba(255,255,255,0.18), inset -1px -1px 1px rgba(255,255,255,0.08)',
            border: '0.5px solid rgba(255,255,255,0.18)',
          }}
        />

        {tabs.map(({ to, end, label, accent, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            aria-label={label}
            className="relative flex h-[18px] items-center justify-center"
          >
            {({ isActive }) => <Icon active={isActive} accent={accent} />}
          </NavLink>
        ))}

        <button
          onClick={() => setAdding(true)}
          aria-label="Add card"
          className="relative flex h-[18px] w-[18px] items-center justify-center rounded-full bg-holo-cta text-[13px] font-extrabold leading-none text-vault-bg"
        >
          +
        </button>
      </nav>

      {adding && <CardSearchOverlay mode="raw" onClose={() => setAdding(false)} />}
    </>
  )
}
