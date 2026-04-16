import React from 'react';
import { motion } from 'framer-motion';

/**
 * RppgChart — rPPG pulse visualization.
 * Shows "Coming Soon" overlay until the liveness microservice is implemented.
 */
export default function RppgChart() {
  // Generate a fake sinusoidal waveform just for the blurred preview
  const fakeWave = Array.from({ length: 80 }, (_, i) => {
    const y = 50 + 20 * Math.sin(i * 0.25) + 8 * Math.sin(i * 0.8) + 4 * Math.random();
    return y;
  });

  const pointsStr = fakeWave
    .map((y, i) => `${(i / 79) * 300},${y}`)
    .join(' ');

  return (
    <div className="relative rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
      {/* Blurred preview */}
      <div
        className="p-5 space-y-3"
        style={{ filter: 'blur(4px)', opacity: 0.3, pointerEvents: 'none', userSelect: 'none' }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-200">Remote Photoplethysmography</p>
            <p className="text-xs text-slate-500">Estimated heart-rate from skin color variation</p>
          </div>
          <span className="text-lg font-black font-mono text-emerald-400">73 BPM</span>
        </div>
        <svg viewBox="0 0 300 100" className="w-full h-24" preserveAspectRatio="none">
          <polyline
            points={pointsStr}
            fill="none"
            stroke="rgba(139,92,246,0.8)"
            strokeWidth="2"
          />
        </svg>
        <div className="grid grid-cols-3 gap-3 text-center">
          {['Heart Rate', 'Signal Quality', 'Pulse Present'].map((l) => (
            <div key={l} className="glass p-2 rounded-xl">
              <p className="text-sm font-bold font-mono text-white">—</p>
              <p className="text-xs text-slate-500 mt-0.5">{l}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Coming Soon overlay */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35 }}
        className="absolute inset-0 flex flex-col items-center justify-center gap-3"
        style={{ background: 'rgba(10,10,15,0.75)', backdropFilter: 'blur(2px)' }}
      >
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center"
          style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.25)' }}
        >
          <svg className="w-6 h-6 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-white font-bold">rPPG Pulse Analysis</p>
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
