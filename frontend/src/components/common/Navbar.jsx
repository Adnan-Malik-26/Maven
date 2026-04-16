import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';

const NAV_LINKS = [
  { label: 'Dashboard', to: '/dashboard' },
  { label: 'Analyse', to: '/upload' },
];

export default function Navbar() {
  const { isAuthenticated, user, logout } = useAuth();
  const location  = useLocation();
  const navigate  = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    await logout();
    navigate('/');
    setLoggingOut(false);
  };

  const initials = user
    ? `${user.user_metadata?.first_name?.[0] ?? user.email?.[0] ?? '?'}`.toUpperCase()
    : '?';

  return (
    <nav className="sticky top-0 z-40 w-full">
      <div
        className="w-full border-b"
        style={{
          background: 'rgba(10,10,15,0.85)',
          backdropFilter: 'blur(20px)',
          borderColor: 'rgba(255,255,255,0.06)',
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">

            {/* Logo */}
            <Link to="/" className="flex items-center gap-2.5 group">
              <div className="relative">
                <div className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                      d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
                  </svg>
                </div>
                <div className="absolute inset-0 rounded-lg bg-brand-500 opacity-0 group-hover:opacity-30 blur-md transition-opacity" />
              </div>
              <span className="font-bold text-sm tracking-widest text-white uppercase">MAVEN</span>
            </Link>

            {/* Desktop nav */}
            {isAuthenticated && (
              <div className="hidden md:flex items-center gap-1">
                {NAV_LINKS.map(({ label, to }) => {
                  const active = location.pathname === to;
                  return (
                    <Link
                      key={to}
                      to={to}
                      className={`btn-ghost text-sm ${active ? 'text-white bg-white/[0.07]' : ''}`}
                    >
                      {label}
                    </Link>
                  );
                })}
              </div>
            )}

            {/* Right side */}
            <div className="flex items-center gap-3">
              {isAuthenticated ? (
                <>
                  {/* Avatar */}
                  <button
                    onClick={() => setMenuOpen((v) => !v)}
                    className="relative w-8 h-8 rounded-full bg-brand-700 flex items-center justify-center text-white text-xs font-bold border border-brand-500/30 hover:border-brand-400/50 transition-colors"
                  >
                    {initials}
                  </button>

                  {/* Dropdown */}
                  <AnimatePresence>
                    {menuOpen && (
                      <>
                        <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                        <motion.div
                          initial={{ opacity: 0, y: -6, scale: 0.96 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -6, scale: 0.96 }}
                          transition={{ duration: 0.15 }}
                          className="absolute right-4 top-12 z-40 w-48 glass rounded-xl py-1 shadow-2xl"
                        >
                          <div className="px-3 py-2 border-b border-white/[0.06]">
                            <p className="text-xs text-slate-400 truncate">{user?.email}</p>
                          </div>
                          {NAV_LINKS.map(({ label, to }) => (
                            <Link
                              key={to}
                              to={to}
                              onClick={() => setMenuOpen(false)}
                              className="block px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-white/[0.05] transition-colors"
                            >
                              {label}
                            </Link>
                          ))}
                          <div className="border-t border-white/[0.06] mt-1 pt-1">
                            <button
                              disabled={loggingOut}
                              onClick={handleLogout}
                              className="w-full text-left px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                            >
                              {loggingOut ? 'Signing out…' : 'Sign out'}
                            </button>
                          </div>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </>
              ) : (
                <>
                  <Link to="/auth" className="btn-ghost text-sm">Sign in</Link>
                  <Link to="/auth?tab=signup" className="btn-primary text-sm py-1.5 px-4">Get started</Link>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
