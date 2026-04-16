import React from 'react';
import { motion } from 'framer-motion';

function FlaggedSegment({ seg, index, totalDuration }) {
  const startPct = totalDuration ? (seg.start_sec / totalDuration) * 100 : 0;
  const widthPct = totalDuration ? ((seg.end_sec - seg.start_sec) / totalDuration) * 100 : 5;
  const fakeScore = typeof seg.score === 'number' ? seg.score : 1 - (seg.sync_score ?? 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      className="flex items-center gap-3 text-xs"
    >
      <span className="font-mono text-slate-400 w-20 shrink-0">
        {seg.start_sec?.toFixed(1)}s – {seg.end_sec?.toFixed(1)}s
      </span>
      <div className="flex-1 h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.min(Math.round(fakeScore * 100), 100)}%`,
            background: 'linear-gradient(90deg, #fb923c, #ef4444)',
          }}
        />
      </div>
      <span className="font-mono text-red-400 w-10 text-right">
        {Math.round((1 - (seg.sync_score ?? seg.score ?? 0)) * 100)}%
      </span>
    </motion.div>
  );
}

export default function SyncTimeline({ lipsyncResult }) {
  if (!lipsyncResult) return null;

  const { sync_score, verdict, flagged_segments = [] } = lipsyncResult;
  const syncPct = sync_score != null ? Math.round(sync_score * 100) : null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="text-sm font-bold text-slate-200">Lip-Sync Timeline</h4>
          <p className="text-xs text-slate-500 mt-0.5">
            Audio-visual phoneme alignment across the video
          </p>
        </div>
        {syncPct != null && (
          <div className="text-right shrink-0">
            <p className={`text-xl font-black font-mono ${syncPct >= 52 ? 'text-emerald-400' : 'text-red-400'}`}>
              {syncPct}%
            </p>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">sync score</p>
          </div>
        )}
      </div>

      {/* Overall sync bar */}
      {syncPct != null && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-slate-500">
            <span>Sync strength</span>
            <span>{verdict ?? (syncPct >= 52 ? 'IN SYNC' : 'OUT OF SYNC')}</span>
          </div>
          <div className="h-2.5 bg-white/[0.04] rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{
                background: syncPct >= 52
                  ? 'linear-gradient(90deg, #059669, #34d399)'
                  : 'linear-gradient(90deg, #dc2626, #f87171)',
              }}
              initial={{ width: 0 }}
              animate={{ width: `${syncPct}%` }}
              transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
            />
          </div>
        </div>
      )}

      {/* Flagged segments */}
      {flagged_segments.length > 0 && (
        <div className="space-y-3">
          <p className="label-sm">Flagged Segments ({flagged_segments.length})</p>
          <div className="space-y-2.5 max-h-48 overflow-y-auto">
            {flagged_segments.map((seg, i) => (
              <FlaggedSegment
                key={i}
                seg={seg}
                index={i}
                totalDuration={flagged_segments[flagged_segments.length - 1]?.end_sec}
              />
            ))}
          </div>
        </div>
      )}

      {flagged_segments.length === 0 && (
        <div
          className="flex items-center gap-2.5 px-4 py-3 rounded-xl"
          style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }}
        >
          <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <p className="text-sm text-emerald-400">No flagged segments — audio and lip movement appear consistent.</p>
        </div>
      )}
    </div>
  );
}
