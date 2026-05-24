import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import { Upload, Library, ChevronDown, LogOut, User } from 'lucide-react'
import { clsx } from 'clsx'
import { useAuth } from '../../context/AuthContext'
import ThemeToggle from './ThemeToggle'

const NAV = [
  { to: '/analyze', label: 'Analyze', icon: Upload },
  { to: '/library', label: 'Library', icon: Library },
]

function UserMenu({ user, signOut }) {
  const [open, setOpen] = useState(false)
  const navigate        = useNavigate()
  const initial         = user.email?.[0]?.toUpperCase() ?? 'U'

  const handleSignOut = async () => {
    await signOut()
    setOpen(false)
    navigate('/')
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-dark-surface px-2.5 py-1.5 rounded-lg transition-colors"
      >
        <span className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white text-xs font-bold">
          {initial}
        </span>
        <ChevronDown size={13} className={clsx('text-slate-500 transition-transform duration-150', open && 'rotate-180')} />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.96 }}
              transition={{ duration: 0.13 }}
              className="absolute right-0 top-full mt-2 w-48 card shadow-xl z-20 p-1 overflow-hidden"
            >
              <div className="px-3 py-2 border-b border-slate-100 dark:border-dark-border mb-1">
                <p className="text-xs font-mono text-slate-400 truncate">{user.email}</p>
              </div>
              <Link
                to="/library"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-dark-surface transition-colors"
              >
                <User size={13} /> My Library
              </Link>
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
              >
                <LogOut size={13} /> Sign Out
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function Navbar() {
  const { user, signOut } = useAuth()
  const location          = useLocation()

  return (
    <nav className="sticky top-0 z-50 h-14 bg-white/90 dark:bg-dark-bg/90 backdrop-blur-xl border-b border-slate-200 dark:border-dark-border flex items-center">
      <div className="w-full max-w-none px-5 flex items-center justify-between">

        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 shrink-0 mr-6">
          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-black text-xs">
            M
          </div>
          <div className="leading-none">
            <span className="font-bold text-sm tracking-widest text-slate-900 dark:text-white font-mono">MAVEN</span>
            <p className="text-[9px] text-slate-400 font-mono tracking-widest uppercase">Forensics</p>
          </div>
        </Link>

        {/* Desktop Nav — just two tabs */}
        <div className="flex items-center gap-1 flex-1">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = location.pathname.startsWith(to)
            return (
              <Link
                key={to}
                to={to}
                className={clsx(
                  'flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-mono font-semibold tracking-widest uppercase transition-all duration-150',
                  active
                    ? 'text-cyan-500 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-500/10 border border-cyan-200 dark:border-cyan-500/20'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-dark-surface border border-transparent'
                )}
              >
                <Icon size={12} />
                {label}
              </Link>
            )
          })}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {user ? (
            <UserMenu user={user} signOut={signOut} />
          ) : (
            <Link to="/auth" className="btn-secondary text-xs py-1.5 px-3.5 font-mono tracking-wide">
              Sign In
            </Link>
          )}
        </div>
      </div>
    </nav>
  )
}
