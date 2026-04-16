import React from 'react';
import { motion } from 'framer-motion';

const VERDICT_CONFIG = {
  FAKE: {
    label: 'FAKE',
    sub: 'Deepfake Detected',
    emoji: '🚨',
    bgClass: 'verdict-fake-bg',
    textClass: 'verdict-fake',
    gradientFrom: 'rgba(239,68,68,0.15)',
    gradientTo: 'transparent',
    border: 'rgba(239,68,68,0.3)',
    glow: 'rgba(239,68,68,0.2)',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    ),
  },
  REAL: {
    label: 'REAL',
    sub: 'Authentic Content',
    emoji: '✅',
    bgClass: 'verdict-real-bg',
    textClass: 'verdict-real',
    gradientFrom: 'rgba(16,185,129,0.12)',
    gradientTo: 'transparent',
    border: 'rgba(16,185,129,0.3)',
    glow: 'rgba(16,185,129,0.15)',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  UNCERTAIN: {
    label: 'UNCERTAIN',
    sub: 'Inconclusive Result',
    emoji: '⚠️',
    bgClass: 'verdict-uncertain-bg',
    textClass: 'verdict-uncertain',
    gradientFrom: 'rgba(245,158,11,0.12)',
    gradientTo: 'transparent',
    border: 'rgba(245,158,11,0.3)',
    glow: 'rgba(245,158,11,0.15)',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
      </svg>
    ),
  },
};

export default function VerdictCard({ verdict, confidence }) {
  const cfg = VERDICT_CONFIG[verdict] ?? VERDICT_CONFIG.UNCERTAIN;
  const pct = confidence != null ? Math.round(confidence * 100) : null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="relative overflow-hidden rounded-2xl border p-8"
      style={{
        background: `radial-gradient(ellipse at 30% 0%, ${cfg.gradientFrom}, ${cfg.gradientTo} 70%), rgba(255,255,255,0.03)`,
        borderColor: cfg.border,
        boxShadow: `0 0 60px ${cfg.glow}, 0 20px 40px rgba(0,0,0,0.4)`,
      }}
    >
      {/* Background hex pattern */}
      <div className="absolute inset-0 hex-pattern opacity-30 pointer-events-none" />

      <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-6">
        {/* Icon */}
        <motion.div
          initial={{ rotate: -10, opacity: 0 }}
          animate={{ rotate: 0, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className={`w-20 h-20 rounded-2xl border flex items-center justify-center shrink-0 ${cfg.bgClass}`}
          style={{ borderColor: cfg.border }}
        >
          <div className={`w-10 h-10 ${cfg.textClass}`}>{cfg.icon}</div>
        </motion.div>

        {/* Text */}
        <div className="flex-1">
          <p className="label-sm mb-1">Analysis Verdict</p>
          <motion.h2
            initial={{ x: -10, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.15, duration: 0.4 }}
            className={`text-5xl font-black tracking-tight font-mono ${cfg.textClass}`}
          >
            {cfg.label}
          </motion.h2>
          <p className="text-slate-400 mt-1 text-sm">{cfg.sub}</p>
        </div>

        {/* Confidence gauge */}
        {pct != null && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="shrink-0 text-center"
          >
            <div className="relative w-24 h-24">
              <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
                <circle cx="48" cy="48" r="38" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
                <motion.circle
                  cx="48" cy="48" r="38"
                  fill="none"
                  stroke={cfg.textClass === 'verdict-fake' ? '#f87171' : cfg.textClass === 'verdict-real' ? '#34d399' : '#fbbf24'}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 38}`}
                  initial={{ strokeDashoffset: 2 * Math.PI * 38 }}
                  animate={{ strokeDashoffset: 2 * Math.PI * 38 * (1 - pct / 100) }}
                  transition={{ delay: 0.4, duration: 1, ease: 'easeOut' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-2xl font-black font-mono ${cfg.textClass}`}>{pct}%</span>
                <span className="text-[9px] text-slate-500 uppercase tracking-wider">confidence</span>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
