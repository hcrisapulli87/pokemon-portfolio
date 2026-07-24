import { NavLink } from 'react-router-dom'

const links = [
  { to: '/', label: 'Dashboard', icon: '🏠', end: true },
  { to: '/collection', label: 'Collection', icon: '🗂️' },
  { to: '/graded', label: 'Graded', icon: '🏅' },
  { to: '/sets', label: 'Sets', icon: '📚' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
]

function linkClass({ isActive }) {
  const base = 'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition'
  const active = isActive
    ? ' bg-holo-indigo/20 text-holo-indigo'
    : ' text-gray-400 hover:bg-white/5 hover:text-gray-200'
  return base + active
}

// Desktop sidebar only — the mobile bottom nav lives in BottomNav.jsx.
export default function Nav() {
  return (
    <nav className="hidden md:flex md:h-screen md:w-56 md:shrink-0 md:flex-col md:border-r md:border-white/10 md:bg-vault-surface md:p-3">
      <div className="px-3 py-4 text-lg font-bold">PokéVault</div>

      <div className="flex flex-col gap-1">
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end} className={linkClass}>
            <span className="text-base">{l.icon}</span>
            <span>{l.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
