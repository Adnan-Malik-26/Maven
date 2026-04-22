import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, Lock, Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-react'
import { clsx } from 'clsx'
import { supabase } from '../lib/supabaseClient'

function PasswordStrength({ password }) {
  const score = [/.{8,}/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/]
    .filter(r => r.test(password)).length
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong']
  const colors = ['', 'bg-red-500', 'bg-amber-500', 'bg-blue-500', 'bg-green-500']
  if (!password) return null
  return (
    <div className="space-y-1 mt-1">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className={clsx('h-1 flex-1 rounded-full transition-all duration-300', i <= score ? colors[score] : 'bg-slate-200 dark:bg-dark-border')} />
        ))}
      </div>
      <p className="text-xs text-slate-400">{labels[score]}</p>
    </div>
  )
}

export default function Auth() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from?.pathname || '/dashboard'

  const [tab,     setTab]     = useState('signin')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [success, setSuccess] = useState('')
  const [showPw,  setShowPw]  = useState(false)
  const [forgot,  setForgot]  = useState(false)

  const [form, setForm] = useState({ email: '', password: '', confirm: '' })
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSignIn = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.email || !form.password) return setError('Please fill in all fields.')
    setLoading(true)
    const { error: err } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password })
    setLoading(false)
    if (err) return setError(err.message)
    navigate(from, { replace: true })
  }

  const handleSignUp = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.email || !form.password) return setError('Please fill in all fields.')
    if (form.password !== form.confirm) return setError('Passwords do not match.')
    if (form.password.length < 6) return setError('Password must be at least 6 characters.')
    setLoading(true)
    const { error: err } = await supabase.auth.signUp({ email: form.email, password: form.password })
    setLoading(false)
    if (err) return setError(err.message)
    setSuccess('Check your email for a confirmation link!')
  }

  const handleReset = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.email) return setError('Please enter your email.')
    setLoading(true)
    const { error: err } = await supabase.auth.resetPasswordForEmail(form.email, {
      redirectTo: `${window.location.origin}/auth`,
    })
    setLoading(false)
    if (err) return setError(err.message)
    setSuccess('Password reset link sent to your email.')
  }

  const handleGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${from}` },
    })
  }

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4 py-12 relative overflow-hidden">
      {/* Background orbs */}
      <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full bg-blue-500/10 dark:bg-blue-600/8 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-80 h-80 rounded-full bg-violet-500/10 dark:bg-violet-600/8 blur-[100px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative w-full max-w-md"
      >
        {/* Logo mark */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white font-black text-xl mx-auto mb-3">M</div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Welcome to MAVEN</h1>
          <p className="text-sm text-slate-500 mt-1">Deepfake forensics platform</p>
        </div>

        <div className="card-glass dark:card-glass bg-white dark:bg-dark-card/80 border border-slate-200 dark:border-dark-border rounded-2xl p-8 shadow-xl backdrop-blur-xl">

          {/* Tabs */}
          {!forgot && (
            <div className="flex relative mb-8 bg-slate-100 dark:bg-dark-surface rounded-xl p-1">
              {['signin', 'signup'].map(t => (
                <button
                  key={t}
                  onClick={() => { setTab(t); setError(''); setSuccess('') }}
                  className={clsx(
                    'flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 relative z-10',
                    tab === t ? 'text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  )}
                >
                  {t === 'signin' ? 'Sign In' : 'Sign Up'}
                  {tab === t && (
                    <motion.div
                      layoutId="tab-bg"
                      className="absolute inset-0 bg-white dark:bg-dark-card rounded-lg shadow-sm -z-10"
                    />
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Success */}
          <AnimatePresence>
            {success && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-2 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 rounded-xl px-4 py-3 text-sm mb-4"
              >
                <CheckCircle size={15} /> {success}
              </motion.div>
            )}
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-2 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl px-4 py-3 text-sm mb-4"
              >
                <AlertCircle size={15} /> {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Forgot Password */}
          {forgot ? (
            <form onSubmit={handleReset} className="space-y-4">
              <div>
                <h2 className="text-lg font-bold mb-1 text-slate-900 dark:text-white">Reset Password</h2>
                <p className="text-sm text-slate-500 mb-4">Enter your email and we'll send a reset link.</p>
                <div className="relative">
                  <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="email" placeholder="Email" value={form.email} onChange={set('email')} className="input pl-10" />
                </div>
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? 'Sending…' : 'Send Reset Link'}
              </button>
              <button type="button" onClick={() => { setForgot(false); setError(''); setSuccess('') }} className="btn-ghost w-full text-sm">
                Back to Sign In
              </button>
            </form>
          ) : tab === 'signin' ? (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="relative">
                <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="email" placeholder="Email" value={form.email} onChange={set('email')} className="input pl-10" />
              </div>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type={showPw ? 'text' : 'password'} placeholder="Password" value={form.password} onChange={set('password')} className="input pl-10 pr-10" />
                <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <div className="flex justify-end">
                <button type="button" onClick={() => { setForgot(true); setError(''); setSuccess('') }} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
                  Forgot password?
                </button>
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
              <div className="relative flex items-center gap-3 my-2">
                <div className="flex-1 h-px bg-slate-200 dark:bg-dark-border" />
                <span className="text-xs text-slate-400">or</span>
                <div className="flex-1 h-px bg-slate-200 dark:bg-dark-border" />
              </div>
              <button type="button" onClick={handleGoogle} className="btn-secondary w-full gap-3">
                <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Continue with Google
              </button>
            </form>
          ) : (
            <form onSubmit={handleSignUp} className="space-y-4">
              <div className="relative">
                <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="email" placeholder="Email" value={form.email} onChange={set('email')} className="input pl-10" />
              </div>
              <div>
                <div className="relative">
                  <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type={showPw ? 'text' : 'password'} placeholder="Password" value={form.password} onChange={set('password')} className="input pl-10 pr-10" />
                  <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                <PasswordStrength password={form.password} />
              </div>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="password" placeholder="Confirm password" value={form.confirm} onChange={set('confirm')} className="input pl-10" />
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? 'Creating account…' : 'Create Account'}
              </button>
              <div className="relative flex items-center gap-3 my-2">
                <div className="flex-1 h-px bg-slate-200 dark:bg-dark-border" />
                <span className="text-xs text-slate-400">or</span>
                <div className="flex-1 h-px bg-slate-200 dark:bg-dark-border" />
              </div>
              <button type="button" onClick={handleGoogle} className="btn-secondary w-full gap-3">
                <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Continue with Google
              </button>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  )
}
