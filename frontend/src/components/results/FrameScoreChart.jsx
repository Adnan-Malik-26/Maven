import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'

const THRESHOLD = 0.55

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="card px-3 py-2 text-xs shadow-lg">
      <p className="text-slate-500">Frame {label}</p>
      <p className="font-semibold text-slate-900 dark:text-slate-50">
        Score: {(payload[0].value * 100).toFixed(1)}%
      </p>
    </div>
  )
}

export default function FrameScoreChart({ frameScores }) {
  if (!frameScores?.length) return null

  const data = frameScores.slice(0, 300).map((v, i) => ({ frame: i, score: v }))

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="section-title text-lg">Per-Frame Artifact Score</h3>
        <span className="text-xs text-slate-400">{data.length} frames</span>
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#EF4444" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#EF4444" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-100 dark:text-dark-border" opacity={0.5} />
            <XAxis dataKey="frame" tick={{ fontSize: 10 }} stroke="currentColor" className="text-slate-300 dark:text-slate-600" />
            <YAxis domain={[0, 1]} tick={{ fontSize: 10 }} stroke="currentColor" className="text-slate-300 dark:text-slate-600" />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine
              y={THRESHOLD}
              stroke="#EF4444"
              strokeDasharray="4 3"
              strokeWidth={1.5}
              label={{ value: 'Threshold', fontSize: 10, fill: '#EF4444', position: 'right' }}
            />
            <Area
              type="monotone"
              dataKey="score"
              stroke="#EF4444"
              strokeWidth={1.5}
              fill="url(#scoreGrad)"
              dot={false}
              isAnimationActive
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-slate-400">
        Frames above the red threshold ({(THRESHOLD * 100).toFixed(0)}%) show high-frequency anomalies consistent with GAN/diffusion artifacts.
      </p>
    </div>
  )
}
