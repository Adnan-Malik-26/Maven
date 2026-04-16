import React from 'react';
import { motion } from 'framer-motion';

/**
 * BlinkStats — Liveness Service section.
 * Shows "Coming Soon" overlay until the liveness microservice is implemented.
 */
export default function BlinkStats() {
  return (
    <div className="relative rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
      {/* Blurred preview content */}
      <div
        className="p-5 space-y-4"
        style={{ filter: 'blur(4px)', opacity: 0.3, pointerEvents: 'none', userSelect: 'none' }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-200">Eye Blink Analysis</p>
            <p className="text-xs text-slate-500">Blink regularity vs physiological norms</p>
          </div>
          <span className="text-lg font-black font-mono text-emerald-400">72%</span>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          {['Blink Rate', 'Regularity', 'Normal Range'].map((l) => (
            <div key={l} className="glass p-3 rounded-xl">
              <p className="text-xl font-bold font-mono text-white">—</p>
              <p className="text-xs text-slate-500 mt-1">{l}</p>
            </div>
          ))}
        </div>
        <div className="h-16 bg-white/[0.04] rounded-xl" />
      </div>

      {/* Coming Soon overlay */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="absolute inset-0 flex flex-col items-center justify-center gap-3"
        style={{ background: 'rgba(10,10,15,0.75)', backdropFilter: 'blur(2px)' }}
      >
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center"
          style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.25)' }}
        >
          <svg className="w-6 h-6 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-white font-bold">Blink Analysis</p>
          <p className="text-slate-500 text-xs mt-1">Liveness service — coming soon</p>
        </div>
        <span
          className="px-3 py-1 rounded-full text-xs font-semibold"
          style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.25)', color: '#a78bfa' }}
        >
          In Development
        </span>
      </motion.div>
    </div>
  );
}
