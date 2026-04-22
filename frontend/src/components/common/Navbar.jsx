import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X, Upload, LayoutDashboard, Home, ChevronDown, LogOut, User } from 'lucide-react'
import { clsx } from 'clsx'
import { useAuth } from '../../context/AuthContext'
import ThemeToggle from './ThemeToggle'

const navLinks = [
  { to: '/',          label: 'Home',      icon: Home },
  { to: '/upload',    label: 'Upload',    icon: Upload },
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
]

function UserMenu({ user, signOut }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const initial = user.email?.[0]?.toUpperCase() ?? 'U'

  const handleSignOut = async () => {
    await signOut()
    setOpen(false)
    navigate('/')
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-dark-surface px-3 py-2 rounded-lg transition-colors"
      >
        <span className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-sm font-bold">
          {initial}
        </span>
        <ChevronDown size={14} className={clsx('text-slate-500 transition-transform duration-200', open && 'rotate-180')} />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-full mt-2 w-52 card shadow-xl z-20 p-1"
            >
              <div className="px-3 py-2 border-b border-slate-100 dark:border-dark-border mb-1">
                <p className="text-xs text-slate-500 truncate">{user.email}</p>
              </div>
              <Link
                to="/dashboard"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-dark-surface transition-colors"
              >
                <User size={14} /> Dashboard
              </Link>
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
              >
                <LogOut size={14} /> Sign Out
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { user, signOut } = useAuth()
  const location = useLocation()

  return (
    <nav className="sticky top-0 z-50 bg-white/80 dark:bg-dark-bg/80 backdrop-blur-xl border-b border-slate-200 dark:border-dark-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white font-black text-sm">
              M
            </div>
            <div className="leading-none">
              <span className="font-bold text-slate-900 dark:text-white tracking-tight">MAVEN</span>
              <p className="text-[10px] text-slate-400 font-normal">Forensics</p>
            </div>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map(({ to, label }) => {
              const active = location.pathname === to
              return (
                <Link
                  key={to}
                  to={to}
                  className={clsx(
                    'relative px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                    active
                      ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-dark-surface'
                  )}
                >
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
              <Link to="/auth" className="btn-secondary text-sm py-2 px-4">
                Sign In
              </Link>
            )}
            {/* Mobile hamburger */}
            <button
              className="md:hidden p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-surface transition-colors"
              onClick={() => setMobileOpen(o => !o)}
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden overflow-hidden border-t border-slate-200 dark:border-dark-border"
          >
            <div className="px-4 py-3 space-y-1">
              {navLinks.map(({ to, label, icon: Icon }) => {
                const active = location.pathname === to
                return (
                  <Link
                    key={to}
                    to={to}
                    onClick={() => setMobileOpen(false)}
                    className={clsx(
                      'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors',
                      active
                        ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-dark-surface'
                    )}
                  >
                    <Icon size={16} /> {label}
                  </Link>
                )
              })}
              {!user && (
                <Link
                  to="/auth"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center justify-center btn-primary w-full mt-2"
                >
                  Sign In
                </Link>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  )
}
