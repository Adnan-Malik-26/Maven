import React from 'react';
import { motion } from 'framer-motion';
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer,
  Tooltip, BarChart, Bar, XAxis, YAxis, Cell,
} from 'recharts';

function ScoreBar({ label, value, description, color, delay = 0 }) {
  const pct = value != null ? Math.round(value * 100) : null;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.4 }}
      className="space-y-2"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-200">{label}</p>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
        {pct != null ? (
          <span className="text-sm font-bold font-mono" style={{ color }}>
            {pct}%
          </span>
        ) : (
          <span className="text-xs text-slate-600 italic">Unavailable</span>
        )}
      </div>
      <div className="h-2 bg-white/[0.04] rounded-full overflow-hidden">
        {pct != null && (
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: color }}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ delay: delay + 0.1, duration: 0.8, ease: 'easeOut' }}
          />
        )}
      </div>
    </motion.div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload?.length) {
    return (
      <div className="glass px-3 py-2 text-sm">
        <p className="text-slate-400 text-xs mb-1">{label}</p>
        <p className="text-white font-semibold">{Math.round(payload[0].value * 100)}% fake probability</p>
      </div>
    );
  }
  return null;
};

export default function ScoreBreakdown({ breakdown }) {
  if (!breakdown) return null;

  const { fft, liveness, lipsync, finalFakeProbability } = breakdown;

  // Bar chart data
  const barData = [
    {
      name: 'FFT',
      value: fft?.unifiedFakeProb ?? null,
      color: '#f87171',
      description: 'Frequency artifacts',
    },
    {
      name: 'Lip Sync',
      value: lipsync?.unifiedFakeProb ?? null,
      color: '#fb923c',
      description: 'AV consistency',
    },
    {
      name: 'Liveness',
      value: liveness?.unifiedFakeProb ?? null,
      color: '#a78bfa',
      description: 'rPPG + blink',
    },
  ].filter((d) => d.value != null);

  // Radar chart data
  const radarData = [
    { subject: 'FFT',      value: Math.round((fft?.unifiedFakeProb ?? 0) * 100) },
    { subject: 'Lip Sync', value: Math.round((lipsync?.unifiedFakeProb ?? 0) * 100) },
    { subject: 'Liveness', value: Math.round((liveness?.unifiedFakeProb ?? 0) * 100) },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-bold text-slate-100 mb-1">Score Breakdown</h3>
        <p className="text-xs text-slate-500">
          Weighted scores from each detection layer (FFT 30%, Liveness 40%, Lip-sync 30%)
        </p>
      </div>

      {/* Score bars */}
      <div className="space-y-5">
        <ScoreBar
          label="FFT Analysis"
          description="High-frequency GAN/diffusion artifact probability"
          value={fft?.unifiedFakeProb}
          color="#f87171"
          delay={0}
        />
        <ScoreBar
          label="Lip-Sync Consistency"
          description="Audio-visual phoneme mismatch probability"
          value={lipsync?.unifiedFakeProb}
          color="#fb923c"
          delay={0.1}
        />
        <ScoreBar
          label="Liveness Detection"
          description="Physiological signal absence probability"
          value={liveness?.unifiedFakeProb}
          color="#a78bfa"
          delay={0.2}
        />
      </div>

      <div className="divider" />

      {/* Charts row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* Bar chart */}
        {barData.length > 0 && (
          <div>
            <p className="label-sm mb-3">Fake Probability by Layer</p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={barData} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}
                barCategoryGap="30%">
                <XAxis
                  dataKey="name"
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 1]}
                  tick={{ fill: '#334155', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${Math.round(v * 100)}%`}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {barData.map((d) => (
                    <Cell key={d.name} fill={d.color} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Radar chart */}
        <div>
          <p className="label-sm mb-3">Detection Radar</p>
          <ResponsiveContainer width="100%" height={160}>
            <RadarChart data={radarData} margin={{ top: 4, right: 20, bottom: 4, left: 20 }}>
              <PolarGrid stroke="rgba(255,255,255,0.06)" />
              <PolarAngleAxis
                dataKey="subject"
                tick={{ fill: '#64748b', fontSize: 10 }}
              />
              <Radar
                name="Fake prob"
                dataKey="value"
                stroke="#8b5cf6"
                fill="#8b5cf6"
                fillOpacity={0.25}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Final weighted score */}
      {finalFakeProbability != null && (
        <div
          className="flex items-center justify-between px-4 py-3 rounded-xl"
          style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}
        >
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider">Weighted Composite Score</p>
            <p className="text-xs text-slate-600 mt-0.5">FFT×0.30 + Liveness×0.40 + LipSync×0.30</p>
          </div>
          <span className="text-2xl font-black font-mono text-brand-400">
            {Math.round(finalFakeProbability * 100)}%
          </span>
        </div>
      )}
    </div>
  );
}
