import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import GlassPill from './GlassPill'
import CardSearchOverlay from './CardSearchOverlay'

const links = [
  { to: '/', label: 'Dashboard', icon: '🏠', end: true, accent: '#67e8f9' },
  { to: '/collection', label: 'Collection', icon: '🗂️', accent: '#f472b6' },
  { to: '/graded', label: 'Graded', icon: '🏅', accent: '#fbbf24' },
  { to: '/sets', label: 'Sets', icon: '📚', accent: '#8b7cf6' },
  { to: '/settings', label: 'Settings', icon: '⚙️', accent: '#e5e7eb' },
]

export default function BottomNav() {
  const [adding, setAdding] = useState(false)

  return (
    <>
      <GlassPill className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-20 md:hidden">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            className="flex flex-1 flex-col items-center justify-center gap-0.5 rounded-full py-1.5 text-[10px] transition"
          >
            {({ isActive }) => (
              <>
                <span
                  className="text-lg"
                  style={{ filter: isActive ? `drop-shadow(0 0 6px ${l.accent})` : 'none' }}
                >
                  {l.icon}
                </span>
                <span className={isActive ? 'font-medium text-gray-100' : 'text-gray-400'}>
                  {l.label}
                </span>
              </>
            )}
          </NavLink>
        ))}
        <button
          onClick={() => setAdding(true)}
          aria-label="Add card"
          className="ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-holo-cta text-lg font-bold text-vault-bg shadow-[0_4px_14px_rgba(103,232,249,0.4)]"
        >
          ＋
        </button>
      </GlassPill>

      {adding && <CardSearchOverlay mode="raw" onClose={() => setAdding(false)} />}
    </>
  )
}
