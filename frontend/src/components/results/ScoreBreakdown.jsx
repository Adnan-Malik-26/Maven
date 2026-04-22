import { motion } from 'framer-motion'
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, Tooltip } from 'recharts'
import { clsx } from 'clsx'

function ScoreBar({ label, icon: Icon, score, description }) {
  const pct   = Math.round(score * 100)
  const color = score > 0.6 ? 'bg-green-500' : score > 0.4 ? 'bg-amber-500' : 'bg-red-500'
  const textColor = score > 0.6 ? 'text-green-600 dark:text-green-400' : score > 0.4 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'
  const verdict = score > 0.6 ? 'Authentic' : score > 0.4 ? 'Uncertain' : 'Suspicious'

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon size={15} className="text-slate-400" />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={clsx('text-xs font-semibold', textColor)}>{verdict}</span>
          <span className="text-sm font-mono font-bold text-slate-900 dark:text-slate-50">{pct}%</span>
        </div>
      </div>
      <div className="h-2 bg-slate-100 dark:bg-dark-surface rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 }}
          className={clsx('h-full rounded-full', color)}
        />
      </div>
      {description && (
        <p className="text-xs text-slate-400">{description}</p>
      )}
    </div>
  )
}

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="card px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-slate-900 dark:text-slate-50">{payload[0].payload.axis}</p>
      <p className="text-blue-500">{payload[0].value}/100</p>
    </div>
  )
}

export default function ScoreBreakdown({ result, layers }) {
  const radarData = [
    { axis: 'FFT',       value: Math.round((1 - (result.fft_score ?? 0)) * 100) },
    { axis: 'Liveness',  value: Math.round((result.liveness_score ?? 0) * 100) },
    { axis: 'Lip Sync',  value: Math.round((result.sync_score ?? 0) * 100) },
  ]

  return (
    <div className="space-y-6">
      {/* Score bars */}
      <div className="card p-6 space-y-5">
        <h3 className="section-title text-lg">Detection Layer Analysis</h3>
        <div className="space-y-5">
          {layers.map(l => (
            <ScoreBar key={l.label} {...l} />
          ))}
        </div>
      </div>

      {/* Radar chart */}
      <div className="card p-6">
        <h3 className="section-title text-lg mb-4">Forensic Radar</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} outerRadius="75%">
              <PolarGrid stroke="currentColor" className="text-slate-200 dark:text-dark-border" />
              <PolarAngleAxis
                dataKey="axis"
                tick={{ fontSize: 12, fill: 'currentColor', className: 'text-slate-500' }}
              />
              <Radar
                dataKey="value"
                stroke="#3B82F6"
                fill="#3B82F6"
                fillOpacity={0.18}
                strokeWidth={2}
              />
              <Tooltip content={<CustomTooltip />} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
