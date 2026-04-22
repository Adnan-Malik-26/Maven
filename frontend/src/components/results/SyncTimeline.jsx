import { useRef, useState } from 'react'
import { clsx } from 'clsx'

export default function SyncTimeline({ segments, totalDuration }) {
  const [tooltip, setTooltip] = useState(null)
  const barRef = useRef(null)

  if (!segments?.length) return null

  const duration = totalDuration || Math.max(...segments.map(s => s.end_sec), 10)

  const toPercent = (sec) => ((sec / duration) * 100).toFixed(2) + '%'

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="section-title text-lg">Lip-Sync Timeline</h3>
        <span className="text-xs text-red-500 dark:text-red-400 font-medium">
          {segments.length} flagged segment{segments.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="space-y-2">
        {/* Track */}
        <div
          ref={barRef}
          className="relative w-full h-7 bg-green-100 dark:bg-green-500/10 rounded-lg overflow-hidden cursor-crosshair"
        >
          {/* Flagged (red) segments */}
          {segments.map((seg, i) => (
            <div
              key={i}
              className="absolute top-0 h-full bg-red-400/70 dark:bg-red-500/60 rounded-sm transition-opacity hover:opacity-100 opacity-80"
              style={{ left: toPercent(seg.start_sec), width: toPercent(seg.end_sec - seg.start_sec) }}
              onMouseEnter={(e) => {
                const rect = barRef.current?.getBoundingClientRect()
                setTooltip({ seg, x: e.clientX - (rect?.left ?? 0), y: -40 })
              }}
              onMouseLeave={() => setTooltip(null)}
            />
          ))}

          {/* Tooltip */}
          {tooltip && (
            <div
              className="absolute z-10 bg-slate-900 dark:bg-slate-800 text-white text-xs rounded-lg px-2.5 py-1.5 pointer-events-none whitespace-nowrap shadow-lg"
              style={{ left: tooltip.x, top: 0, transform: 'translateX(-50%) translateY(-110%)' }}
            >
              {tooltip.seg.start_sec.toFixed(1)}s – {tooltip.seg.end_sec.toFixed(1)}s
              <br />Score: {(tooltip.seg.score * 100).toFixed(1)}%
            </div>
          )}
        </div>

        {/* Time labels */}
        <div className="flex justify-between text-xs text-slate-400 font-mono px-0.5">
          <span>0s</span>
          <span>{(duration / 4).toFixed(0)}s</span>
          <span>{(duration / 2).toFixed(0)}s</span>
          <span>{(duration * 0.75).toFixed(0)}s</span>
          <span>{duration.toFixed(0)}s</span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-green-400 dark:bg-green-500/60 inline-block" /> In-sync
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-red-400 dark:bg-red-500/60 inline-block" /> Out-of-sync
        </span>
      </div>
    </div>
  )
}
