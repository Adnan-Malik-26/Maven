import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import Alert from '../components/common/Alert';
import { MavenSpinner } from '../components/common/Loader';

function Input({ label, id, type = 'text', value, onChange, placeholder, autoComplete }) {
  const [show, setShow] = useState(false);
  const isPassword = type === 'password';

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-semibold text-slate-400">{label}</label>
      <div className="relative">
        <input
          id={id}
          type={isPassword && show ? 'text' : type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="input-field"
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
          >
            {show ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Login form ───────────────────────────────────────────────────────────────
function LoginForm({ onSuccess, onSwitch }) {
  const { login } = useAuth();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Alert type="error" message={error} />
      <Input label="Email address" id="login-email" type="email" value={email}
        onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
      <Input label="Password" id="login-password" type="password" value={password}
        onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />

      <div className="text-right">
        <Link to="/auth?tab=reset" className="text-xs text-slate-500 hover:text-brand-400 transition-colors">
          Forgot password?
        </Link>
      </div>

      <button type="submit" disabled={loading || !email || !password} className="btn-primary w-full py-3">
        {loading ? <MavenSpinner size={18} /> : 'Sign in'}
      </button>

      <p className="text-center text-sm text-slate-500">
        Don't have an account?{' '}
        <button type="button" onClick={onSwitch} className="text-brand-400 hover:text-brand-300 font-medium">
          Create account
        </button>
      </p>
    </form>
  );
}

// ─── Signup form ──────────────────────────────────────────────────────────────
function SignupForm({ onSuccess, onSwitch }) {
  const { signup } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [info,      setInfo]      = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setInfo('');
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setLoading(true);
    try {
      const { session } = await signup(email, password, firstName, lastName);
      if (session) {
        onSuccess();
      } else {
        setInfo('Account created! Please check your email to confirm before signing in.');
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Alert type="error"   message={error} />
      <Alert type="success" message={info} />
      <div className="grid grid-cols-2 gap-3">
        <Input label="First name" id="signup-first" type="text" value={firstName}
          onChange={(e) => setFirstName(e.target.value)} placeholder="Ada" autoComplete="given-name" />
        <Input label="Last name" id="signup-last" type="text" value={lastName}
          onChange={(e) => setLastName(e.target.value)} placeholder="Lovelace" autoComplete="family-name" />
      </div>
      <Input label="Email address" id="signup-email" type="email" value={email}
        onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
      <Input label="Password" id="signup-password" type="password" value={password}
        onChange={(e) => setPassword(e.target.value)} placeholder="min. 6 characters" autoComplete="new-password" />

      <button type="submit" disabled={loading || !email || !password || !firstName} className="btn-primary w-full py-3">
        {loading ? <MavenSpinner size={18} /> : 'Create account'}
      </button>

      <p className="text-center text-sm text-slate-500">
        Already have an account?{' '}
        <button type="button" onClick={onSwitch} className="text-brand-400 hover:text-brand-300 font-medium">
          Sign in
        </button>
      </p>
    </form>
  );
}

// ─── Reset password form ──────────────────────────────────────────────────────
function ResetForm({ onBack }) {
  const { resetPassword } = useAuth();
  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await resetPassword(email);
      setSent(true);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Alert type="error" message={error} />
      {sent ? (
        <Alert type="success" message={`Password reset link sent to ${email}. Check your inbox.`} />
      ) : (
        <Input label="Email address" id="reset-email" type="email" value={email}
          onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
      )}
      {!sent && (
        <button type="submit" disabled={loading || !email} className="btn-primary w-full py-3">
          {loading ? <MavenSpinner size={18} /> : 'Send reset link'}
        </button>
      )}
      <p className="text-center">
        <button type="button" onClick={onBack} className="text-xs text-slate-500 hover:text-brand-400 transition-colors">
          ← Back to sign in
        </button>
      </p>
    </form>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function Auth() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location   = useLocation();
  const navigate   = useNavigate();
  const { isAuthenticated } = useAuth();

  const tab = searchParams.get('tab') ?? 'login';

  const setTab = (t) => setSearchParams({ tab: t }, { replace: true });

  // Redirect if already logged in
  useEffect(() => {
    if (isAuthenticated) {
      const from = location.state?.from?.pathname ?? '/dashboard';
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, location]);

  const handleSuccess = () => {
    const from = location.state?.from?.pathname ?? '/dashboard';
    navigate(from, { replace: true });
  };

  return (
    <div className="min-h-[calc(100vh-56px)] flex items-center justify-center px-4 py-16">
      {/* Ambient glow */}
      <div
        className="fixed top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, rgba(139,92,246,0.08) 0%, transparent 70%)', filter: 'blur(60px)' }}
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2.5 mb-6">
            <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                  d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
              </svg>
            </div>
            <span className="font-black text-xl tracking-widest uppercase">MAVEN</span>
          </Link>
          <h1 className="text-2xl font-bold text-white">
            {tab === 'signup' ? 'Create your account' :
             tab === 'reset'  ? 'Reset your password' :
             'Welcome back'}
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {tab === 'signup' ? 'Start detecting deepfakes for free' :
             tab === 'reset'  ? "We'll send you a recovery link" :
             'Sign in to continue to MAVEN'}
          </p>
        </div>

        {/* Card */}
        <div className="glass p-7 space-y-6">
          {/* Tab switcher (login / signup only) */}
          {tab !== 'reset' && (
            <div className="flex rounded-xl p-1" style={{ background: 'rgba(255,255,255,0.04)' }}>
              {[['login', 'Sign in'], ['signup', 'Create account']].map(([t, l]) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                    tab === t ? 'bg-brand-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          )}

          {/* Forms */}
          <AnimatePresence mode="wait">
            {tab === 'login' && (
              <motion.div key="login"
                initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.2 }}>
                <LoginForm onSuccess={handleSuccess} onSwitch={() => setTab('signup')} />
              </motion.div>
            )}
            {tab === 'signup' && (
              <motion.div key="signup"
                initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.2 }}>
                <SignupForm onSuccess={handleSuccess} onSwitch={() => setTab('login')} />
              </motion.div>
            )}
            {tab === 'reset' && (
              <motion.div key="reset"
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
                <ResetForm onBack={() => setTab('login')} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
