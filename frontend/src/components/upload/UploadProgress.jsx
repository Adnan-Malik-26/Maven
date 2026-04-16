import React from 'react';
import { motion } from 'framer-motion';

const STAGES = [
  { key: 'uploading',   label: 'Uploading video',       icon: '📤', threshold: 0 },
  { key: 'processing',  label: 'Running FFT analysis',  icon: '🔬', threshold: 100 },
  { key: 'lipsync',     label: 'Checking lip-sync',     icon: '🎙️', threshold: 100 },
  { key: 'aggregating', label: 'Aggregating scores',    icon: '🧠', threshold: 100 },
];

export default function UploadProgress({ progress, status, jobId }) {
  //  progress 0-100 → uploading stage
  //  status 'PROCESSING' → processing stages
  //  status 'COMPLETED'  → done
  //  status 'FAILED'     → error

  const isUploading   = progress < 100;
  const isProcessing  = progress === 100 && status === 'PROCESSING';
  const isDone        = status === 'COMPLETED';
  const isFailed      = status === 'FAILED';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Main progress bar */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-sm font-semibold text-slate-200">
            {isDone   ? '✅ Analysis complete!' :
             isFailed ? '❌ Analysis failed' :
             isProcessing ? '🔄 Analysing video…' :
             '📤 Uploading…'}
          </span>
          {isUploading && (
            <span className="text-sm font-mono text-brand-400 font-bold">{progress}%</span>
          )}
        </div>

        <div className="h-2.5 bg-white/[0.06] rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{
              background: isFailed
                ? 'linear-gradient(90deg, #dc2626, #f87171)'
                : isDone
                ? 'linear-gradient(90deg, #059669, #34d399)'
                : 'linear-gradient(90deg, #7c3aed, #8b5cf6, #6d28d9)',
            }}
            animate={{ width: isDone ? '100%' : isFailed ? '100%' : isProcessing ? '75%' : `${progress}%` }}
            transition={{ duration: isProcessing ? 2 : 0.3, ease: isProcessing ? 'easeInOut' : 'linear' }}
          />
        </div>
      </div>

      {/* Stage indicators */}
      {!isFailed && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: '📤', label: 'Upload',     done: progress >= 100 },
            { icon: '🔬', label: 'FFT',        done: isDone },
            { icon: '🎙️', label: 'Lip-Sync',   done: isDone },
            { icon: '🧠', label: 'Aggregate',  done: isDone },
          ].map((stage, i) => {
            const active = (i === 0 && isUploading) || (i > 0 && isProcessing);
            return (
              <motion.div
                key={stage.label}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-300 ${
                  stage.done
                    ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                    : active
                    ? 'bg-brand-500/10 border border-brand-500/25 text-brand-300'
                    : 'bg-white/[0.03] border border-white/[0.06] text-slate-600'
                }`}
              >
                <span className="text-base leading-none">
                  {stage.done ? '✅' : active ? stage.icon : stage.icon}
                </span>
                <span>{stage.label}</span>
                {active && (
                  <motion.span
                    className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-400"
                    animate={{ opacity: [1, 0.2, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  />
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Job ID */}
      {jobId && (
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
          </svg>
          <span className="font-mono">Job ID: {jobId}</span>
        </div>
      )}
    </motion.div>
  );
}
