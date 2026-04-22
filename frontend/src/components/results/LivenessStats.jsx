import { motion } from 'framer-motion'
import { Heart, Eye } from 'lucide-react'
import { clsx } from 'clsx'

function StatCard({ icon: Icon, label, value, unit, status, statusColor, pulse, detail }) {
  return (
    <div className="card p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Icon size={15} className={clsx(pulse && 'animate-pulse', statusColor)} />
        {label}
      </div>
      <div className="flex items-baseline gap-1">
        <span className={clsx('text-4xl font-black font-mono tracking-tight', statusColor)}>
          {value ?? '—'}
        </span>
        {unit && <span className="text-sm text-slate-400 ml-1">{unit}</span>}
      </div>
      <div className={clsx('text-xs font-medium px-2 py-0.5 rounded-full inline-flex self-start', statusColor, 'bg-opacity-10')}>
        {status}
      </div>
      {detail && <p className="text-xs text-slate-400">{detail}</p>}
    </div>
  )
}

function BlinkRangeBar({ bpm, min = 15, max = 25 }) {
  const clamped = Math.min(Math.max(bpm, 0), 40)
  const pct     = ((clamped - 0) / 40) * 100
  const minPct  = (min / 40) * 100
  const maxPct  = (max / 40) * 100

  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Eye size={15} />
        Blink Rate
      </div>
      <div className="flex items-baseline gap-1">
        <span className={clsx(
          'text-4xl font-black font-mono tracking-tight',
          bpm >= min && bpm <= max ? 'text-green-500 dark:text-green-400' : 'text-red-500 dark:text-red-400'
        )}>
          {bpm != null ? bpm.toFixed(1) : '—'}
        </span>
        <span className="text-sm text-slate-400 ml-1">/ min</span>
      </div>

      {/* Range bar */}
      <div className="relative h-2 bg-slate-100 dark:bg-dark-surface rounded-full">
        {/* Normal zone */}
        <div
          className="absolute h-full bg-green-400/30 dark:bg-green-500/20 rounded-full"
          style={{ left: `${minPct}%`, width: `${maxPct - minPct}%` }}
        />
        {/* Indicator dot */}
        {bpm != null && (
          <motion.div
            initial={{ left: '50%' }}
            animate={{ left: `${pct}%` }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            className={clsx(
              'absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 border-white dark:border-dark-card',
              bpm >= min && bpm <= max ? 'bg-green-500' : 'bg-red-500'
            )}
          />
        )}
      </div>
      <div className="flex justify-between text-xs text-slate-400">
        <span>0</span>
        <span className="text-green-600 dark:text-green-500 font-medium">Normal {min}–{max}/min</span>
        <span>40</span>
      </div>
      <p className={clsx(
        'text-xs font-medium',
        bpm >= min && bpm <= max ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'
      )}>
        {bpm >= min && bpm <= max ? 'Normal blink rate' : 'Abnormal blink rate'}
      </p>
    </div>
  )
}

export default function LivenessStats({ rppg, blink }) {
  const bpm     = rppg?.estimated_hr_bpm
  const pulse   = rppg?.pulse_present
  const quality = rppg?.signal_quality

  const hrStatus = !pulse
    ? { label: 'Not detected', color: 'text-slate-400' }
    : bpm >= 60 && bpm <= 100
    ? { label: 'Normal range', color: 'text-green-600 dark:text-green-400' }
    : { label: 'Abnormal', color: 'text-red-500 dark:text-red-400' }

  return (
    <div className="card p-6 space-y-4">
      <h3 className="section-title text-lg">Physiological Signals</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard
          icon={Heart}
          label="Heart Rate (rPPG)"
          value={pulse && bpm ? Math.round(bpm) : '—'}
          unit="BPM"
          status={hrStatus.label}
          statusColor={hrStatus.color}
          pulse={!!pulse}
          detail={pulse && quality ? `Signal quality: ${(quality * 100).toFixed(0)}%` : 'No pulse signal detected in video'}
        />
        <BlinkRangeBar
          bpm={blink?.blink_rate_per_min ?? 0}
          min={blink?.normal_range?.[0] ?? 15}
          max={blink?.normal_range?.[1] ?? 25}
        />
      </div>
      {rppg?.frames_analyzed && (
        <p className="text-xs text-slate-400">
          rPPG analyzed {rppg.frames_analyzed} frames · Blink detected {blink?.blink_count ?? 0} events in {blink?.frames_analyzed ?? 0} frames
        </p>
      )}
    </div>
  )
}
