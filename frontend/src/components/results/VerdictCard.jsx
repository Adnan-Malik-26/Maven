import { motion } from 'framer-motion'
import { AlertTriangle, CheckCircle, HelpCircle } from 'lucide-react'
import { clsx } from 'clsx'

const configs = {
  FAKE: {
    icon: AlertTriangle,
    label: 'LIKELY FAKE',
    prefix: '⚠',
    gradient: 'from-red-950/60 via-red-900/30 to-red-950/10 dark:from-red-950/80 dark:via-red-900/40 dark:to-red-950/20',
    border: 'border-red-500/40',
    glow: 'glow-red',
    text: 'text-red-400',
    sub: 'This video shows strong indicators of synthetic manipulation.',
    badge: 'bg-red-500',
  },
  REAL: {
    icon: CheckCircle,
    label: 'LIKELY REAL',
    prefix: '✓',
    gradient: 'from-green-950/60 via-green-900/30 to-green-950/10 dark:from-green-950/80 dark:via-green-900/40 dark:to-green-950/20',
    border: 'border-green-500/40',
    glow: 'glow-green',
    text: 'text-green-400',
    sub: 'No significant deepfake indicators detected.',
    badge: 'bg-green-500',
  },
  UNCERTAIN: {
    icon: HelpCircle,
    label: 'UNCERTAIN',
    prefix: '?',
    gradient: 'from-amber-950/60 via-amber-900/30 to-amber-950/10 dark:from-amber-950/80 dark:via-amber-900/40 dark:to-amber-950/20',
    border: 'border-amber-500/40',
    glow: 'glow-amber',
    text: 'text-amber-400',
    sub: 'Mixed signals detected. Manual review recommended.',
    badge: 'bg-amber-500',
  },
}

// Light mode overrides
const lightText = { FAKE: 'text-red-700', REAL: 'text-green-700', UNCERTAIN: 'text-amber-700' }
const lightGrad = {
  FAKE:      'from-red-50 to-red-100',
  REAL:      'from-green-50 to-green-100',
  UNCERTAIN: 'from-amber-50 to-amber-100',
}
const lightBorder = { FAKE: 'border-red-200', REAL: 'border-green-200', UNCERTAIN: 'border-amber-200' }

export default function VerdictCard({ verdict, confidence }) {
  const cfg = configs[verdict] ?? configs.UNCERTAIN

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 20 }}
      className={clsx(
        'relative overflow-hidden rounded-2xl border p-8 bg-gradient-to-br',
        cfg.gradient,
        cfg.border,
        cfg.glow,
        // light mode
        lightGrad[verdict],
        lightBorder[verdict],
      )}
    >
      {/* Decorative orb */}
      <div className={clsx('absolute -right-12 -top-12 w-48 h-48 rounded-full opacity-20 blur-3xl', cfg.badge)} />

      <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-6">
        {/* Icon */}
        <div className={clsx('w-16 h-16 rounded-2xl flex items-center justify-center shrink-0', cfg.badge, 'bg-opacity-20 dark:bg-opacity-30')}>
          <cfg.icon size={32} className={clsx(cfg.text, lightText[verdict])} />
        </div>

        {/* Text */}
        <div className="flex-1">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h2 className={clsx('text-3xl font-black tracking-tight', cfg.text, lightText[verdict])}>
              {cfg.prefix} {cfg.label}
            </h2>
            {confidence != null && (
              <span className={clsx('text-lg font-bold opacity-80', cfg.text, lightText[verdict])}>
                {(confidence * 100).toFixed(1)}% confidence
              </span>
            )}
          </div>
          <p className="mt-1 text-slate-500 dark:text-slate-400 text-sm leading-relaxed max-w-md">
            {cfg.sub}
          </p>
        </div>
      </div>
    </motion.div>
  )
}
