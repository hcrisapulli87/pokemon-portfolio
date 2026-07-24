import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const links = [
  { to: '/', label: 'Dashboard', icon: '🏠', end: true },
  { to: '/collection', label: 'Collection', icon: '🗂️' },
  { to: '/graded', label: 'Graded', icon: '🏅' },
  { to: '/sets', label: 'Sets', icon: '📚' },
  { to: '/search', label: 'Search', icon: '🔍' },
]

function linkClass({ isActive }) {
  const base =
    'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs md:flex-none md:flex-row md:justify-start md:gap-3 md:rounded-lg md:px-3 md:py-2 md:text-sm transition'
  const active = isActive
    ? ' text-indigo-400 md:bg-indigo-600/20 md:text-indigo-300'
    : ' text-gray-400 hover:text-gray-200 md:hover:bg-white/5'
  return base + active
}

export default function Nav() {
  const { signOut } = useAuth()

  return (
    <nav className="fixed bottom-0 inset-x-0 z-10 border-t border-white/10 bg-[#0b1020]/95 backdrop-blur md:static md:h-screen md:w-56 md:shrink-0 md:flex md:flex-col md:border-t-0 md:border-r md:p-3">
      <div className="hidden md:block px-3 py-4 text-lg font-bold">PokéVault</div>

      <div className="flex md:flex-col md:gap-1">
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end} className={linkClass}>
            <span className="text-lg md:text-base">{l.icon}</span>
            <span>{l.label}</span>
          </NavLink>
        ))}
        <button
          onClick={signOut}
          className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs text-gray-400 hover:text-gray-200 md:hidden"
        >
          <span className="text-lg">🚪</span>
          <span>Sign Out</span>
        </button>
      </div>

      <button
        onClick={signOut}
        className="hidden md:block md:mt-auto md:rounded-lg md:px-3 md:py-2 md:text-left md:text-sm text-gray-400 hover:text-gray-200 md:hover:bg-white/5"
      >
        Sign Out
      </button>
    </nav>
  )
}
